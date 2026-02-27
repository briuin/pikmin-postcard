import sharp from 'sharp';
import { prisma } from '@/lib/prisma';
import { buildObjectKey, buildVariantObjectKey, uploadBytesToStorage } from '@/lib/storage';
import { hasMissingOriginalImageColumnError } from '@/lib/postcards/shared';

export type CropInput = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PostcardCropSource = {
  id: string;
  imageUrl: string | null;
  originalImageUrl: string | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function findPostcardCropSource(params: {
  postcardId: string;
  userId: string;
}): Promise<PostcardCropSource | null> {
  try {
    return await prisma.postcard.findFirst({
      where: {
        id: params.postcardId,
        userId: params.userId,
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
        id: params.postcardId,
        userId: params.userId,
        deletedAt: null
      },
      select: {
        id: true,
        imageUrl: true
      }
    });

    return fallback ? { ...fallback, originalImageUrl: null } : null;
  }
}

export async function recropPostcardAndUpload(params: {
  postcardId: string;
  sourceImageUrl: string;
  crop: CropInput;
}): Promise<string> {
  const originalResponse = await fetch(params.sourceImageUrl, { cache: 'no-store' });
  if (!originalResponse.ok) {
    throw new Error('Failed to load source image for recrop.');
  }

  const originalBytes = Buffer.from(await originalResponse.arrayBuffer());
  const metadata = await sharp(originalBytes).metadata();
  const imageWidth = metadata.width ?? 0;
  const imageHeight = metadata.height ?? 0;

  if (imageWidth <= 0 || imageHeight <= 0) {
    throw new Error('Invalid original image size.');
  }

  const normalizedX = clamp(params.crop.x, 0, 1);
  const normalizedY = clamp(params.crop.y, 0, 1);
  const normalizedWidth = clamp(params.crop.width, 0.05, 1 - normalizedX);
  const normalizedHeight = clamp(params.crop.height, 0.05, 1 - normalizedY);

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

  const postcardObjectKey = buildVariantObjectKey(buildObjectKey(`recrop-${params.postcardId}.jpg`), 'postcard');
  return uploadBytesToStorage({
    key: postcardObjectKey,
    bytes: new Uint8Array(croppedBytes),
    contentType: 'image/jpeg'
  });
}

export async function updatePostcardImageWithOriginalFallback(params: {
  postcardId: string;
  postcardImageUrl: string;
  originalImageUrl?: string | null;
}): Promise<void> {
  const dataWithOriginal = params.originalImageUrl
    ? {
        imageUrl: params.postcardImageUrl,
        originalImageUrl: params.originalImageUrl
      }
    : {
        imageUrl: params.postcardImageUrl
      };

  try {
    await prisma.postcard.update({
      where: { id: params.postcardId },
      data: dataWithOriginal
    });
  } catch (error) {
    if (!hasMissingOriginalImageColumnError(error)) {
      throw error;
    }

    await prisma.postcard.update({
      where: { id: params.postcardId },
      data: {
        imageUrl: params.postcardImageUrl
      }
    });
  }
}
