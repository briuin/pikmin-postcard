import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { maskEmail } from '@/lib/postcards/shared';
import {
  batchGetByIds,
  ddbDoc,
  ddbTables,
  isDynamoResourceNotFoundError,
  newId,
  nowIso,
  scanAll
} from '@/lib/repos/dynamodb/shared';
import {
  PlantPathVisibility,
  type PlantPathCoordinate,
  type PlantPathListPayload,
  type PlantPathRecord
} from '@/lib/plant-paths/types';

type DynamoPlantPathCoordinateRow = {
  id?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

type DynamoPlantPathRow = {
  id: string;
  ownerUserId: string;
  name: string;
  visibility?: string | null;
  coordinates?: DynamoPlantPathCoordinateRow[] | null;
  sourcePathId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type DynamoPlantPathSaveRow = {
  id: string;
  userId: string;
  pathId: string;
  uniqueKey?: string;
  createdAt?: string | null;
};

type DynamoUserRow = {
  id: string;
  email?: string | null;
  displayName?: string | null;
};

function isMissingTableError(error: unknown): boolean {
  return isDynamoResourceNotFoundError(error);
}

export function isPlantPathStorageMissingError(error: unknown): boolean {
  return isMissingTableError(error);
}

export function getPlantPathStorageUnavailableMessage(): string {
  return `Plant Paths storage is not provisioned for ${ddbTables.plantPaths}. Run npm run ddb:provision for the current DDB_TABLE_PREFIX first.`;
}

function normalizeVisibility(value: unknown): PlantPathVisibility {
  return value === PlantPathVisibility.PUBLIC ? PlantPathVisibility.PUBLIC : PlantPathVisibility.PRIVATE;
}

function normalizeCoordinate(row: DynamoPlantPathCoordinateRow, fallbackIndex: number): PlantPathCoordinate | null {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return {
    id: typeof row.id === 'string' && row.id.trim().length > 0 ? row.id.trim() : newId(`ppc${fallbackIndex}`),
    latitude,
    longitude
  };
}

function normalizeCoordinates(rows: DynamoPlantPathCoordinateRow[] | null | undefined): PlantPathCoordinate[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.flatMap((row, index) => {
    const normalized = normalizeCoordinate(row, index);
    return normalized ? [normalized] : [];
  });
}

function ownerNameFromUser(user: DynamoUserRow | undefined): string {
  const displayName =
    typeof user?.displayName === 'string' && user.displayName.trim().length > 0
      ? user.displayName.trim()
      : null;
  if (displayName) {
    return displayName;
  }
  return maskEmail(user?.email) ?? 'hidden';
}

function toRecord(
  row: DynamoPlantPathRow,
  options: {
    viewerUserId: string | null;
    savedPathIds: Set<string>;
    userById: Map<string, DynamoUserRow>;
  }
): PlantPathRecord {
  const createdAt = typeof row.createdAt === 'string' && row.createdAt.trim() ? row.createdAt : nowIso();
  const updatedAt = typeof row.updatedAt === 'string' && row.updatedAt.trim() ? row.updatedAt : createdAt;
  const ownerUserId = String(row.ownerUserId || '').trim();
  return {
    id: String(row.id),
    ownerUserId,
    ownerName: ownerNameFromUser(options.userById.get(ownerUserId)),
    name: String(row.name || 'Untitled path').trim() || 'Untitled path',
    visibility: normalizeVisibility(row.visibility),
    coordinates: normalizeCoordinates(row.coordinates),
    createdAt,
    updatedAt,
    isOwnedByViewer: options.viewerUserId === ownerUserId,
    isSavedByViewer: options.savedPathIds.has(String(row.id)),
    sourcePathId:
      typeof row.sourcePathId === 'string' && row.sourcePathId.trim().length > 0
        ? row.sourcePathId.trim()
        : null
  };
}

function sortByUpdatedDesc<T extends { updatedAt: string }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function loadAllPathRows(): Promise<DynamoPlantPathRow[]> {
  try {
    return (await scanAll(ddbTables.plantPaths)) as DynamoPlantPathRow[];
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn(`Plant Paths table ${ddbTables.plantPaths} is missing. Returning empty path list.`);
      return [];
    }
    throw error;
  }
}

async function loadAllSaveRows(): Promise<DynamoPlantPathSaveRow[]> {
  try {
    return (await scanAll(ddbTables.plantPathSaves)) as DynamoPlantPathSaveRow[];
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn(`Plant Path saves table ${ddbTables.plantPathSaves} is missing. Returning empty saves list.`);
      return [];
    }
    throw error;
  }
}

