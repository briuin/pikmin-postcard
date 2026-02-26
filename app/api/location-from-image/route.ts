import { DetectionJobStatus } from '@prisma/client';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { z } from 'zod';
import { auth } from '@/auth';
import { getGeminiEnv } from '@/lib/env';
import { locationResultSchema } from '@/lib/location-schema';
import { prisma } from '@/lib/prisma';
import { assertSupportedImage, buildObjectKey, getStorageConfig } from '@/lib/storage';

export const runtime = 'nodejs';

type GeminiLocationResult = {
  latitude: number;
  longitude: number;
  confidence: number;
  place_guess: string;
};

type GeminiDetectionSuccess = {
  location: GeminiLocationResult;
  modelVersion: string;
};

type CropBoxResult = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

type GeminiTextResult = {
  text: string;
  modelVersion: string;
};

const postcardCropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.01).max(1),
  height: z.number().min(0.01).max(1),
  confidence: z.number().min(0).max(1)
});

function extractJsonObject(rawText: string): string {
  const fenced = rawText.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return rawText.slice(start, end + 1);
  }

  throw new Error('Model output did not contain a JSON object.');
}

function buildVariantObjectKey(baseKey: string, variant: 'original' | 'postcard'): string {
  if (variant === 'original') {
    return baseKey.replace(/^postcards\//, 'uploads/original/');
  }

  return baseKey.replace(/^postcards\//, 'uploads/postcard/');
}

async function uploadBytesToS3(params: {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<string> {
  const config = getStorageConfig();
  const s3 = new S3Client({ region: config.region });

  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: params.key,
      Body: params.bytes,
      ContentType: params.contentType,
      CacheControl: 'public,max-age=31536000,immutable'
    })
  );

  return `${config.baseUrl}/${params.key}`;
}

async function generateGeminiText(params: {
  mimeType: string;
  fileBytes: Buffer;
  prompt: string;
  responseMimeType?: 'application/json' | 'text/plain';
}): Promise<GeminiTextResult> {
  const geminiEnv = getGeminiEnv();
  const base64Image = params.fileBytes.toString('base64');
  const modelsToTry = Array.from(
    new Set([geminiEnv.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-2.5-flash-lite'])
  );

  let lastError: Error | null = null;

  for (let i = 0; i < modelsToTry.length; i += 1) {
    const model = modelsToTry[i] as string;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiEnv.GOOGLE_GENERATIVE_AI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: params.prompt },
                {
                  inlineData: {
                    mimeType: params.mimeType,
                    data: base64Image
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: params.responseMimeType ?? 'application/json'
          }
        })
      }
    );

    if (response.ok) {
      const json = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const modelText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!modelText) {
        throw new Error('Gemini response did not include text output.');
      }

      return {
        text: modelText,
        modelVersion: model
      };
    }

    const errorBody = await response.text();
    const shouldTryNextModel = response.status === 404 && i < modelsToTry.length - 1;

    if (shouldTryNextModel) {
      console.warn('Gemini model unavailable, trying fallback model', {
        model,
        responseStatus: response.status
      });
      continue;
    }

    lastError = new Error(`Gemini request failed: ${errorBody}`);
    break;
  }

  throw lastError ?? new Error('Gemini request failed with unknown error.');
}

