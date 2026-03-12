import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import {
  FeedbackAction,
  LocationStatus,
  PostcardEditAction,
  PostcardReportReason,
  PostcardReportStatus,
  PostcardType
} from '@/lib/domain/enums';
import { toEditSnapshot, type EditablePostcard } from '@/lib/postcards/edit-history';
import {
  buildGeoBucketFieldsFromCoordinates,
  enumerateGeoBucketsForBounds,
  getGeoBucketLayers,
  isCoordinateInBounds,
  type GeoBucketLayer,
  type GeoBounds
} from '@/lib/postcards/geo';
import { buildPublicOrderBy, isRandomPublicSort } from '@/lib/postcards/query';
import {
  batchGetByIds,
  ddbDoc,
  ddbTables,
  newId,
  normalizeEmail,
  nowIso,
  queryAllByIndex,
  scanAll,
  toDateOrNull
} from '@/lib/repos/dynamodb/shared';
import {
  syncPostcardExploreProjectionById,
  upsertPostcardExploreProjectionFromSource
} from '@/lib/repos/postcards/explore-projection-sync';
import { toViewerFeedback } from '@/lib/postcards/viewer-feedback';
import type {
  CreatePostcardInput,
  CropBox,
  FindPublicPostcardsInput,
  PostcardFindManyInput,
  PostcardCropSource,
  PostcardFeedbackRow,
  PostcardListRow,
  PostcardOrderByInput,
  PostcardRepo,
  PostcardUpdateInput,
  PostcardWhereInput,
  SubmitPostcardFeedbackInput,
  SubmitPostcardFeedbackResult
} from '@/lib/repos/postcards/types';

type UnknownRecord = Record<string, unknown>;

