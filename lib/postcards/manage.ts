import { z } from 'zod';
import { LocationStatus, PostcardType } from '@/lib/domain/enums';
import type { PostcardUpdateInput } from '@/lib/repos/postcards/types';
import { recropPostcardAndUpload } from '@/lib/postcards/crop-service';
import { toNullableText, type EditablePostcard } from '@/lib/postcards/edit-history';
import { deriveOriginalImageUrl } from '@/lib/postcards/shared';
import { postcardRepo } from '@/lib/repos/postcards';
import { reverseGeocodeCoordinates } from '@/lib/reverse-geocode';

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

export type CropUpdateResult =
  | { kind: 'not_found' }
  | { kind: 'missing_source' }
  | {
      kind: 'updated';
      imageUrl: string | null;
      originalImageUrl: string | null;
    };

function buildPostcardUpdateData(payload: PostcardUpdatePayload): PostcardUpdateInput {
  const updateData: PostcardUpdateInput = {};

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

export async function applyPostcardCropUpdate(params: {
  postcardId: string;
  actorId: string;
  canEditAny: boolean;
  crop: CropUpdatePayload['crop'];
}): Promise<CropUpdateResult> {
  const postcard = await postcardRepo.findCropSource({
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

  const updated = await postcardRepo.applyCropUpdateWithHistory({
    postcardId: params.postcardId,
    actorId: params.actorId,
    canEditAny: params.canEditAny,
    imageUrl: postcardImageUrl,
    originalImageUrl: resolvedOriginalImageUrl,
    crop: params.crop
  });

  if (!updated) {
    return { kind: 'not_found' };
  }

  return {
    kind: 'updated',
    imageUrl: updated.imageUrl,
    originalImageUrl: updated.originalImageUrl
  };
}

export async function applyPostcardDetailsUpdate(params: {
  postcardId: string;
  actorId: string;
  canEditAny: boolean;
  payload: PostcardUpdatePayload;
}): Promise<EditablePostcard | null> {
  const before = await postcardRepo.findEditableForActor({
    postcardId: params.postcardId,
    actorId: params.actorId,
    canEditAny: params.canEditAny
  });
  if (!before) {
    return null;
  }

  const nextLatitude = params.payload.latitude !== undefined ? params.payload.latitude : before.latitude;
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

  return postcardRepo.applyDetailsUpdateWithHistory({
    postcardId: params.postcardId,
    actorId: params.actorId,
    canEditAny: params.canEditAny,
    updateData
  });
}

export async function softDeletePostcard(params: {
  postcardId: string;
  actorId: string;
}): Promise<boolean> {
  return postcardRepo.softDeleteWithHistory({
    postcardId: params.postcardId,
    actorId: params.actorId,
    deletedAt: new Date()
  });
}