async function detectWithGemini(mimeType: string, fileBytes: Buffer): Promise<GeminiDetectionSuccess> {
  const prompt = [
    'You are a geolocation inference model for postcard photos.',
    'Estimate where this photo was likely taken and return only strict JSON.',
    'Schema:',
    '{',
    '  "latitude": number (-90 to 90),',
    '  "longitude": number (-180 to 180),',
    '  "confidence": number (0 to 1),',
    '  "place_guess": string',
    '}',
    'No markdown, no explanation.'
  ].join('\n');

  const result = await generateGeminiText({
    mimeType,
    fileBytes,
    prompt,
    responseMimeType: 'application/json'
  });

  const parsedJsonText = extractJsonObject(result.text);
  return {
    location: locationResultSchema.parse(JSON.parse(parsedJsonText)),
    modelVersion: result.modelVersion
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getFallbackCropBox(): CropBoxResult {
  return {
    x: 0.05,
    y: 0.04,
    width: 0.9,
    height: 0.72,
    confidence: 0.2
  };
}

async function detectPostcardCropBox(mimeType: string, fileBytes: Buffer): Promise<CropBoxResult> {
  const prompt = [
    'Detect the postcard panel area inside this screenshot/photo.',
    'Return strict JSON with normalized coordinates in [0,1].',
    'Schema:',
    '{',
    '  "x": number,',
    '  "y": number,',
    '  "width": number,',
    '  "height": number,',
    '  "confidence": number',
    '}',
    'x,y are top-left corner. width,height are box size.',
    'If unsure, still return your best guess for postcard panel area.',
    'No markdown, no explanation.'
  ].join('\n');

  const result = await generateGeminiText({
    mimeType,
    fileBytes,
    prompt,
    responseMimeType: 'application/json'
  });

  const parsedJsonText = extractJsonObject(result.text);
  return postcardCropSchema.parse(JSON.parse(parsedJsonText));
}

async function buildCroppedPostcardImage(params: {
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

async function processDetectionJob(params: {
  jobId: string;
  userId: string;
  mimeType: string;
  fileBytes: Buffer;
  originalImageUrl: string;
  postcardObjectKey: string;
}): Promise<void> {
  try {
    await prisma.detectionJob.update({
      where: { id: params.jobId },
      data: {
        status: DetectionJobStatus.PROCESSING
      }
    });

    const detection = await detectWithGemini(params.mimeType, params.fileBytes);

    let postcardImageUrl = params.originalImageUrl;

    try {
      const cropped = await buildCroppedPostcardImage({
        mimeType: params.mimeType,
        fileBytes: params.fileBytes
      });

      postcardImageUrl = await uploadBytesToS3({
        key: params.postcardObjectKey,
        bytes: new Uint8Array(cropped.bytes),
        contentType: cropped.contentType
      });
    } catch (error) {
      console.error('Postcard crop failed, keeping original image URL.', {
        jobId: params.jobId,
        error
      });
    }

    await prisma.detectionJob.update({
      where: { id: params.jobId },
      data: {
        status: DetectionJobStatus.SUCCEEDED,
        imageUrl: postcardImageUrl,
        latitude: detection.location.latitude,
        longitude: detection.location.longitude,
        confidence: detection.location.confidence,
        placeGuess: detection.location.place_guess,
        modelVersion: detection.modelVersion,
        completedAt: new Date(),
        errorMessage: null
      }
    });

    const existingPostcard = await prisma.postcard.findFirst({
      where: {
        userId: params.userId,
        imageUrl: postcardImageUrl,
        deletedAt: null
      },
      select: { id: true }
    });

    if (!existingPostcard) {
      await prisma.postcard.create({
        data: {
          userId: params.userId,
          title: detection.location.place_guess?.trim() ? `AI: ${detection.location.place_guess}` : 'AI detected postcard',
          notes: 'Auto-created from AI detection upload.',
          imageUrl: postcardImageUrl,
          placeName: detection.location.place_guess,
          latitude: detection.location.latitude,
          longitude: detection.location.longitude,
          aiLatitude: detection.location.latitude,
          aiLongitude: detection.location.longitude,
          aiConfidence: detection.location.confidence,
          aiPlaceGuess: detection.location.place_guess,
          locationStatus: 'AUTO',
          locationModelVersion: detection.modelVersion
        }
      });
    }
  } catch (error) {
    console.error('Detection job failed', { jobId: params.jobId, error });
    await prisma.detectionJob.update({
      where: { id: params.jobId },
      data: {
        status: DetectionJobStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : 'Unknown detection error.',
        completedAt: new Date()
      }
    });
  }
}

export async function GET() {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true }
  });

  if (!user) {
    return NextResponse.json([], { status: 200 });
  }

  const jobs = await prisma.detectionJob.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 200
  });

  return NextResponse.json(jobs, { status: 200 });
}

export async function POST(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('image');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing image file.' }, { status: 400 });
    }

    assertSupportedImage(file);

    const user = await prisma.user.upsert({
      where: { email: userEmail },
      update: {},
      create: { email: userEmail }
    });

    const fileBytes = Buffer.from(await file.arrayBuffer());
    const baseKey = buildObjectKey(file.name);
    const originalObjectKey = buildVariantObjectKey(baseKey, 'original');
    const postcardObjectKey = buildVariantObjectKey(baseKey, 'postcard');

    const originalImageUrl = await uploadBytesToS3({
      key: originalObjectKey,
      bytes: new Uint8Array(fileBytes),
      contentType: file.type
    });

    const job = await prisma.detectionJob.create({
      data: {
        userId: user.id,
        imageUrl: originalImageUrl,
        status: DetectionJobStatus.QUEUED
      }
    });

    void processDetectionJob({
      jobId: job.id,
      userId: user.id,
      mimeType: file.type,
      fileBytes,
      originalImageUrl,
      postcardObjectKey
    });

    return NextResponse.json(
      {
        id: job.id,
        status: job.status,
        imageUrl: originalImageUrl,
        message: 'Detection job queued. Check your dashboard for result.'
      },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to queue location detection.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