type DynamoPostcardRow = {
  id: string;
  userId: string;
  title: string;
  postcardType: string;
  notes?: string | null;
  imageUrl?: string | null;
  originalImageUrl?: string | null;
  capturedAt?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  placeName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  aiLatitude?: number | null;
  aiLongitude?: number | null;
  aiConfidence?: number | null;
  aiPlaceGuess?: string | null;
  likeCount?: number;
  dislikeCount?: number;
  wrongLocationReports?: number;
  reportVersion?: number;
  locationStatus?: string;
  locationModelVersion?: string | null;
  geoBucket?: string | null;
  geoBucketMedium?: string | null;
  geoBucketCoarse?: string | null;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type DynamoUserRow = {
  id: string;
  email?: string | null;
  displayName?: string | null;
};

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

function normalizeFeedbackAction(action: string): FeedbackAction | null {
  const normalized = action.trim().toUpperCase();
  if (
    normalized === FeedbackAction.LIKE ||
    normalized === FeedbackAction.DISLIKE ||
    normalized === FeedbackAction.FAVORITE ||
    normalized === FeedbackAction.COLLECTED ||
    normalized === FeedbackAction.REPORT_WRONG_LOCATION
  ) {
    return normalized;
  }
  return null;
}

function normalizePostcardType(value: unknown): PostcardType {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (
    normalized === PostcardType.MUSHROOM ||
    normalized === PostcardType.FLOWER ||
    normalized === PostcardType.EXPLORATION ||
    normalized === PostcardType.UNKNOWN
  ) {
    return normalized;
  }
  return PostcardType.UNKNOWN;
}

function normalizeLocationStatus(value: unknown): LocationStatus {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (
    normalized === LocationStatus.AUTO ||
    normalized === LocationStatus.USER_CONFIRMED ||
    normalized === LocationStatus.MANUAL
  ) {
    return normalized;
  }
  return LocationStatus.AUTO;
}

function toDynamoPostcardRow(item: UnknownRecord | null | undefined): DynamoPostcardRow | null {
  if (!item) {
    return null;
  }
  const id = String(item.id || '').trim();
  const userId = String(item.userId || '').trim();
  const title = String(item.title || '').trim();
  if (!id || !userId || !title) {
    return null;
  }

  return {
    id,
    userId,
    title,
    postcardType: String(item.postcardType || 'UNKNOWN').toUpperCase(),
    notes: toNullableString(item.notes),
    imageUrl: toNullableString(item.imageUrl),
    originalImageUrl: toNullableString(item.originalImageUrl),
    capturedAt: toNullableString(item.capturedAt),
    city: toNullableString(item.city),
    state: toNullableString(item.state),
    country: toNullableString(item.country),
    placeName: toNullableString(item.placeName),
    latitude: toNumberOrNull(item.latitude),
    longitude: toNumberOrNull(item.longitude),
    aiLatitude: toNumberOrNull(item.aiLatitude),
    aiLongitude: toNumberOrNull(item.aiLongitude),
    aiConfidence: toNumberOrNull(item.aiConfidence),
    aiPlaceGuess: toNullableString(item.aiPlaceGuess),
    likeCount: Number(item.likeCount || 0),
    dislikeCount: Number(item.dislikeCount || 0),
    wrongLocationReports: Number(item.wrongLocationReports || 0),
    reportVersion: Number(item.reportVersion || 1),
    locationStatus: String(item.locationStatus || LocationStatus.AUTO).toUpperCase(),
    locationModelVersion: toNullableString(item.locationModelVersion),
    geoBucket: toNullableString(item.geoBucket),
    geoBucketMedium: toNullableString(item.geoBucketMedium),
    geoBucketCoarse: toNullableString(item.geoBucketCoarse),
    deletedAt: toNullableString(item.deletedAt),
    createdAt: toNullableString(item.createdAt) || nowIso(),
    updatedAt: toNullableString(item.updatedAt) || nowIso()
  };
}

function toEditablePostcard(row: DynamoPostcardRow): EditablePostcard {
  return {
    id: row.id,
    title: row.title,
    postcardType: normalizePostcardType(row.postcardType),
    notes: row.notes ?? null,
    placeName: row.placeName ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    country: row.country ?? null,
    imageUrl: row.imageUrl ?? null,
    originalImageUrl: row.originalImageUrl ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    locationStatus: normalizeLocationStatus(row.locationStatus),
    deletedAt: toDateOrNull(row.deletedAt)
  };
}

function maskEmail(email: string | null | undefined): string {
  const value = String(email || '').trim();
  const atIndex = value.indexOf('@');
  if (atIndex <= 0) {
    return 'unknown uploader';
  }
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  const visible = local.length <= 2 ? local : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

function uploaderName(user: DynamoUserRow | undefined): string {
  if (!user) {
    return 'unknown uploader';
  }
  const displayName = toNullableString(user.displayName);
  if (displayName) {
    return displayName;
  }
  return maskEmail(user.email);
}

function stringContainsInsensitive(value: unknown, needle: string): boolean {
  if (!needle) {
    return true;
  }
  return String(value || '').toLowerCase().includes(needle.toLowerCase());
}

function matchesScalarCondition(value: unknown, condition: unknown): boolean {
  if (condition === null) {
    return value === null || value === undefined;
  }

  if (typeof condition !== 'object' || condition === undefined) {
    return String(value ?? '') === String(condition ?? '');
  }

  if (Array.isArray(condition)) {
    return condition.some((item) => matchesScalarCondition(value, item));
  }

  const filter = condition as Record<string, unknown>;
  let pass = true;

  if (filter.equals !== undefined) {
    pass = pass && String(value ?? '') === String(filter.equals ?? '');
  }
  if (Array.isArray(filter.in)) {
    pass =
      pass &&
      filter.in.some((candidate) => String(candidate ?? '') === String(value ?? ''));
  }
  if (filter.not !== undefined) {
    if (filter.not === null) {
      pass = pass && value !== null && value !== undefined;
    } else {
      pass = pass && String(value ?? '') !== String(filter.not ?? '');
    }
  }
  if (typeof filter.contains === 'string') {
    pass = pass && stringContainsInsensitive(value, filter.contains);
  }

  const numericValue = toNumberOrNull(value);
  if (filter.gte !== undefined) {
    const expected = toNumberOrNull(filter.gte);
    if (numericValue === null || expected === null || numericValue < expected) {
      pass = false;
    }
  }
  if (filter.lte !== undefined) {
    const expected = toNumberOrNull(filter.lte);
    if (numericValue === null || expected === null || numericValue > expected) {
      pass = false;
    }
  }

  return pass;
}

function getPostcardFieldValue(postcard: DynamoPostcardRow, field: string): unknown {
  switch (field) {
    case 'id':
      return postcard.id;
    case 'userId':
      return postcard.userId;
    case 'title':
      return postcard.title;
    case 'notes':
      return postcard.notes ?? null;
    case 'placeName':
      return postcard.placeName ?? null;
    case 'city':
      return postcard.city ?? null;
    case 'state':
      return postcard.state ?? null;
    case 'country':
      return postcard.country ?? null;
    case 'aiPlaceGuess':
      return postcard.aiPlaceGuess ?? null;
    case 'deletedAt':
      return postcard.deletedAt ?? null;
    case 'latitude':
      return postcard.latitude ?? null;
    case 'longitude':
      return postcard.longitude ?? null;
    case 'createdAt':
      return postcard.createdAt ?? null;
    case 'updatedAt':
      return postcard.updatedAt ?? null;
    case 'likeCount':
      return postcard.likeCount ?? 0;
    case 'dislikeCount':
      return postcard.dislikeCount ?? 0;
    case 'wrongLocationReports':
      return postcard.wrongLocationReports ?? 0;
    default:
      return (postcard as unknown as Record<string, unknown>)[field];
  }
}

function matchesWhereClause(
  postcard: DynamoPostcardRow,
  where: unknown,
  context: {
    usersById: Map<string, DynamoUserRow>;
    reportedPostcardIds: Set<string>;
  }
): boolean {
  if (!where || typeof where !== 'object') {
    return true;
  }

  const value = where as Record<string, unknown>;

  if (Array.isArray(value.AND)) {
    const andPass = value.AND.every((item) => matchesWhereClause(postcard, item, context));
    if (!andPass) {
      return false;
    }
  }

  if (Array.isArray(value.OR)) {
    const orPass = value.OR.some((item) => matchesWhereClause(postcard, item, context));
    if (!orPass) {
      return false;
    }
  }

  if (value.user && typeof value.user === 'object') {
    const user = context.usersById.get(postcard.userId);
    const userFilter = value.user as Record<string, unknown>;
    if (userFilter.email !== undefined && !matchesScalarCondition(user?.email ?? null, userFilter.email)) {
      return false;
    }
    if (
      userFilter.displayName !== undefined &&
      !matchesScalarCondition(user?.displayName ?? null, userFilter.displayName)
    ) {
      return false;
    }
  }

  if (value.reportCases && typeof value.reportCases === 'object') {
    const relation = value.reportCases as Record<string, unknown>;
    if (relation.some !== undefined && !context.reportedPostcardIds.has(postcard.id)) {
      return false;
    }
  }

  for (const [field, condition] of Object.entries(value)) {
    if (field === 'AND' || field === 'OR' || field === 'user' || field === 'reportCases') {
      continue;
    }
    if (!matchesScalarCondition(getPostcardFieldValue(postcard, field), condition)) {
      return false;
    }
  }

  return true;
}

function compareValue(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  const textA = String(a ?? '');
  const textB = String(b ?? '');
  return textA.localeCompare(textB);
}

function applyOrderBy(
  rows: DynamoPostcardRow[],
  orderBy: PostcardOrderByInput | PostcardOrderByInput[] | undefined
): DynamoPostcardRow[] {
  const orderList = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  if (orderList.length === 0) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    for (const order of orderList) {
      for (const [field, direction] of Object.entries(order)) {
        if (typeof direction !== 'string' || (direction !== 'asc' && direction !== 'desc')) {
          continue;
        }
        const valueCompare = compareValue(
          getPostcardFieldValue(left, field),
          getPostcardFieldValue(right, field)
        );
        if (valueCompare !== 0) {
          return direction === 'asc' ? valueCompare : -valueCompare;
        }
      }
    }
    return 0;
  });
}

