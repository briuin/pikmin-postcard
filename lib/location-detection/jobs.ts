import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DetectionJobStatus, LocationStatus, PostcardType } from '@prisma/client';
import { detectWithGemini } from '@/lib/location-detection/gemini';
import { reverseGeocodeCoordinates } from '@/lib/reverse-geocode';
import {
  ddbDoc,
  ddbTables,
  newId,
  nowIso,
  queryAllByIndex
} from '@/lib/repos/dynamodb/shared';
import { postcardRepo } from '@/lib/repos/postcards';
import {
  assertSupportedImage,
  buildObjectKey,
  buildVariantObjectKey,
  getStorageConfig,
  uploadBytesToStorage
} from '@/lib/storage';

export type ProcessDetectionJobParams = {
  jobId: string;
  userId: string;
  mimeType: string;
  originalImageUrl: string;
  originalObjectKey: string;
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

type DetectionJobRow = {
  id: string;
  userId: string;
  imageUrl: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  confidence: number | null;
  placeGuess: string | null;
  errorMessage: string | null;
  modelVersion: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function normalizeJobStatus(value: unknown): DetectionJobStatus {
  const status = String(value || '').toUpperCase();
  switch (status) {
    case DetectionJobStatus.PROCESSING:
      return DetectionJobStatus.PROCESSING;
    case DetectionJobStatus.SUCCEEDED:
      return DetectionJobStatus.SUCCEEDED;
    case DetectionJobStatus.FAILED:
      return DetectionJobStatus.FAILED;
    default:
      return DetectionJobStatus.QUEUED;
  }
}

function toJobRow(input: Record<string, unknown>): DetectionJobRow {
  return {
    id: String(input.id || ''),
    userId: String(input.userId || ''),
    imageUrl: String(input.imageUrl || ''),
    status: normalizeJobStatus(input.status),
    latitude: typeof input.latitude === 'number' ? input.latitude : null,
    longitude: typeof input.longitude === 'number' ? input.longitude : null,
    confidence: typeof input.confidence === 'number' ? input.confidence : null,
    placeGuess: typeof input.placeGuess === 'string' ? input.placeGuess : null,
    errorMessage: typeof input.errorMessage === 'string' ? input.errorMessage : null,
    modelVersion: typeof input.modelVersion === 'string' ? input.modelVersion : null,
    completedAt: typeof input.completedAt === 'string' ? input.completedAt : null,
    createdAt: String(input.createdAt || nowIso()),
    updatedAt: String(input.updatedAt || nowIso())
  };
}

async function toBufferFromS3Body(body: unknown): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }

  const bodyWithTransform = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };
  if (typeof bodyWithTransform.transformToByteArray === 'function') {
    return Buffer.from(await bodyWithTransform.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
      continue;
    }
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function loadOriginalImageFromStorage(
  objectKey: string
): Promise<{ bytes: Buffer; contentType: string | null }> {
  const storage = getStorageConfig();
  const s3 = new S3Client({ region: storage.region });
  const result = await s3.send(
    new GetObjectCommand({
      Bucket: storage.bucket,
      Key: objectKey
    })
  );

  const bytes = await toBufferFromS3Body(result.Body);
  if (bytes.length === 0) {
    throw new Error(`Original image is empty or missing in storage: ${objectKey}`);
  }

  const contentType =
    typeof result.ContentType === 'string' && result.ContentType.trim().length > 0
      ? result.ContentType.trim()
      : null;

  return { bytes, contentType };
}

async function createAutoPostcard(params: {
  userId: string;
  imageUrl: string;
  originalImageUrl: string;
  detection: Awaited<ReturnType<typeof detectWithGemini>>;
}): Promise<void> {
  const reverseLocation = await reverseGeocodeCoordinates(
    params.detection.location.latitude,
    params.detection.location.longitude
  );

  await postcardRepo.create({
    userId: params.userId,
    title: params.detection.location.place_guess?.trim()
      ? `AI: ${params.detection.location.place_guess}`
      : 'AI detected postcard',
    postcardType: PostcardType.UNKNOWN,
    notes: 'Auto-created from AI detection upload.',
    imageUrl: params.imageUrl,
    originalImageUrl: params.originalImageUrl,
    city: reverseLocation?.city,
    state: reverseLocation?.state,
    country: reverseLocation?.country,
    placeName: params.detection.location.place_guess,
    latitude: params.detection.location.latitude,
    longitude: params.detection.location.longitude,
    aiLatitude: params.detection.location.latitude,
    aiLongitude: params.detection.location.longitude,
    aiConfidence: params.detection.location.confidence,
    aiPlaceGuess: params.detection.location.place_guess,
    locationStatus: LocationStatus.AUTO,
    locationModelVersion: params.detection.modelVersion
  });
}

export async function listDetectionJobsForUser(userId: string): Promise<DetectionJobRow[]> {
  const rows = await queryAllByIndex({
    tableName: ddbTables.detectionJobs,
    indexName: 'userId-createdAt-index',
    keyExpression: '#u = :u',
    attrNames: { '#u': 'userId' },
    attrValues: { ':u': userId },
    scanIndexForward: false,
    limit: 200
  });

  return rows.map(toJobRow);
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

  const jobId = newId('dj');
  const createdAt = nowIso();

  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.detectionJobs,
      Item: {
        id: jobId,
        userId,
        imageUrl: originalImageUrl,
        originalImageUrl,
        originalObjectKey,
        postcardObjectKey,
        mimeType: file.type,
        status: DetectionJobStatus.QUEUED,
        latitude: null,
        longitude: null,
        confidence: null,
        placeGuess: null,
        errorMessage: null,
        modelVersion: null,
        completedAt: null,
        createdAt,
        updatedAt: createdAt
      }
    })
  );

  return {
    id: jobId,
    status: DetectionJobStatus.QUEUED,
    imageUrl: originalImageUrl,
    processParams: {
      jobId,
      userId,
      mimeType: file.type,
      originalImageUrl,
      originalObjectKey,
      postcardObjectKey
    }
  };
}

