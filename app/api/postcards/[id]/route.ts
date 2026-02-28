import { LocationStatus, PostcardEditAction, type Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, isManagerOrAboveRole } from '@/lib/api-auth';
import { findPostcardCropSource, recropPostcardAndUpload } from '@/lib/postcards/crop-service';
import { postcardEditSelect, toEditSnapshot, toNullableText } from '@/lib/postcards/edit-history';
import { deriveOriginalImageUrl } from '@/lib/postcards/shared';
import { prisma } from '@/lib/prisma';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const cropUpdateSchema = z.object({
  crop: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.01).max(1),
    height: z.number().min(0.01).max(1)
  })
});

const postcardUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(180).optional(),
    notes: z.string().max(2000).nullable().optional(),
    placeName: z.string().max(180).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
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

type PostcardUpdatePayload = z.infer<typeof postcardUpdateSchema>;

function buildPostcardUpdateData(payload: PostcardUpdatePayload): Prisma.PostcardUpdateInput {
  const updateData: Prisma.PostcardUpdateInput = {};

  if (payload.title !== undefined) {
    updateData.title = payload.title;
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

export async function PATCH(request: Request, context: RouteContext) {
  const actor = await getAuthenticatedUser();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const canEditAny = isManagerOrAboveRole(actor.role);

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  try {
    const body = await request.json();

    if (body && typeof body === 'object' && 'crop' in body) {
      const payload = cropUpdateSchema.parse(body);
      const postcard = await findPostcardCropSource({
        postcardId: id,
        userId: canEditAny ? undefined : actor.id
      });

      if (!postcard) {
        return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
      }

      const resolvedOriginalImageUrl =
        postcard.originalImageUrl ?? deriveOriginalImageUrl(postcard.imageUrl);
      const sourceImageUrl = resolvedOriginalImageUrl ?? postcard.imageUrl;
      if (!sourceImageUrl) {
        return NextResponse.json(
          { error: 'No image source is available for crop edit.' },
          { status: 400 }
        );
      }

      const postcardImageUrl = await recropPostcardAndUpload({
        postcardId: postcard.id,
        sourceImageUrl,
        crop: {
          x: payload.crop.x,
          y: payload.crop.y,
          width: payload.crop.width,
          height: payload.crop.height
        }
      });

      const updated = await prisma.$transaction(async (tx) => {
        const before = await tx.postcard.findFirst({
          where: {
            id,
            ...(canEditAny ? {} : { userId: actor.id }),
            deletedAt: null
          },
          select: postcardEditSelect
        });
        if (!before) {
          return null;
        }

        const updateData: Prisma.PostcardUpdateInput = {
          imageUrl: postcardImageUrl
        };
        if (resolvedOriginalImageUrl) {
          updateData.originalImageUrl = resolvedOriginalImageUrl;
        }

        const after = await tx.postcard.update({
          where: { id },
          data: updateData,
          select: postcardEditSelect
        });

        await tx.postcardEditHistory.create({
          data: {
            postcardId: id,
            userId: actor.id,
            action: PostcardEditAction.CROP_UPDATED,
            beforeData: toEditSnapshot(before),
            afterData: {
              ...toEditSnapshot(after),
              crop: payload.crop
            }
          }
        });

        return after;
      });

      if (!updated) {
        return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
      }

      return NextResponse.json(
        {
          ok: true,
          imageUrl: updated.imageUrl,
          originalImageUrl: updated.originalImageUrl ?? null
        },
        { status: 200 }
      );
    }

    const payload = postcardUpdateSchema.parse(body);
    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.postcard.findFirst({
        where: {
          id,
          ...(canEditAny ? {} : { userId: actor.id }),
          deletedAt: null
        },
        select: postcardEditSelect
      });
      if (!before) {
        return null;
      }

      const after = await tx.postcard.update({
        where: { id },
        data: buildPostcardUpdateData(payload),
        select: postcardEditSelect
      });

      await tx.postcardEditHistory.create({
        data: {
          postcardId: id,
          userId: actor.id,
          action: PostcardEditAction.DETAILS_UPDATED,
          beforeData: toEditSnapshot(before),
          afterData: toEditSnapshot(after)
        }
      });

      return after;
    });

    if (!updated) {
      return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update postcard.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  const actor = await getAuthenticatedUser();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  const now = new Date();
  const deleted = await prisma.$transaction(async (tx) => {
    const before = await tx.postcard.findFirst({
      where: {
        id,
        userId: actor.id,
        deletedAt: null
      },
      select: postcardEditSelect
    });

    if (!before) {
      return false;
    }

    const after = await tx.postcard.update({
      where: { id },
      data: {
        deletedAt: now
      },
      select: postcardEditSelect
    });

    await tx.postcardEditHistory.create({
      data: {
        postcardId: id,
        userId: actor.id,
        action: PostcardEditAction.SOFT_DELETED,
        beforeData: toEditSnapshot(before),
        afterData: toEditSnapshot(after)
      }
    });

    return true;
  });

  if (!deleted) {
    return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