function shuffleRows<T>(rows: T[]): T[] {
  const shuffled = [...rows];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

async function loadUsersByIds(userIds: string[]): Promise<Map<string, DynamoUserRow>> {
  const rows = await batchGetByIds(ddbTables.users, userIds);
  const map = new Map<string, DynamoUserRow>();
  for (const row of rows) {
    const id = String(row.id || '').trim();
    if (!id) {
      continue;
    }
    map.set(id, {
      id,
      email: toNullableString(row.email),
      displayName: toNullableString(row.displayName)
    });
  }
  return map;
}

async function loadTagsByPostcardIds(
  postcardIds: string[]
): Promise<Map<string, Array<{ tag: { id: string; name: string } }>>> {
  const postcardIdSet = new Set(postcardIds.map((id) => String(id)).filter(Boolean));
  if (postcardIdSet.size === 0) {
    return new Map();
  }

  const postcardTagRows = (
    await Promise.all(
      Array.from(postcardIdSet).map(async (postcardId) =>
        queryAllByIndex({
          tableName: ddbTables.postcardTags,
          indexName: 'postcardId-index',
          keyExpression: '#p = :p',
          attrNames: { '#p': 'postcardId' },
          attrValues: { ':p': postcardId }
        })
      )
    )
  ).flat();
  if (postcardTagRows.length === 0) {
    return new Map();
  }

  const tagIds = postcardTagRows.map((row) => String(row.tagId || ''));
  const tagRows = await batchGetByIds(ddbTables.tags, tagIds);
  const tagById = new Map(
    tagRows.map((row) => [String(row.id || ''), { id: String(row.id || ''), name: String(row.name || '') }])
  );

  const tagsByPostcardId = new Map<string, Array<{ tag: { id: string; name: string } }>>();
  for (const row of postcardTagRows) {
    const postcardId = String(row.postcardId || '');
    const tagId = String(row.tagId || '');
    const tag = tagById.get(tagId);
    if (!postcardId || !tag) {
      continue;
    }
    if (!tagsByPostcardId.has(postcardId)) {
      tagsByPostcardId.set(postcardId, []);
    }
    tagsByPostcardId.get(postcardId)?.push({ tag });
  }

  return tagsByPostcardId;
}

async function loadReportedPostcardIds(): Promise<Set<string>> {
  const reportCases = await scanAll(ddbTables.postcardReportCases);
  return new Set(
    reportCases
      .map((row) => String(row.postcardId || '').trim())
      .filter((postcardId) => postcardId.length > 0)
  );
}

const MAX_GEO_BUCKET_QUERIES = 24;

function shouldFallbackToLegacyOnEmptyProjection(): boolean {
  const raw = String(
    process.env.POSTCARD_EXPLORE_REQUIRE_LEGACY_FALLBACK || 'true'
  )
    .trim()
    .toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

function isMissingGeoIndexError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = String((error as { name?: string }).name || '');
  const message = String((error as { message?: string }).message || '').toLowerCase();
  return (
    name === 'ValidationException' &&
    (message.includes('specified index') || message.includes('index not found'))
  );
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return String((error as { name?: string }).name || '') === 'ResourceNotFoundException';
}

function matchesPublicKeyword(row: DynamoPostcardRow, keyword: string): boolean {
  if (!keyword) {
    return true;
  }

  return (
    stringContainsInsensitive(row.title, keyword) ||
    stringContainsInsensitive(row.notes, keyword) ||
    stringContainsInsensitive(row.placeName, keyword) ||
    stringContainsInsensitive(row.city, keyword) ||
    stringContainsInsensitive(row.state, keyword) ||
    stringContainsInsensitive(row.country, keyword) ||
    stringContainsInsensitive(row.aiPlaceGuess, keyword)
  );
}

type GeoQueryPlan = {
  layer: GeoBucketLayer;
  buckets: string[];
  useScanFallback: boolean;
};

async function scanRowsByBounds(bounds: GeoBounds): Promise<DynamoPostcardRow[]> {
  const allRows = await scanAll(ddbTables.postcards);
  return allRows
    .map((item) => toDynamoPostcardRow(item))
    .filter((row): row is DynamoPostcardRow => {
      if (!row || row.deletedAt) {
        return false;
      }
      if (typeof row.latitude !== 'number' || typeof row.longitude !== 'number') {
        return false;
      }
      return isCoordinateInBounds(row.latitude, row.longitude, bounds);
    });
}

function buildGeoQueryPlan(bounds: GeoBounds): GeoQueryPlan {
  const layers = getGeoBucketLayers();
  let widestCandidate: GeoQueryPlan = {
    layer: layers[layers.length - 1],
    buckets: [],
    useScanFallback: true
  };

  for (const layer of layers) {
    const buckets = enumerateGeoBucketsForBounds(bounds, layer.degrees);
    if (buckets.length === 0) {
      return {
        layer,
        buckets,
        useScanFallback: false
      };
    }
    if (buckets.length <= MAX_GEO_BUCKET_QUERIES) {
      return {
        layer,
        buckets,
        useScanFallback: false
      };
    }
    widestCandidate = {
      layer,
      buckets,
      useScanFallback: true
    };
  }

  return widestCandidate;
}

async function findRowsByGeoBounds(bounds: GeoBounds): Promise<DynamoPostcardRow[]> {
  const plan = buildGeoQueryPlan(bounds);
  const geoBuckets = plan.buckets;
  if (geoBuckets.length === 0) {
    return [];
  }
  if (plan.useScanFallback) {
    console.warn(
      `Public postcard bounds expanded to ${geoBuckets.length} geo buckets (max ${MAX_GEO_BUCKET_QUERIES}) on ${plan.layer.indexName}. Falling back to full table scan to preserve complete map results.`
    );
    return scanRowsByBounds(bounds);
  }

  let queryResults: Record<string, unknown>[][] = [];
  try {
    queryResults = await Promise.all(
      geoBuckets.map((geoBucket) =>
        queryAllByIndex({
          tableName: ddbTables.postcards,
          indexName: plan.layer.indexName,
          keyExpression: '#g = :g',
          attrNames: { '#g': plan.layer.fieldName },
          attrValues: { ':g': geoBucket },
          scanIndexForward: false
        })
      )
    );
  } catch (error) {
    if (isMissingGeoIndexError(error)) {
      throw new Error('Geo index unavailable for postcard list query.');
    }
    throw error;
  }

  const rowsById = new Map<string, DynamoPostcardRow>();
  for (const queryRows of queryResults) {
    for (const item of queryRows) {
      const row = toDynamoPostcardRow(item);
      if (!row) {
        continue;
      }
      rowsById.set(row.id, row);
    }
  }

  if (rowsById.size === 0 && plan.layer.fieldName !== 'geoBucket') {
    console.warn(
      `Public postcard query returned 0 rows via ${plan.layer.indexName}. Falling back to scan to avoid missing legacy rows before full geo backfill.`
    );
    return scanRowsByBounds(bounds);
  }

  return Array.from(rowsById.values());
}

async function findRowsByGeoBoundsFromExploreProjection(
  bounds: GeoBounds
): Promise<DynamoPostcardRow[] | null> {
  const plan = buildGeoQueryPlan(bounds);
  const geoBuckets = plan.buckets;
  if (geoBuckets.length === 0) {
    return [];
  }
  if (plan.useScanFallback) {
    return null;
  }

  let queryResults: Record<string, unknown>[][] = [];
  try {
    queryResults = await Promise.all(
      geoBuckets.map((geoBucket) =>
        queryAllByIndex({
          tableName: ddbTables.postcardsExplore,
          indexName: plan.layer.indexName,
          keyExpression: '#g = :g',
          attrNames: { '#g': plan.layer.fieldName },
          attrValues: { ':g': geoBucket },
          scanIndexForward: false
        })
      )
    );
  } catch (error) {
    if (isMissingGeoIndexError(error) || isMissingTableError(error)) {
      return null;
    }
    throw error;
  }

  const rowsById = new Map<string, DynamoPostcardRow>();
  for (const queryRows of queryResults) {
    for (const item of queryRows) {
      const row = toDynamoPostcardRow(item);
      if (!row) {
        continue;
      }
      rowsById.set(row.id, row);
    }
  }

  return Array.from(rowsById.values());
}

async function findRowsForList(
  args: PostcardFindManyInput
): Promise<{
  rows: DynamoPostcardRow[];
  total: number;
  usersById: Map<string, DynamoUserRow>;
}> {
  const allRows = await scanAll(ddbTables.postcards);
  const postcards = allRows
    .map((row) => toDynamoPostcardRow(row))
    .filter((row): row is DynamoPostcardRow => Boolean(row));

  const userIds = Array.from(new Set(postcards.map((row) => row.userId)));
  const [usersById, reportedPostcardIds] = await Promise.all([
    loadUsersByIds(userIds),
    loadReportedPostcardIds()
  ]);

  const filtered = postcards.filter((row) =>
    matchesWhereClause(row, args.where, {
      usersById,
      reportedPostcardIds
    })
  );
  const ordered = applyOrderBy(filtered, args.orderBy);
  const total = ordered.length;
  const skipped = typeof args.skip === 'number' && args.skip > 0 ? ordered.slice(args.skip) : ordered;
  const rows = typeof args.take === 'number' ? skipped.slice(0, args.take) : skipped;

  return {
    rows,
    total,
    usersById
  };
}

function toListRow(
  row: DynamoPostcardRow,
  user: DynamoUserRow | undefined,
  tags: Array<{ tag: { id: string; name: string } }>
): PostcardListRow {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    postcardType: normalizePostcardType(row.postcardType),
    notes: row.notes ?? null,
    imageUrl: row.imageUrl ?? null,
    originalImageUrl: row.originalImageUrl ?? null,
    capturedAt: toDateOrNull(row.capturedAt),
    city: row.city ?? null,
    state: row.state ?? null,
    country: row.country ?? null,
    placeName: row.placeName ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    aiLatitude: row.aiLatitude ?? null,
    aiLongitude: row.aiLongitude ?? null,
    aiConfidence: row.aiConfidence ?? null,
    aiPlaceGuess: row.aiPlaceGuess ?? null,
    likeCount: Number(row.likeCount || 0),
    dislikeCount: Number(row.dislikeCount || 0),
    wrongLocationReports: Number(row.wrongLocationReports || 0),
    reportVersion: Number(row.reportVersion || 1),
    locationStatus: normalizeLocationStatus(row.locationStatus),
    locationModelVersion: row.locationModelVersion ?? null,
    deletedAt: toDateOrNull(row.deletedAt),
    createdAt: toDateOrNull(row.createdAt) ?? new Date(),
    updatedAt: toDateOrNull(row.updatedAt) ?? new Date(),
    user: {
      email: normalizeEmail(user?.email),
      displayName: toNullableString(user?.displayName)
    },
    tags,
    uploaderName: uploaderName(user)
  } as unknown as PostcardListRow;
}

