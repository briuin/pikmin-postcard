import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { z } from 'zod';
import { auth } from '@/auth';
import { deriveOriginalImageUrl, hasMissingOriginalImageColumnError } from '@/lib/postcards/shared';
import { prisma } from '@/lib/prisma';
import { buildObjectKey, buildVariantObjectKey, uploadBytesToStorage } from '@/lib/storage';

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true }
  });

  return user?.id ?? null;
}

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

    let postcard: { id: string; imageUrl: string | null; originalImageUrl: string | null } | null = null;
    try {
      postcard = await prisma.postcard.findFirst({
        where: {
          id,
          userId,
          deletedAt: null
        },
        select: {
          id: true,
          imageUrl: true,
          originalImageUrl: true
        }
      });
    } catch (error) {
      if (!hasMissingOriginalImageColumnError(error)) {
        throw error;
      }

      const fallback = await prisma.postcard.findFirst({
        where: {
          id,
          userId,
          deletedAt: null
        },
        select: {
          id: true,
          imageUrl: true
        }
      });
      postcard = fallback ? { ...fallback, originalImageUrl: null } : null;
    }

    if (!postcard) {
      return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
    }

    const originalImageUrl = postcard.originalImageUrl ?? deriveOriginalImageUrl(postcard.imageUrl);
    const sourceImageUrl = originalImageUrl ?? postcard.imageUrl;
    if (!sourceImageUrl) {
      return NextResponse.json(
        { error: 'No image source is available for crop edit.' },
        { status: 400 }
      );
    }

    const originalResponse = await fetch(sourceImageUrl, { cache: 'no-store' });
    if (!originalResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to load source image for recrop.' },
        { status: 400 }
      );
    }

    const originalBytes = Buffer.from(await originalResponse.arrayBuffer());
    const metadata = await sharp(originalBytes).metadata();
    const imageWidth = metadata.width ?? 0;
    const imageHeight = metadata.height ?? 0;

    if (imageWidth <= 0 || imageHeight <= 0) {
      return NextResponse.json({ error: 'Invalid original image size.' }, { status: 400 });
    }

    const normalizedX = clamp(payload.crop.x, 0, 1);
    const normalizedY = clamp(payload.crop.y, 0, 1);
    const normalizedWidth = clamp(payload.crop.width, 0.05, 1 - normalizedX);
    const normalizedHeight = clamp(payload.crop.height, 0.05, 1 - normalizedY);

    const left = Math.round(normalizedX * imageWidth);
    const top = Math.round(normalizedY * imageHeight);
    const width = Math.max(1, Math.round(normalizedWidth * imageWidth));
    const height = Math.max(1, Math.round(normalizedHeight * imageHeight));

    const boundedWidth = Math.min(width, imageWidth - left);
    const boundedHeight = Math.min(height, imageHeight - top);

    const croppedBytes = await sharp(originalBytes)
      .extract({
        left,
        top,
        width: boundedWidth,
        height: boundedHeight
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    const postcardObjectKey = buildVariantObjectKey(buildObjectKey(`recrop-${id}.jpg`), 'postcard');
    const postcardImageUrl = await uploadBytesToStorage({
      key: postcardObjectKey,
      bytes: new Uint8Array(croppedBytes),
      contentType: 'image/jpeg'
    });

    try {
      await prisma.postcard.update({
        where: { id: postcard.id },
        data: {
          imageUrl: postcardImageUrl,
          originalImageUrl: originalImageUrl ?? sourceImageUrl
        }
      });
    } catch (error) {
      if (!hasMissingOriginalImageColumnError(error)) {
        throw error;
      }
      await prisma.postcard.update({
        where: { id: postcard.id },
        data: {
          imageUrl: postcardImageUrl
        }
      });
    }

    return NextResponse.json(
      {
        ok: true,
        imageUrl: postcardImageUrl,
        originalImageUrl: originalImageUrl ?? sourceImageUrl
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