async function loadUserByIdMap(pathRows: DynamoPlantPathRow[]): Promise<Map<string, DynamoUserRow>> {
  const userIds = Array.from(new Set(pathRows.map((row) => String(row.ownerUserId || '').trim()).filter(Boolean)));
  const users = (await batchGetByIds(ddbTables.users, userIds)) as DynamoUserRow[];
  return new Map(users.map((user) => [String(user.id), user]));
}

async function findPathRowById(pathId: string): Promise<DynamoPlantPathRow | null> {
  const result = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.plantPaths,
      Key: { id: pathId }
    })
  );
  return (result.Item as DynamoPlantPathRow | undefined) ?? null;
}

export async function listPlantPaths(viewerUserId: string | null): Promise<PlantPathListPayload> {
  const [pathRows, saveRows] = await Promise.all([loadAllPathRows(), viewerUserId ? loadAllSaveRows() : Promise.resolve([])]);
  const activePathRows = pathRows.filter((row) => String(row.id || '').trim().length > 0);
  const savedPathIds = new Set(
    saveRows
      .filter((row) => String(row.userId || '').trim() === String(viewerUserId || '').trim())
      .map((row) => String(row.pathId || '').trim())
      .filter(Boolean)
  );
  const userById = await loadUserByIdMap(activePathRows);

  const publicPaths = sortByUpdatedDesc(
    activePathRows
      .filter((row) => normalizeVisibility(row.visibility) === PlantPathVisibility.PUBLIC)
      .map((row) =>
        toRecord(row, {
          viewerUserId,
          savedPathIds,
          userById
        })
      )
  );

  const ownedPaths = viewerUserId
    ? sortByUpdatedDesc(
        activePathRows
          .filter((row) => String(row.ownerUserId || '').trim() === viewerUserId)
          .map((row) =>
            toRecord(row, {
              viewerUserId,
              savedPathIds,
              userById
            })
          )
      )
    : [];

  const publicById = new Map(publicPaths.map((row) => [row.id, row]));
  const savedPaths = viewerUserId
    ? sortByUpdatedDesc(
        Array.from(savedPathIds)
          .map((pathId) => publicById.get(pathId) ?? null)
          .filter((row): row is PlantPathRecord => row !== null && !row.isOwnedByViewer)
      )
    : [];

  return {
    ownedPaths,
    savedPaths,
    publicPaths
  };
}

export async function createPlantPath(input: {
  userId: string;
  name: string;
}): Promise<PlantPathRecord> {
  const now = nowIso();
  const row: DynamoPlantPathRow = {
    id: newId('pp'),
    ownerUserId: input.userId,
    name: input.name.trim(),
    visibility: PlantPathVisibility.PRIVATE,
    coordinates: [],
    sourcePathId: null,
    createdAt: now,
    updatedAt: now
  };

  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.plantPaths,
      Item: row
    })
  );

  const userById = await loadUserByIdMap([row]);
  return toRecord(row, {
    viewerUserId: input.userId,
    savedPathIds: new Set<string>(),
    userById
  });
}