async function findForList(args: PostcardFindManyInput): Promise<PostcardListRow[]> {
  const { rows, usersById } = await findRowsForList(args);
  const tagsByPostcardId = await loadTagsByPostcardIds(rows.map((row) => row.id));
  return rows.map((row) => toListRow(row, usersById.get(row.userId), tagsByPostcardId.get(row.id) ?? []));
}

async function findForPublicQuery(args: FindPublicPostcardsInput): Promise<{
  rows: PostcardListRow[];
  total: number;
}> {
  const sortOrder = buildPublicOrderBy(args.sort);
  const keyword = String(args.q || '').trim();
  const bounds = args.bounds;
  const fromProjection = await findRowsByGeoBoundsFromExploreProjection(bounds);
  const geoRows = (() => {
    if (!fromProjection) {
      return findRowsByGeoBounds(bounds);
    }
    if (fromProjection.length === 0 && shouldFallbackToLegacyOnEmptyProjection()) {
      return findRowsByGeoBounds(bounds);
    }
    return Promise.resolve(fromProjection);
  })();
  const resolvedGeoRows = await geoRows;

  const filtered = resolvedGeoRows.filter((row) => {
    if (row.deletedAt) {
      return false;
    }
    if (typeof row.latitude !== 'number' || typeof row.longitude !== 'number') {
      return false;
    }
    if (bounds && !isCoordinateInBounds(row.latitude, row.longitude, bounds)) {
      return false;
    }
    return matchesPublicKeyword(row, keyword);
  });

  const ordered = isRandomPublicSort(args.sort) ? shuffleRows(filtered) : applyOrderBy(filtered, sortOrder);
  const total = ordered.length;
  const rows = ordered.slice(0, args.limit);
  const usersById = await loadUsersByIds(Array.from(new Set(rows.map((row) => row.userId))));

  return {
    rows: rows.map((row) => toListRow(row, usersById.get(row.userId), [])),
    total
  };
}

