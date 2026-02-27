import { DetectionJobStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { buildCroppedPostcardImage } from '@/lib/location-detection/crop';
import { detectWithGemini } from '@/lib/location-detection/gemini';
import { hasMissingOriginalImageColumnError } from '@/lib/postcards/shared';
import { prisma } from '@/lib/prisma';
import {
  assertSupportedImage,
  buildObjectKey,
  buildVariantObjectKey,
  uploadBytesToStorage
} from '@/lib/storage';

export const runtime = 'nodejs';

function buildAutoPostcardData(params: {
  userId: string;
  imageUrl: string;
  originalImageUrl: string;
  detection: Awaited<ReturnType<typeof detectWithGemini>>;
  includeOriginalImageUrl: boolean;
}) {
  const title = params.detection.location.place_guess?.trim()
    ? `AI: ${params.detection.location.place_guess}`
    : 'AI detected postcard';

  return {
    userId: params.userId,
    title,
    notes: 'Auto-created from AI detection upload.',
    imageUrl: params.imageUrl,
    ...(params.includeOriginalImageUrl ? { originalImageUrl: params.originalImageUrl } : {}),
    placeName: params.detection.location.place_guess,
    latitude: params.detection.location.latitude,
    longitude: params.detection.location.longitude,
    aiLatitude: params.detection.location.latitude,
    aiLongitude: params.detection.location.longitude,
    aiConfidence: params.detection.location.confidence,
    aiPlaceGuess: params.detection.location.place_guess,
    locationStatus: 'AUTO' as const,
    locationModelVersion: params.detection.modelVersion
  };
}

async function createAutoPostcard(params: {
  userId: string;
  imageUrl: string;
  originalImageUrl: string;
  detection: Awaited<ReturnType<typeof detectWithGemini>>;
}): Promise<void> {
  try {
    await prisma.postcard.create({
      data: buildAutoPostcardData({
        ...params,
        includeOriginalImageUrl: true
      })
    });
  } catch (error) {
    if (!hasMissingOriginalImageColumnError(error)) {
      throw error;
    }

    await prisma.postcard.create({
      data: buildAutoPostcardData({
        ...params,
        includeOriginalImageUrl: false
      })
    });
  }
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

      postcardImageUrl = await uploadBytesToStorage({
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
      await createAutoPostcard({
        userId: params.userId,
        imageUrl: postcardImageUrl,
        originalImageUrl: params.originalImageUrl,
        detection
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

    const originalImageUrl = await uploadBytesToStorage({
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
