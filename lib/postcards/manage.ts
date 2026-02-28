import { LocationStatus, PostcardEditAction, PostcardType, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { findPostcardCropSource, recropPostcardAndUpload } from '@/lib/postcards/crop-service';
import {
  postcardEditSelect,
  toEditSnapshot,
  toNullableText,
  type EditablePostcard
} from '@/lib/postcards/edit-history';
import { reverseGeocodeCoordinates } from '@/lib/reverse-geocode';
import { deriveOriginalImageUrl } from '@/lib/postcards/shared';
import { prisma } from '@/lib/prisma';

export const cropUpdateSchema = z.object({
  crop: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.01).max(1),
    height: z.number().min(0.01).max(1)
  })
});

export const postcardUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(180).optional(),
    postcardType: z.nativeEnum(PostcardType).optional(),
    notes: z.string().max(2000).nullable().optional(),
    placeName: z.string().max(180).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    state: z.string().max(120).nullable().optional(),
    country: z.string().max(120).nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
    originalImageUrl: z.string().url().nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    locationStatus: z.nativeEnum(LocationStatus).optional()
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'No editable fields provided.'
  })
  .refine(
    (payload) =>
      (payload.latitude === undefined && payload.longitude === undefined) ||
      (payload.latitude === null && payload.longitude === null) ||
      (typeof payload.latitude === 'number' && typeof payload.longitude === 'number'),
    {
      message: 'Latitude and longitude must be updated together.'
    }
  );

export type PostcardUpdatePayload = z.infer<typeof postcardUpdateSchema>;
export type CropUpdatePayload = z.infer<typeof cropUpdateSchema>;

type EditableWhere = {
  postcardId: string;
  actorId: string;
  canEditAny: boolean;
};

export type CropUpdateResult =
  | { kind: 'not_found' }
  | { kind: 'missing_source' }
  | {
      kind: 'updated';
      imageUrl: string | null;
      originalImageUrl: string | null;
    };

function buildEditableWhere({ postcardId, actorId, canEditAny }: EditableWhere): Prisma.PostcardWhereInput {
  return {
    id: postcardId,
    ...(canEditAny ? {} : { userId: actorId }),
    deletedAt: null
  };
}

async function findEditablePostcardBefore(
  tx: Prisma.TransactionClient,
  params: EditableWhere
): Promise<EditablePostcard | null> {
  return tx.postcard.findFirst({
    where: buildEditableWhere(params),
    select: postcardEditSelect
  });
}

async function withEditablePostcard(
  tx: Prisma.TransactionClient,
  params: EditableWhere,
  run: (before: EditablePostcard) => Promise<EditablePostcard>
): Promise<EditablePostcard | null> {
  const before = await findEditablePostcardBefore(tx, params);
  if (!before) {
    return null;
  }

  return run(before);
}

function buildPostcardUpdateData(payload: PostcardUpdatePayload): Prisma.PostcardUpdateInput {
  const updateData: Prisma.PostcardUpdateInput = {};

  if (payload.title !== undefined) {
    updateData.title = payload.title;
  }
  if (payload.postcardType !== undefined) {
    updateData.postcardType = payload.postcardType;
  }
  if (payload.notes !== undefined) {
    updateData.notes = toNullableText(payload.notes);
  }
  if (payload.placeName !== undefined) {
    updateData.placeName = toNullableText(payload.placeName);
  }
  if (payload.city !== undefined) {
    updateData.city = toNullableText(payload.city);
  }
  if (payload.state !== undefined) {
    updateData.state = toNullableText(payload.state);
  }
  if (payload.country !== undefined) {
    updateData.country = toNullableText(payload.country);
  }
  if (payload.imageUrl !== undefined) {
    updateData.imageUrl = payload.imageUrl;
  }
  if (payload.originalImageUrl !== undefined) {
    updateData.originalImageUrl = payload.originalImageUrl;
  }
  if (payload.latitude !== undefined) {
    updateData.latitude = payload.latitude;
  }
  if (payload.longitude !== undefined) {
    updateData.longitude = payload.longitude;
  }
  if (payload.locationStatus !== undefined) {
    updateData.locationStatus = payload.locationStatus;
  }

  return updateData;
}

async function recordPostcardEditHistory(params: {
  tx: Prisma.TransactionClient;
  postcardId: string;
  actorId: string;
  action: PostcardEditAction;
  before: EditablePostcard;
  afterData: Prisma.InputJsonValue;
}) {
  await params.tx.postcardEditHistory.create({
    data: {
      postcardId: params.postcardId,
      userId: params.actorId,
      action: params.action,
      beforeData: toEditSnapshot(params.before),
      afterData: params.afterData
    }
  });
}