async function findForListWithTotal(
  args: PostcardFindManyInput
): Promise<{
  rows: PostcardListRow[];
  total: number;
}> {
  const { rows, total, usersById } = await findRowsForList(args);
  const tagsByPostcardId = await loadTagsByPostcardIds(rows.map((row) => row.id));
  return {
    rows: rows.map((row) => toListRow(row, usersById.get(row.userId), tagsByPostcardId.get(row.id) ?? [])),
    total
  };
}

async function findById(postcardId: string): Promise<PostcardListRow | null> {
  const result = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcards,
      Key: { id: postcardId }
    })
  );
  const row = toDynamoPostcardRow(result.Item as UnknownRecord);
  if (!row || row.deletedAt) {
    return null;
  }

  const [usersById, tagsByPostcardId] = await Promise.all([
    loadUsersByIds([row.userId]),
    loadTagsByPostcardIds([row.id])
  ]);
  return toListRow(row, usersById.get(row.userId), tagsByPostcardId.get(row.id) ?? []);
}

async function count(where: PostcardWhereInput): Promise<number> {
  const result = await findRowsForList({ where });
  return result.total;
}

async function create(input: CreatePostcardInput): Promise<Record<string, unknown>> {
  const timestamp = nowIso();
  const id = newId('pc');
  const item: UnknownRecord = {
    id,
    userId: input.userId,
    title: input.title,
    postcardType: normalizePostcardType(input.postcardType),
    notes: input.notes ?? null,
    imageUrl: input.imageUrl ?? null,
    originalImageUrl: input.originalImageUrl ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    country: input.country ?? null,
    placeName: input.placeName ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    aiLatitude: input.aiLatitude ?? null,
    aiLongitude: input.aiLongitude ?? null,
    aiConfidence: input.aiConfidence ?? null,
    aiPlaceGuess: input.aiPlaceGuess ?? null,
    likeCount: 0,
    dislikeCount: 0,
    wrongLocationReports: 0,
    reportVersion: 1,
    locationStatus: normalizeLocationStatus(input.locationStatus),
    locationModelVersion: input.locationModelVersion ?? null,
    ...buildGeoBucketFieldsFromCoordinates(input.latitude ?? null, input.longitude ?? null),
    deletedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.postcards,
      Item: item
    })
  );
  await upsertPostcardExploreProjectionFromSource(item);

  return item;
}

async function findCropSource(params: {
  postcardId: string;
  userId?: string;
}): Promise<PostcardCropSource | null> {
  const result = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcards,
      Key: { id: params.postcardId }
    })
  );
  const row = toDynamoPostcardRow(result.Item as UnknownRecord);
  if (!row || row.deletedAt) {
    return null;
  }
  if (params.userId && String(row.userId) !== String(params.userId)) {
    return null;
  }

  return {
    id: row.id,
    imageUrl: row.imageUrl ?? null,
    originalImageUrl: row.originalImageUrl ?? null
  };
}

async function findEditableForActor(params: {
  postcardId: string;
  actorId: string;
  canEditAny: boolean;
}): Promise<EditablePostcard | null> {
  const result = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcards,
      Key: { id: params.postcardId }
    })
  );
  const row = toDynamoPostcardRow(result.Item as UnknownRecord);
  if (!row || row.deletedAt) {
    return null;
  }
  if (!params.canEditAny && String(row.userId) !== String(params.actorId)) {
    return null;
  }

  return toEditablePostcard(row);
}

function extractUpdateValue(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'set' in (value as UnknownRecord)) {
    return (value as UnknownRecord).set;
  }
  return value;
}

function applyPostcardUpdateData(row: DynamoPostcardRow, updateData: PostcardUpdateInput): DynamoPostcardRow {
  const next: DynamoPostcardRow = { ...row };
  for (const [field, rawValue] of Object.entries(updateData as UnknownRecord)) {
    const value = extractUpdateValue(rawValue);
    switch (field) {
      case 'title':
      case 'notes':
      case 'placeName':
      case 'city':
      case 'state':
      case 'country':
      case 'imageUrl':
      case 'originalImageUrl':
      case 'locationModelVersion':
      case 'aiPlaceGuess':
        (next as UnknownRecord)[field] = toNullableString(value);
        break;
      case 'postcardType':
        next.postcardType = normalizePostcardType(value);
        break;
      case 'latitude':
      case 'longitude':
      case 'aiLatitude':
      case 'aiLongitude':
      case 'aiConfidence':
        (next as UnknownRecord)[field] = toNumberOrNull(value);
        break;
      case 'locationStatus':
        next.locationStatus = normalizeLocationStatus(value);
        break;
      case 'deletedAt': {
        const dateValue = value instanceof Date ? value.toISOString() : toNullableString(value);
        next.deletedAt = dateValue;
        break;
      }
      default:
        (next as UnknownRecord)[field] = value as unknown;
        break;
    }
  }

  const geoBuckets = buildGeoBucketFieldsFromCoordinates(
    next.latitude ?? null,
    next.longitude ?? null
  );
  next.geoBucket = geoBuckets.geoBucket;
  next.geoBucketMedium = geoBuckets.geoBucketMedium;
  next.geoBucketCoarse = geoBuckets.geoBucketCoarse;
  return next;
}

