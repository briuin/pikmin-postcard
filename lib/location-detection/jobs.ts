import { DetectionJobStatus, PostcardType } from '@prisma/client';
import { buildCroppedPostcardImage } from '@/lib/location-detection/crop';
import { detectWithGemini, type GeminiDetectionSuccess } from '@/lib/location-detection/gemini';
import { hasMissingOriginalImageColumnError } from '@/lib/postcards/shared';
import { prisma } from '@/lib/prisma';
import {
  assertSupportedImage,
  buildObjectKey,
  buildVariantObjectKey,
  uploadBytesToStorage
} from '@/lib/storage';

type CreateAutoPostcardParams = {
  userId: string;
  imageUrl: string;
  originalImageUrl: string;
  detection: GeminiDetectionSuccess;
};

export type ProcessDetectionJobParams = {
  jobId: string;
  userId: string;
  mimeType: string;
  fileBytes: Buffer;
  originalImageUrl: string;
  postcardObjectKey: string;
};

export type QueueDetectionJobParams = {
  userId: string;
  file: File;
};

export type QueueDetectionJobResult = {
  id: string;
  status: DetectionJobStatus;
  imageUrl: string;
  processParams: ProcessDetectionJobParams;
};

function buildAutoPostcardData(params: CreateAutoPostcardParams & { includeOriginalImageUrl: boolean }) {
  const title = params.detection.location.place_guess?.trim()
    ? `AI: ${params.detection.location.place_guess}`
    : 'AI detected postcard';

  return {
    userId: params.userId,
    title,
    postcardType: PostcardType.UNKNOWN,
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

async function createAutoPostcard(params: CreateAutoPostcardParams): Promise<void> {
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

export async function listDetectionJobsForUser(userId: string) {
  return prisma.detectionJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
}

export async function queueDetectionJob({
  userId,
  file
}: QueueDetectionJobParams): Promise<QueueDetectionJobResult> {
  assertSupportedImage(file);

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
      userId,
      imageUrl: originalImageUrl,
      status: DetectionJobStatus.QUEUED
    }
  });

  return {
    id: job.id,
    status: job.status,
    imageUrl: originalImageUrl,
    processParams: {
      jobId: job.id,
      userId,
      mimeType: file.type,
      fileBytes,
      originalImageUrl,
      postcardObjectKey
    }
  };
}

export async function processDetectionJob(params: ProcessDetectionJobParams): Promise<void> {
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
