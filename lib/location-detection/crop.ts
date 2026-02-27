import sharp from 'sharp';
import { z } from 'zod';
import { extractJsonObject, generateGeminiText } from '@/lib/location-detection/gemini';

type CropBoxResult = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

const postcardCropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.01).max(1),
  height: z.number().min(0.01).max(1),
  confidence: z.number().min(0).max(1)
});

const postcardCropPairSchema = z.object({
  photo: postcardCropSchema,
  card: postcardCropSchema.optional()
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getFallbackCropBox(): CropBoxResult {
  return {
    x: 0.08,
    y: 0.1,
    width: 0.84,
    height: 0.54,
    confidence: 0.15
  };
}

function normalizeCropBox(input: CropBoxResult): CropBoxResult {
  const centerX = input.x + input.width / 2;
  const centerY = input.y + input.height / 2;

  let width = clamp(input.width, 0.2, 1);
  let height = clamp(input.height, 0.2, 1);

  const minArea = 0.14;
  if (width * height < minArea) {
    const scale = Math.sqrt(minArea / (width * height));
    width = clamp(width * scale, 0.2, 1);
    height = clamp(height * scale, 0.2, 1);
  }

  const aspect = width / height;
  if (aspect > 2.2) {
    height = clamp(width / 1.35, 0.22, 1);
  } else if (aspect < 0.55) {
    width = clamp(height * 0.9, 0.22, 1);
  }

  if (centerY < 0.25 && height < 0.28) {
    height = clamp(Math.max(height, 0.38), 0.22, 1);
  }

  const x = clamp(centerX - width / 2, 0, 1 - width);
  const y = clamp(centerY - height / 2, 0, 1 - height);

  return {
    x,
    y,
    width,
    height,
    confidence: clamp(input.confidence, 0, 1)
  };
}

function isLikelyPostcardPhotoBox(input: CropBoxResult): boolean {
  const area = input.width * input.height;
  const aspect = input.width / input.height;
  const centerY = input.y + input.height / 2;

  if (aspect < 0.9 || aspect > 2.7) {
    return false;
  }

  if (area < 0.035) {
    return false;
  }

  if (centerY > 0.82) {
    return false;
  }

  return true;
}

function derivePhotoFromCard(card: CropBoxResult): CropBoxResult {
  const targetAspect = 1.35;
  const maxWidth = card.width * 0.92;
  const maxHeight = card.height * 0.66;

  let width = maxWidth;
  let height = width / targetAspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * targetAspect;
  }

  const x = card.x + (card.width - width) / 2;
  const y = card.y + card.height * 0.07;
  const candidate = {
    x,
    y,
    width,
    height,
    confidence: clamp(card.confidence - 0.1, 0.12, 0.92)
  };

  return normalizeCropBox(candidate);
}

async function detectLandscapePhotoOnlyCrop(mimeType: string, fileBytes: Buffer): Promise<CropBoxResult> {
  const prompt = [
    'Find ONLY the postcard photo artwork rectangle.',
    'Do NOT include phone bezel, status bar, app background gradient, title text, distance text, or any UI.',
    'If a phone screenshot is shown, choose only the inner landscape image region inside the postcard card.',
    'The final box must be landscape (width > height).',
    'Return strict JSON only with schema:',
    '{ "x": number, "y": number, "width": number, "height": number, "confidence": number }',
    'x,y are top-left corner in normalized [0,1].',
    'No markdown and no explanation.'
  ].join('\n');

  const result = await generateGeminiText({
    mimeType,
    fileBytes,
    prompt,
    responseMimeType: 'application/json'
  });

  const parsedJsonText = extractJsonObject(result.text);
  const parsed = postcardCropSchema.parse(JSON.parse(parsedJsonText));
  return normalizeCropBox(parsed);
}

async function detectPostcardCropBox(mimeType: string, fileBytes: Buffer): Promise<CropBoxResult> {
  const prompt = [
    'Detect the real postcard image area (the scenic photo artwork) in this screenshot/photo.',
    'Important: exclude status bar, app UI, title text, description text, and buttons.',
    'If there is a postcard card with image+text, choose ONLY the image area at the top.',
    'Return strict JSON with normalized coordinates in [0,1] using this schema:',
    'Schema:',
    '{',
    '  "photo": { "x": number, "y": number, "width": number, "height": number, "confidence": number },',
    '  "card": { "x": number, "y": number, "width": number, "height": number, "confidence": number }',
    '}',
    'All x,y are top-left corners. width,height are box sizes.',
    'If card is unknown, still return best "photo" and omit "card".',
    'No markdown, no explanation.'
  ].join('\n');

  const result = await generateGeminiText({
    mimeType,
    fileBytes,
    prompt,
    responseMimeType: 'application/json'
  });

  const parsedJsonText = extractJsonObject(result.text);
  const parsed = postcardCropPairSchema.parse(JSON.parse(parsedJsonText));
  const photo = normalizeCropBox(parsed.photo);

  if (photo.confidence >= 0.45 && isLikelyPostcardPhotoBox(photo)) {
    return photo;
  }

  if (parsed.card) {
    const derived = derivePhotoFromCard(normalizeCropBox(parsed.card));
    if (isLikelyPostcardPhotoBox(derived)) {
      return derived;
    }
  }

  try {
    const strictPhotoOnly = await detectLandscapePhotoOnlyCrop(mimeType, fileBytes);
    if (strictPhotoOnly.confidence >= 0.35 && isLikelyPostcardPhotoBox(strictPhotoOnly)) {
      return strictPhotoOnly;
    }
  } catch (error) {
    console.warn('Secondary landscape-only crop detection failed.', { error });
  }

  return getFallbackCropBox();
}

export async function buildCroppedPostcardImage(params: {
  mimeType: string;
  fileBytes: Buffer;
}): Promise<{ bytes: Buffer; contentType: string; cropConfidence: number }> {
  const metadata = await sharp(params.fileBytes).metadata();
  const imageWidth = metadata.width ?? 0;
  const imageHeight = metadata.height ?? 0;

  if (imageWidth <= 0 || imageHeight <= 0) {
    throw new Error('Unable to read image dimensions for postcard crop.');
  }

  let cropBox = getFallbackCropBox();

  try {
    cropBox = await detectPostcardCropBox(params.mimeType, params.fileBytes);
  } catch (error) {
    console.warn('Postcard crop detection failed, using fallback crop.', { error });
  }

  cropBox = normalizeCropBox(cropBox);

  const left = clamp(Math.round(cropBox.x * imageWidth), 0, imageWidth - 1);
  const top = clamp(Math.round(cropBox.y * imageHeight), 0, imageHeight - 1);
  const width = clamp(Math.round(cropBox.width * imageWidth), 1, imageWidth - left);
  const height = clamp(Math.round(cropBox.height * imageHeight), 1, imageHeight - top);

  const croppedBytes = await sharp(params.fileBytes)
    .extract({ left, top, width, height })
    .jpeg({ quality: 92 })
    .toBuffer();

  return {
    bytes: croppedBytes,
    contentType: 'image/jpeg',
    cropConfidence: cropBox.confidence
  };
}