async function applyCropUpdateWithHistory(params: {
  postcardId: string;
  actorId: string;
  canEditAny: boolean;
  imageUrl: string;
  originalImageUrl?: string | null;
  crop: CropBox;
}): Promise<{ imageUrl: string | null; originalImageUrl: string | null } | null> {
  const current = await findEditableForActor({
    postcardId: params.postcardId,
    actorId: params.actorId,
    canEditAny: params.canEditAny
  });
  if (!current) {
    return null;
  }

  const getResult = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcards,
      Key: { id: params.postcardId }
    })
  );
  const row = toDynamoPostcardRow(getResult.Item as UnknownRecord);
  if (!row) {
    return null;
  }

  const updatedRow: UnknownRecord = {
    ...row,
    imageUrl: params.imageUrl,
    ...(params.originalImageUrl ? { originalImageUrl: params.originalImageUrl } : {}),
    updatedAt: nowIso()
  };

  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.postcards,
      Item: updatedRow
    })
  );
  await upsertPostcardExploreProjectionFromSource(updatedRow);

  const afterEditable = toEditablePostcard(toDynamoPostcardRow(updatedRow)!);
  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.postcardEditHistory,
      Item: {
        id: newId('peh'),
        postcardId: params.postcardId,
        userId: params.actorId,
        action: PostcardEditAction.CROP_UPDATED,
        beforeData: toEditSnapshot(current),
        afterData: {
          ...toEditSnapshot(afterEditable),
          crop: params.crop
        },
        createdAt: nowIso()
      }
    })
  );

  return {
    imageUrl: toNullableString(updatedRow.imageUrl),
    originalImageUrl: toNullableString(updatedRow.originalImageUrl)
  };
}

async function applyDetailsUpdateWithHistory(params: {
  postcardId: string;
  actorId: string;
  canEditAny: boolean;
  updateData: PostcardUpdateInput;
}): Promise<EditablePostcard | null> {
  const current = await findEditableForActor({
    postcardId: params.postcardId,
    actorId: params.actorId,
    canEditAny: params.canEditAny
  });
  if (!current) {
    return null;
  }

  const getResult = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcards,
      Key: { id: params.postcardId }
    })
  );
  const row = toDynamoPostcardRow(getResult.Item as UnknownRecord);
  if (!row) {
    return null;
  }

  const updated = applyPostcardUpdateData(row, params.updateData);
  const updatedItem: UnknownRecord = {
    ...updated,
    updatedAt: nowIso()
  };
  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.postcards,
      Item: updatedItem
    })
  );
  await upsertPostcardExploreProjectionFromSource(updatedItem);

  const afterEditable = toEditablePostcard(toDynamoPostcardRow(updatedItem)!);
  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.postcardEditHistory,
      Item: {
        id: newId('peh'),
        postcardId: params.postcardId,
        userId: params.actorId,
        action: PostcardEditAction.DETAILS_UPDATED,
        beforeData: toEditSnapshot(current),
        afterData: toEditSnapshot(afterEditable),
        createdAt: nowIso()
      }
    })
  );

  return afterEditable;
}

async function softDeleteWithHistory(params: {
  postcardId: string;
  actorId: string;
  deletedAt: Date;
}): Promise<boolean> {
  const getResult = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcards,
      Key: { id: params.postcardId }
    })
  );
  const row = toDynamoPostcardRow(getResult.Item as UnknownRecord);
  if (!row || row.deletedAt || String(row.userId) !== String(params.actorId)) {
    return false;
  }

  const beforeEditable = toEditablePostcard(row);
  const deletedAt = params.deletedAt.toISOString();
  const updatedItem: UnknownRecord = {
    ...row,
    deletedAt,
    updatedAt: nowIso()
  };
  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.postcards,
      Item: updatedItem
    })
  );
  await upsertPostcardExploreProjectionFromSource(updatedItem);

  const afterEditable = toEditablePostcard(toDynamoPostcardRow(updatedItem)!);
  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.postcardEditHistory,
      Item: {
        id: newId('peh'),
        postcardId: params.postcardId,
        userId: params.actorId,
        action: PostcardEditAction.SOFT_DELETED,
        beforeData: toEditSnapshot(beforeEditable),
        afterData: toEditSnapshot(afterEditable),
        createdAt: nowIso()
      }
    })
  );

  return true;
}

async function findSavedPostcardIdsByUser(params: {
  userId: string;
  take?: number;
}): Promise<string[]> {
  const take = typeof params.take === 'number' && params.take > 0 ? params.take : undefined;
  const rows = await queryAllByIndex({
    tableName: ddbTables.postcardFeedback,
    indexName: 'userId-createdAt-index',
    keyExpression: '#u = :u',
    attrNames: { '#u': 'userId' },
    attrValues: { ':u': params.userId },
    scanIndexForward: false,
    limit: take ? Math.max(take * 5, take) : undefined
  });

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const action = normalizeFeedbackAction(String(row.action || ''));
    if (action !== FeedbackAction.FAVORITE && action !== FeedbackAction.COLLECTED) {
      continue;
    }
    const postcardId = String(row.postcardId || '').trim();
    if (!postcardId || seen.has(postcardId)) {
      continue;
    }
    seen.add(postcardId);
    ordered.push(postcardId);
    if (take && ordered.length >= take) {
      break;
    }
  }

  return ordered;
}

