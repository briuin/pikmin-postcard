import { DetectionJobStatus } from '@prisma/client';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
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

async function uploadImageToS3(file: File): Promise<string> {
  assertSupportedImage(file);

  const config = getStorageConfig();
  const key = buildObjectKey(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());

  const s3 = new S3Client({ region: config.region });

  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: bytes,
      ContentType: file.type,
      CacheControl: 'public,max-age=31536000,immutable'
    })
  );

  return `${config.baseUrl}/${key}`;
}

async function detectWithGemini(mimeType: string, fileBytes: Buffer): Promise<GeminiLocationResult> {
  const geminiEnv = getGeminiEnv();
  const base64Image = fileBytes.toString('base64');

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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiEnv.GEMINI_MODEL}:generateContent?key=${geminiEnv.GOOGLE_GENERATIVE_AI_API_KEY}`,
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
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: base64Image
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini request failed: ${errorBody}`);
  }

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

  const parsedJsonText = extractJsonObject(modelText);
  return locationResultSchema.parse(JSON.parse(parsedJsonText));
}

async function processDetectionJob(params: {
  jobId: string;
  mimeType: string;
  fileBytes: Buffer;
}): Promise<void> {
  try {
    await prisma.detectionJob.update({
      where: { id: params.jobId },
      data: {
        status: DetectionJobStatus.PROCESSING
      }
    });

    const result = await detectWithGemini(params.mimeType, params.fileBytes);

    await prisma.detectionJob.update({
      where: { id: params.jobId },
      data: {
        status: DetectionJobStatus.SUCCEEDED,
        latitude: result.latitude,
        longitude: result.longitude,
        confidence: result.confidence,
        placeGuess: result.place_guess,
        modelVersion: process.env.GEMINI_MODEL ?? 'unknown',
        completedAt: new Date(),
        errorMessage: null
      }
    });
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

    const imageUrl = await uploadImageToS3(file);
    const fileBytes = Buffer.from(await file.arrayBuffer());

    const job = await prisma.detectionJob.create({
      data: {
        userId: user.id,
        imageUrl,
        status: DetectionJobStatus.QUEUED
      }
    });

    void processDetectionJob({
      jobId: job.id,
      mimeType: file.type,
      fileBytes
    });

    return NextResponse.json(
      {
        id: job.id,
        status: job.status,
        imageUrl,
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
