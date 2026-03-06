import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildGeoBucketFieldsFromCoordinates,
  type GeoBucketFieldValues
} from '@/lib/postcards/geo';
import { ddbDoc, ddbTables, nowIso } from '@/lib/repos/dynamodb/shared';

type UnknownRecord = Record<string, unknown>;

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toIso(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function normalizePostcardType(value: unknown): string {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (
    normalized === 'MUSHROOM' ||
    normalized === 'FLOWER' ||
    normalized === 'EXPLORATION' ||
    normalized === 'UNKNOWN'
  ) {
    return normalized;
  }
  return 'UNKNOWN';
}

function normalizeLocationStatus(value: unknown): string {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (
    normalized === 'AUTO' ||
    normalized === 'USER_CONFIRMED' ||
    normalized === 'MANUAL'
  ) {
    return normalized;
  }
  return 'AUTO';
}

function normalizeGeoBuckets(
  source: UnknownRecord,
  latitude: number | null,
  longitude: number | null
): GeoBucketFieldValues {
  const computed = buildGeoBucketFieldsFromCoordinates(latitude, longitude);
  return {
    geoBucket: toNullableString(source.geoBucket) ?? computed.geoBucket,
    geoBucketMedium:
      toNullableString(source.geoBucketMedium) ?? computed.geoBucketMedium,
    geoBucketCoarse:
      toNullableString(source.geoBucketCoarse) ?? computed.geoBucketCoarse
  };
}

export function toPostcardExploreProjectionItem(
  source: UnknownRecord
): UnknownRecord | null {
  const id = String(source.id || '').trim();
  const userId = String(source.userId || '').trim();
  const title = String(source.title || '').trim();
  if (!id || !userId || !title) {
    return null;
  }

  const timestamp = nowIso();
  const latitude = toNumberOrNull(source.latitude);
  const longitude = toNumberOrNull(source.longitude);
  const geoBuckets = normalizeGeoBuckets(source, latitude, longitude);

  return {
    id,
    userId,
    title,
    postcardType: normalizePostcardType(source.postcardType),
    notes: toNullableString(source.notes),
    imageUrl: toNullableString(source.imageUrl),
    capturedAt: toNullableString(source.capturedAt),
    city: toNullableString(source.city),
    state: toNullableString(source.state),
    country: toNullableString(source.country),
    placeName: toNullableString(source.placeName),
    latitude,
    longitude,
    aiLatitude: toNumberOrNull(source.aiLatitude),
    aiLongitude: toNumberOrNull(source.aiLongitude),
    aiConfidence: toNumberOrNull(source.aiConfidence),
    aiPlaceGuess: toNullableString(source.aiPlaceGuess),
    likeCount: Number(source.likeCount || 0),
    dislikeCount: Number(source.dislikeCount || 0),
    wrongLocationReports: Number(source.wrongLocationReports || 0),
    reportVersion: Number(source.reportVersion || 1),
    locationStatus: normalizeLocationStatus(source.locationStatus),
    locationModelVersion: toNullableString(source.locationModelVersion),
    ...geoBuckets,
    deletedAt: toNullableString(source.deletedAt),
    createdAt: toIso(source.createdAt, timestamp),
    updatedAt: toIso(source.updatedAt, timestamp)
  };
}

function isMissingExploreProjectionTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return String((error as { name?: string }).name || '') === 'ResourceNotFoundException';
}

export async function upsertPostcardExploreProjectionFromSource(
  source: UnknownRecord
): Promise<void> {
  const item = toPostcardExploreProjectionItem(source);
  if (!item) {
    return;
  }

  try {
    await ddbDoc.send(
      new PutCommand({
        TableName: ddbTables.postcardsExplore,
        Item: item
      })
    );
  } catch (error) {
    if (isMissingExploreProjectionTable(error)) {
      console.warn(
        `Skipping explore projection upsert because table ${ddbTables.postcardsExplore} is missing.`
      );
      return;
    }
    throw error;
  }
}

export async function syncPostcardExploreProjectionById(
  postcardId: string
): Promise<void> {
  const id = String(postcardId || '').trim();
  if (!id) {
    return;
  }

  const result = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcards,
      Key: { id }
    })
  );
  const source = result.Item as UnknownRecord | undefined;
  if (!source) {
    return;
  }

  await upsertPostcardExploreProjectionFromSource(source);
}