async function findViewerFeedbackRowsForPostcards(params: {
  userId: string;
  postcardIds: string[];
}): Promise<PostcardFeedbackRow[]> {
  const postcardIds = Array.from(new Set(params.postcardIds.map((id) => String(id)).filter(Boolean)));
  if (postcardIds.length === 0) {
    return [];
  }
  const postcardIdSet = new Set(postcardIds);

  const [feedbackRows, reports, postcards] = await Promise.all([
    queryAllByIndex({
      tableName: ddbTables.postcardFeedback,
      indexName: 'userId-createdAt-index',
      keyExpression: '#u = :u',
      attrNames: { '#u': 'userId' },
      attrValues: { ':u': params.userId },
      scanIndexForward: false
    }),
    queryAllByIndex({
      tableName: ddbTables.postcardReports,
      indexName: 'reporterUserId-createdAt-index',
      keyExpression: '#u = :u',
      attrNames: { '#u': 'reporterUserId' },
      attrValues: { ':u': params.userId },
      scanIndexForward: false
    }),
    batchGetByIds(ddbTables.postcards, postcardIds)
  ]);

  const versionByPostcardId = new Map(
    postcards.map((row) => [String(row.id || ''), Number(row.reportVersion || 1)])
  );

  const output: PostcardFeedbackRow[] = [];
  for (const row of feedbackRows) {
    const postcardId = String(row.postcardId || '');
    if (!postcardIdSet.has(postcardId)) {
      continue;
    }
    const action = normalizeFeedbackAction(String(row.action || ''));
    if (
      action === FeedbackAction.LIKE ||
      action === FeedbackAction.DISLIKE ||
      action === FeedbackAction.FAVORITE ||
      action === FeedbackAction.COLLECTED
    ) {
      output.push({ postcardId, action });
    }
  }

  for (const report of reports) {
    const postcardId = String(report.postcardId || '');
    if (!postcardIdSet.has(postcardId)) {
      continue;
    }
    if (Number(report.version || 0) !== Number(versionByPostcardId.get(postcardId) || 0)) {
      continue;
    }
    output.push({
      postcardId,
      action: FeedbackAction.REPORT_WRONG_LOCATION
    });
  }

  return output;
}

async function getFeedbackByUnique(uniqueKey: string): Promise<UnknownRecord | null> {
  const result = await ddbDoc.send(
    new QueryCommand({
      TableName: ddbTables.postcardFeedback,
      IndexName: 'uniqueKey-index',
      KeyConditionExpression: '#u = :u',
      ExpressionAttributeNames: { '#u': 'uniqueKey' },
      ExpressionAttributeValues: { ':u': uniqueKey },
      Limit: 1
    })
  );
  const item = result.Items?.[0];
  return item ? (item as UnknownRecord) : null;
}

async function getPostcardById(postcardId: string): Promise<DynamoPostcardRow | null> {
  const result = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcards,
      Key: { id: postcardId }
    })
  );
  return toDynamoPostcardRow(result.Item as UnknownRecord);
}

async function addPostcardCounter(postcardId: string, field: string, delta: number): Promise<void> {
  await ddbDoc.send(
    new UpdateCommand({
      TableName: ddbTables.postcards,
      Key: { id: postcardId },
      UpdateExpression: 'SET #f = if_not_exists(#f, :zero) + :delta, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#f': field },
      ExpressionAttributeValues: {
        ':zero': 0,
        ':delta': delta,
        ':updatedAt': nowIso()
      }
    })
  );
  await syncPostcardExploreProjectionById(postcardId);
}

async function createOrGetReportCase(postcardId: string, version: number): Promise<UnknownRecord> {
  const rows = await queryAllByIndex({
    tableName: ddbTables.postcardReportCases,
    indexName: 'postcardId-updatedAt-index',
    keyExpression: '#p = :p',
    attrNames: { '#p': 'postcardId' },
    attrValues: { ':p': postcardId },
    scanIndexForward: false
  });

  const existing = rows.find((row) => Number(row.version || 0) === Number(version));
  if (existing) {
    return existing;
  }

  const timestamp = nowIso();
  const item: UnknownRecord = {
    id: newId('rpc'),
    postcardId,
    version,
    status: PostcardReportStatus.PENDING,
    adminNote: null,
    resolvedAt: null,
    resolvedByUserId: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.postcardReportCases,
      Item: item
    })
  );
  return item;
}

async function buildViewerFeedbackForPostcard(postcardId: string, userId: string) {
  const postcard = await getPostcardById(postcardId);
  if (!postcard) {
    return null;
  }

  const feedbackRows = await queryAllByIndex({
    tableName: ddbTables.postcardFeedback,
    indexName: 'userId-createdAt-index',
    keyExpression: '#u = :u',
    attrNames: { '#u': 'userId' },
    attrValues: { ':u': userId },
    scanIndexForward: false
  });

  const actions = feedbackRows
    .filter((row) => String(row.postcardId || '') === postcardId)
    .map((row) => normalizeFeedbackAction(String(row.action || '')))
    .filter(
      (action): action is FeedbackAction =>
        action === FeedbackAction.LIKE ||
        action === FeedbackAction.DISLIKE ||
        action === FeedbackAction.FAVORITE ||
        action === FeedbackAction.COLLECTED
    );

  const viewerFeedback = toViewerFeedback(actions);

  const uniqueReportKey = `${postcardId}#${Number(postcard.reportVersion || 1)}#${userId}`;
  const reportResult = await queryAllByIndex({
    tableName: ddbTables.postcardReports,
    indexName: 'uniqueKey-index',
    keyExpression: '#u = :u',
    attrNames: { '#u': 'uniqueKey' },
    attrValues: { ':u': uniqueReportKey },
    limit: 1
  });

  return {
    ...viewerFeedback,
    reportedWrongLocation: reportResult.length > 0
  };
}

