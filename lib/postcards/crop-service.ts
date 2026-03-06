import { buildObjectKey, buildVariantObjectKey, uploadBytesToStorage } from '@/lib/storage';

export type CropInput = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function loadSharp() {
  try {
    const sharpModule = await import('sharp');
    return sharpModule.default;
  } catch {
    throw new Error('Image crop dependency is unavailable on this server.');
  }
}

export async function recropPostcardAndUpload(params: {
  postcardId: string;
  sourceImageUrl: string;
  crop: CropInput;
}): Promise<string> {
  const sharp = await loadSharp();

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

  const postcardObjectKey = buildVariantObjectKey(
    buildObjectKey(`recrop-${params.postcardId}.jpg`),
    'postcard'
  );
  return uploadBytesToStorage({
    key: postcardObjectKey,
    bytes: new Uint8Array(croppedBytes),
    contentType: 'image/jpeg'
  });
}