export async function updatePlantPath(input: {
  userId: string;
  pathId: string;
  name: string;
  visibility: PlantPathVisibility;
  coordinates: PlantPathCoordinate[];
}): Promise<PlantPathRecord | null> {
  const existing = await findPathRowById(input.pathId);
  if (!existing || String(existing.ownerUserId || '').trim() !== input.userId) {
    return null;
  }

  const updated: DynamoPlantPathRow = {
    ...existing,
    name: input.name.trim(),
    visibility: input.visibility,
    coordinates: input.coordinates.map((coordinate) => ({
      id: coordinate.id,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude
    })),
    updatedAt: nowIso()
  };

  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.plantPaths,
      Item: updated
    })
  );

  const userById = await loadUserByIdMap([updated]);
  return toRecord(updated, {
    viewerUserId: input.userId,
    savedPathIds: new Set<string>(),
    userById
  });
}

export async function deletePlantPath(input: {
  userId: string;
  pathId: string;
}): Promise<boolean> {
  const existing = await findPathRowById(input.pathId);
  if (!existing || String(existing.ownerUserId || '').trim() !== input.userId) {
    return false;
  }

  await ddbDoc.send(
    new DeleteCommand({
      TableName: ddbTables.plantPaths,
      Key: { id: input.pathId }
    })
  );

  const saveRows = await loadAllSaveRows();
  await Promise.all(
    saveRows
      .filter((row) => String(row.pathId || '').trim() === input.pathId)
      .map((row) =>
        ddbDoc.send(
          new DeleteCommand({
            TableName: ddbTables.plantPathSaves,
            Key: { id: row.id }
          })
        )
      )
  );

  return true;
}

export async function savePublicPlantPath(input: {
  userId: string;
  pathId: string;
}): Promise<boolean> {
  const [path, saveRows] = await Promise.all([findPathRowById(input.pathId), loadAllSaveRows()]);
  if (!path) {
    return false;
  }
  if (normalizeVisibility(path.visibility) !== PlantPathVisibility.PUBLIC) {
    return false;
  }
  if (String(path.ownerUserId || '').trim() === input.userId) {
    return false;
  }

  const existing = saveRows.find(
    (row) =>
      String(row.userId || '').trim() === input.userId && String(row.pathId || '').trim() === input.pathId
  );
  if (existing) {
    return true;
  }

  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.plantPathSaves,
      Item: {
        id: newId('pps'),
        userId: input.userId,
        pathId: input.pathId,
        uniqueKey: `${input.userId}#${input.pathId}`,
        createdAt: nowIso()
      }
    })
  );

  return true;
}

export async function unsavePublicPlantPath(input: {
  userId: string;
  pathId: string;
}): Promise<boolean> {
  const saveRows = await loadAllSaveRows();
  const existing = saveRows.find(
    (row) =>
      String(row.userId || '').trim() === input.userId && String(row.pathId || '').trim() === input.pathId
  );
  if (!existing) {
    return true;
  }

  await ddbDoc.send(
    new DeleteCommand({
      TableName: ddbTables.plantPathSaves,
      Key: { id: existing.id }
    })
  );

  return true;
}

export async function clonePlantPath(input: {
  userId: string;
  pathId: string;
}): Promise<PlantPathRecord | null> {
  const path = await findPathRowById(input.pathId);
  if (!path) {
    return null;
  }
  const isOwner = String(path.ownerUserId || '').trim() === input.userId;
  const isPublic = normalizeVisibility(path.visibility) === PlantPathVisibility.PUBLIC;
  if (!isOwner && !isPublic) {
    return null;
  }

  const coordinates = normalizeCoordinates(path.coordinates);
  const created = await createPlantPath({
    userId: input.userId,
    name: `${String(path.name || 'Untitled path').trim() || 'Untitled path'} (Clone)`
  });

  const updated = await updatePlantPath({
    userId: input.userId,
    pathId: created.id,
    name: created.name,
    visibility: PlantPathVisibility.PRIVATE,
    coordinates
  });

  if (!updated) {
    return null;
  }

  const row = await findPathRowById(updated.id);
  if (!row) {
    return updated;
  }
  row.sourcePathId = String(path.id);
  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.plantPaths,
      Item: row
    })
  );

  const userById = await loadUserByIdMap([row]);
  return toRecord(row, {
    viewerUserId: input.userId,
    savedPathIds: new Set<string>(),
    userById
  });
}