function toPostcardReportReason(reason: PostcardReportReason | undefined): PostcardReportReason {
  if (
    reason === PostcardReportReason.WRONG_LOCATION ||
    reason === PostcardReportReason.SPAM ||
    reason === PostcardReportReason.ILLEGAL_IMAGE ||
    reason === PostcardReportReason.OTHER
  ) {
    return reason;
  }
  return PostcardReportReason.WRONG_LOCATION;
}

async function submitFeedback(
  params: SubmitPostcardFeedbackInput
): Promise<SubmitPostcardFeedbackResult | null> {
  const postcard = await getPostcardById(params.postcardId);
  if (!postcard || postcard.deletedAt) {
    return null;
  }

  let result: SubmitPostcardFeedbackResult['result'] = 'added';
  const now = nowIso();

  if (params.action === 'like' || params.action === 'dislike') {
    const likeKey = `${params.postcardId}#${params.userId}#${FeedbackAction.LIKE}`;
    const dislikeKey = `${params.postcardId}#${params.userId}#${FeedbackAction.DISLIKE}`;
    const sameKey = params.action === 'like' ? likeKey : dislikeKey;
    const oppositeKey = params.action === 'like' ? dislikeKey : likeKey;

    const [same, opposite] = await Promise.all([
      getFeedbackByUnique(sameKey),
      getFeedbackByUnique(oppositeKey)
    ]);

    if (same) {
      await ddbDoc.send(
        new DeleteCommand({
          TableName: ddbTables.postcardFeedback,
          Key: { id: String(same.id) }
        })
      );
      await addPostcardCounter(
        params.postcardId,
        params.action === 'like' ? 'likeCount' : 'dislikeCount',
        -1
      );
      result = 'removed';
    } else {
      if (opposite) {
        await ddbDoc.send(
          new DeleteCommand({
            TableName: ddbTables.postcardFeedback,
            Key: { id: String(opposite.id) }
          })
        );
        await addPostcardCounter(
          params.postcardId,
          params.action === 'like' ? 'dislikeCount' : 'likeCount',
          -1
        );
        result = 'switched';
      }

      await ddbDoc.send(
        new PutCommand({
          TableName: ddbTables.postcardFeedback,
          Item: {
            id: newId('fb'),
            postcardId: params.postcardId,
            userId: params.userId,
            action: params.action === 'like' ? FeedbackAction.LIKE : FeedbackAction.DISLIKE,
            createdAt: now,
            uniqueKey: sameKey
          }
        })
      );
      await addPostcardCounter(
        params.postcardId,
        params.action === 'like' ? 'likeCount' : 'dislikeCount',
        1
      );
    }
  } else if (params.action === 'favorite' || params.action === 'collected') {
    const action = params.action === 'favorite' ? FeedbackAction.FAVORITE : FeedbackAction.COLLECTED;
    const uniqueKey = `${params.postcardId}#${params.userId}#${action}`;
    const existing = await getFeedbackByUnique(uniqueKey);
    if (existing) {
      await ddbDoc.send(
        new DeleteCommand({
          TableName: ddbTables.postcardFeedback,
          Key: { id: String(existing.id) }
        })
      );
      result = 'removed';
    } else {
      await ddbDoc.send(
        new PutCommand({
          TableName: ddbTables.postcardFeedback,
          Item: {
            id: newId('fb'),
            postcardId: params.postcardId,
            userId: params.userId,
            action,
            createdAt: now,
            uniqueKey
          }
        })
      );
      result = 'added';
    }
  } else {
    const reportVersion = Number(postcard.reportVersion || 1);
    const uniqueKey = `${params.postcardId}#${reportVersion}#${params.userId}`;
    const existingReport = await queryAllByIndex({
      tableName: ddbTables.postcardReports,
      indexName: 'uniqueKey-index',
      keyExpression: '#u = :u',
      attrNames: { '#u': 'uniqueKey' },
      attrValues: { ':u': uniqueKey },
      limit: 1
    });

    if (existingReport.length > 0) {
      result = 'already_reported';
    } else {
      const reportCase = await createOrGetReportCase(params.postcardId, reportVersion);
      await ddbDoc.send(
        new PutCommand({
          TableName: ddbTables.postcardReports,
          Item: {
            id: newId('rpt'),
            postcardId: params.postcardId,
            version: reportVersion,
            caseId: String(reportCase.id),
            reporterUserId: params.userId,
            reason: toPostcardReportReason(params.reportReason),
            description: toNullableString(params.reportDescription),
            uniqueKey,
            createdAt: now,
            updatedAt: now
          }
        })
      );
      await addPostcardCounter(params.postcardId, 'wrongLocationReports', 1);
    }
  }

  const latestPostcard = await getPostcardById(params.postcardId);
  if (!latestPostcard) {
    return null;
  }
  const viewerFeedback = await buildViewerFeedbackForPostcard(params.postcardId, params.userId);
  if (!viewerFeedback) {
    return null;
  }

  return {
    id: latestPostcard.id,
    likeCount: Number(latestPostcard.likeCount || 0),
    dislikeCount: Number(latestPostcard.dislikeCount || 0),
    wrongLocationReports: Number(latestPostcard.wrongLocationReports || 0),
    result,
    action: params.action,
    viewerFeedback
  };
}

export const dynamoPostcardRepo: PostcardRepo = {
  findForList,
  findForPublicQuery,
  findForListWithTotal,
  findById,
  count,
  create,
  findCropSource,
  findEditableForActor,
  applyCropUpdateWithHistory,
  applyDetailsUpdateWithHistory,
  softDeleteWithHistory,
  findSavedPostcardIdsByUser,
  findViewerFeedbackRowsForPostcards,
  submitFeedback
};