async function updatePostcardWithHistory(params: {
  tx: Prisma.TransactionClient;
  postcardId: string;
  actorId: string;
  before: EditablePostcard;
  action: PostcardEditAction;
  updateData: Prisma.PostcardUpdateInput;
  toAfterData?: (after: EditablePostcard) => Prisma.InputJsonValue;
}): Promise<EditablePostcard> {
  const after = await params.tx.postcard.update({
    where: { id: params.postcardId },
    data: params.updateData,
    select: postcardEditSelect
  });

  await recordPostcardEditHistory({
    tx: params.tx,
    postcardId: params.postcardId,
    actorId: params.actorId,
    action: params.action,
    before: params.before,
    afterData: params.toAfterData ? params.toAfterData(after) : toEditSnapshot(after)
  });

  return after;
}

export async function applyPostcardCropUpdate(params: {
  postcardId: string;
  actorId: string;
  canEditAny: boolean;
  crop: CropUpdatePayload['crop'];
}): Promise<CropUpdateResult> {
  const postcard = await findPostcardCropSource({
    postcardId: params.postcardId,
    userId: params.canEditAny ? undefined : params.actorId
  });

  if (!postcard) {
    return { kind: 'not_found' };
  }

  const resolvedOriginalImageUrl = postcard.originalImageUrl ?? deriveOriginalImageUrl(postcard.imageUrl);
  const sourceImageUrl = resolvedOriginalImageUrl ?? postcard.imageUrl;
  if (!sourceImageUrl) {
    return { kind: 'missing_source' };
  }

  const postcardImageUrl = await recropPostcardAndUpload({
    postcardId: postcard.id,
    sourceImageUrl,
    crop: params.crop
  });

  const updated = await prisma.$transaction(async (tx) => {
    return withEditablePostcard(
      tx,
      {
        postcardId: params.postcardId,
        actorId: params.actorId,
        canEditAny: params.canEditAny
      },
      async (before) => {
        const updateData: Prisma.PostcardUpdateInput = {
          imageUrl: postcardImageUrl
        };
        if (resolvedOriginalImageUrl) {
          updateData.originalImageUrl = resolvedOriginalImageUrl;
        }

        const after = await updatePostcardWithHistory({
          tx,
          postcardId: params.postcardId,
          actorId: params.actorId,
          before,
          action: PostcardEditAction.CROP_UPDATED,
          updateData,
          toAfterData: (afterPostcard) => ({
            ...toEditSnapshot(afterPostcard),
            crop: params.crop
          })
        });

        return after;
      }
    );
  });

  if (!updated) {
    return { kind: 'not_found' };
  }

  return {
    kind: 'updated',
    imageUrl: updated.imageUrl,
    originalImageUrl: updated.originalImageUrl ?? null
  };
}

export async function applyPostcardDetailsUpdate(params: {
  postcardId: string;
  actorId: string;
  canEditAny: boolean;
  payload: PostcardUpdatePayload;
}): Promise<EditablePostcard | null> {
  return prisma.$transaction(async (tx) => {
    return withEditablePostcard(
      tx,
      {
        postcardId: params.postcardId,
        actorId: params.actorId,
        canEditAny: params.canEditAny
      },
      async (before) => {
        const nextLatitude =
          params.payload.latitude !== undefined ? params.payload.latitude : before.latitude;
        const nextLongitude =
          params.payload.longitude !== undefined ? params.payload.longitude : before.longitude;

        const reverseLocation =
          typeof nextLatitude === 'number' && typeof nextLongitude === 'number'
            ? await reverseGeocodeCoordinates(nextLatitude, nextLongitude)
            : null;

        const updateData = buildPostcardUpdateData(params.payload);
        if (reverseLocation) {
          updateData.city = reverseLocation.city;
          updateData.state = reverseLocation.state;
          updateData.country = reverseLocation.country;
        }

        const after = await updatePostcardWithHistory({
          tx,
          postcardId: params.postcardId,
          actorId: params.actorId,
          before,
          action: PostcardEditAction.DETAILS_UPDATED,
          updateData
        });

        return after;
      }
    );
  });
}

export async function softDeletePostcard(params: {
  postcardId: string;
  actorId: string;
}): Promise<boolean> {
  const now = new Date();
  const deleted = await prisma.$transaction(async (tx) => {
    const before = await tx.postcard.findFirst({
      where: {
        id: params.postcardId,
        userId: params.actorId,
        deletedAt: null
      },
      select: postcardEditSelect
    });

    if (!before) {
      return false;
    }

    const after = await tx.postcard.update({
      where: { id: params.postcardId },
      data: {
        deletedAt: now
      },
      select: postcardEditSelect
    });

    await tx.postcardEditHistory.create({
      data: {
        postcardId: params.postcardId,
        userId: params.actorId,
        action: PostcardEditAction.SOFT_DELETED,
        beforeData: toEditSnapshot(before),
        afterData: toEditSnapshot(after)
      }
    });

    return true;
  });

  return deleted;
}
