import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/api-auth';
import {
  findPostcardCropSource,
  recropPostcardAndUpload,
  updatePostcardImageWithOriginalFallback
} from '@/lib/postcards/crop-service';
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

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  try {
    const payload = cropUpdateSchema.parse(await request.json());
    const postcard = await findPostcardCropSource({
      postcardId: id,
      userId
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

    await updatePostcardImageWithOriginalFallback({
      postcardId: postcard.id,
      postcardImageUrl,
      originalImageUrl: resolvedOriginalImageUrl
    });

    return NextResponse.json(
      {
        ok: true,
        imageUrl: postcardImageUrl,
        originalImageUrl: resolvedOriginalImageUrl ?? null
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update postcard crop.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  const result = await prisma.postcard.updateMany({
    where: {
      id,
      userId,
      deletedAt: null
    },
    data: {
      deletedAt: new Date()
    }
  });

  if (result.count === 0) {
    return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