export async function processDetectionJob(params: ProcessDetectionJobParams): Promise<void> {
  try {
    await ddbDoc.send(
      new UpdateCommand({
        TableName: ddbTables.detectionJobs,
        Key: { id: params.jobId },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': DetectionJobStatus.PROCESSING,
          ':updatedAt': nowIso()
        }
      })
    );

    const { bytes: fileBytes, contentType } = await loadOriginalImageFromStorage(
      params.originalObjectKey
    );
    const mimeType = params.mimeType || contentType || 'image/jpeg';
    const detection = await detectWithGemini(mimeType, fileBytes);
    let postcardImageUrl = params.originalImageUrl;

    try {
      const { buildCroppedPostcardImage } = await import('@/lib/location-detection/crop');
      const cropped = await buildCroppedPostcardImage({
        mimeType,
        fileBytes
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

    await ddbDoc.send(
      new UpdateCommand({
        TableName: ddbTables.detectionJobs,
        Key: { id: params.jobId },
        UpdateExpression:
          'SET #status = :status, imageUrl = :imageUrl, latitude = :lat, longitude = :lon, confidence = :conf, placeGuess = :placeGuess, modelVersion = :modelVersion, completedAt = :completedAt, errorMessage = :errorMessage, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': DetectionJobStatus.SUCCEEDED,
          ':imageUrl': postcardImageUrl,
          ':lat': detection.location.latitude,
          ':lon': detection.location.longitude,
          ':conf': detection.location.confidence,
          ':placeGuess': detection.location.place_guess,
          ':modelVersion': detection.modelVersion,
          ':completedAt': nowIso(),
          ':errorMessage': null,
          ':updatedAt': nowIso()
        }
      })
    );

    const existingPostcards = await queryAllByIndex({
      tableName: ddbTables.postcards,
      indexName: 'userId-createdAt-index',
      keyExpression: '#u = :u',
      attrNames: { '#u': 'userId' },
      attrValues: { ':u': params.userId },
      scanIndexForward: false,
      limit: 400
    });

    const alreadyCreated = existingPostcards.some(
      (item) => !item.deletedAt && String(item.imageUrl || '') === postcardImageUrl
    );

    if (!alreadyCreated) {
      await createAutoPostcard({
        userId: params.userId,
        imageUrl: postcardImageUrl,
        originalImageUrl: params.originalImageUrl,
        detection
      });
    }
  } catch (error) {
    console.error('Detection job failed', { jobId: params.jobId, error });

    await ddbDoc.send(
      new UpdateCommand({
        TableName: ddbTables.detectionJobs,
        Key: { id: params.jobId },
        UpdateExpression:
          'SET #status = :status, errorMessage = :errorMessage, completedAt = :completedAt, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': DetectionJobStatus.FAILED,
          ':errorMessage': error instanceof Error ? error.message : 'Unknown detection error.',
          ':completedAt': nowIso(),
          ':updatedAt': nowIso()
        }
      })
    );
  }
}
