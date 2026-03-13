import crypto from 'node:crypto';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { resolveAccountId } from '@/lib/account-id';
import { listPremiumFeatureIds } from '@/lib/premium-feature-settings';
import { type PremiumFeatureKey } from '@/lib/premium-features';
import {
  batchGetByIds,
  ddbDoc,
  ddbTables,
  isDynamoResourceNotFoundError,
  nowIso,
  scanAll
} from '@/lib/repos/dynamodb/shared';
import { userRepo } from '@/lib/repos/users';
import type { AdminInvitationState, InviteCodeRecord, ProfileInvitationState } from '@/lib/invitations/types';

export const INVITE_CODE_LENGTH = 9;
export const DEFAULT_AVAILABLE_ROOT_INVITE_CODES = 100;
export const DEFAULT_ADMIN_INVITE_PAGE_SIZE = 10;

type DynamoInviteCodeRow = {
  id: string;
  ownerUserId?: string | null;
  issuedByUserId?: string | null;
  usedByUserId?: string | null;
  usedAt?: string | null;
  createdAt?: string;
  updatedAt?: string | null;
};

type DynamoUserSummaryRow = {
  id: string;
  email?: string | null;
  displayName?: string | null;
  accountId?: string | null;
};

const INVITE_CODE_PATTERN = /^[A-Z]{9}$/;
const INVITE_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function normalizeInviteCode(input: string): string {
  return input.trim().toUpperCase();
}

function toUserSummary(row: DynamoUserSummaryRow | null | undefined) {
  if (!row) {
    return null;
  }

  const email = String(row.email || '').trim().toLowerCase();
  return {
    userId: String(row.id || ''),
    accountId: resolveAccountId(
      typeof row.accountId === 'string' ? row.accountId : null,
      email
    ),
    name:
      typeof row.displayName === 'string' && row.displayName.trim().length > 0
        ? row.displayName.trim()
        : null
  };
}

function createInviteCodeCandidate(): string {
  const bytes = crypto.randomBytes(INVITE_CODE_LENGTH);
  return Array.from(bytes, (byte) => INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length]).join('');
}

async function loadAllInviteRows(): Promise<DynamoInviteCodeRow[]> {
  try {
    return (await scanAll(ddbTables.inviteCodes)) as DynamoInviteCodeRow[];
  } catch (error) {
    if (isDynamoResourceNotFoundError(error)) {
      console.warn(`Invite codes table ${ddbTables.inviteCodes} is missing. Returning empty invite list.`);
      return [];
    }
    throw error;
  }
}

async function findInviteRowByCode(code: string): Promise<DynamoInviteCodeRow | null> {
  try {
    const result = await ddbDoc.send(
      new GetCommand({
        TableName: ddbTables.inviteCodes,
        Key: { id: code }
      })
    );
    return (result.Item as DynamoInviteCodeRow | undefined) ?? null;
  } catch (error) {
    if (isDynamoResourceNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

async function serializeInviteCodeRows(rows: DynamoInviteCodeRow[]): Promise<InviteCodeRecord[]> {
  const userIds = Array.from(
    new Set(
      rows.flatMap((row) => [
        String(row.ownerUserId || '').trim(),
        String(row.usedByUserId || '').trim()
      ])
    )
  ).filter((userId) => userId.length > 0);

  const users = (await batchGetByIds(ddbTables.users, userIds)) as DynamoUserSummaryRow[];
  const userById = new Map(
    users
      .map((row) => {
        const summary = toUserSummary(row);
        return summary ? [summary.userId, summary] : null;
      })
      .filter((entry): entry is [string, NonNullable<ReturnType<typeof toUserSummary>>] => Boolean(entry))
  );

  return [...rows]
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
    .map((row) => {
      const owner = userById.get(String(row.ownerUserId || '').trim()) ?? null;
      const usedBy = userById.get(String(row.usedByUserId || '').trim()) ?? null;

      return {
        code: String(row.id || ''),
        createdAt: String(row.createdAt || ''),
        ownerUserId: owner?.userId ?? null,
        ownerAccountId: owner?.accountId ?? null,
        ownerName: owner?.name ?? null,
        usedByUserId: usedBy?.userId ?? null,
        usedByAccountId: usedBy?.accountId ?? null,
        usedByName: usedBy?.name ?? null,
        usedAt: typeof row.usedAt === 'string' ? row.usedAt : null,
        isUsed: Boolean(row.usedByUserId)
      };
    });
}

async function putInviteRow(row: DynamoInviteCodeRow): Promise<void> {
  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.inviteCodes,
      Item: row
    })
  );
}

async function generateUniqueInviteCodes(params: {
  count: number;
  ownerUserId: string | null;
  issuedByUserId: string | null;
}): Promise<InviteCodeRecord[]> {
  const existingRows = await loadAllInviteRows();
  const existingCodes = new Set(existingRows.map((row) => String(row.id || '')));
  const createdRows: DynamoInviteCodeRow[] = [];

  while (createdRows.length < params.count) {
    const code = createInviteCodeCandidate();
    if (existingCodes.has(code)) {
      continue;
    }

    existingCodes.add(code);
    const createdAt = nowIso();
    const row: DynamoInviteCodeRow = {
      id: code,
      ownerUserId: params.ownerUserId,
      issuedByUserId: params.issuedByUserId,
      createdAt,
      updatedAt: createdAt
    };
    await putInviteRow(row);
    createdRows.push(row);
  }

  return serializeInviteCodeRows(createdRows);
}

function countAvailableRootInviteCodes(rows: DynamoInviteCodeRow[]): number {
  return rows.filter((row) => {
    const ownerUserId = String(row.ownerUserId || '').trim();
    const usedByUserId = String(row.usedByUserId || '').trim();
    return ownerUserId.length === 0 && usedByUserId.length === 0;
  }).length;
}

export async function ensureDefaultInviteCodePool(
  minimumAvailableCodes = DEFAULT_AVAILABLE_ROOT_INVITE_CODES
): Promise<void> {
  const inviteRows = await loadAllInviteRows();
  const availableRootCodes = countAvailableRootInviteCodes(inviteRows);
  const missingCodes = Math.max(0, minimumAvailableCodes - availableRootCodes);
  if (missingCodes === 0) {
    return;
  }

  await generateUniqueInviteCodes({
    count: missingCodes,
    ownerUserId: null,
    issuedByUserId: null
  });
}

export async function getProfileInvitationState(userId: string): Promise<ProfileInvitationState> {
  const [user, premiumFeatureIds, inviteRows] = await Promise.all([
    userRepo.findById(userId),
    listPremiumFeatureIds(),
    loadAllInviteRows()
  ]);

  const ownedInviteRows = inviteRows.filter((row) => String(row.ownerUserId || '').trim() === userId);

  return {
    hasPremiumAccess: user?.hasPremiumAccess ?? false,
    redeemedInviteCode: user?.redeemedInviteCode ?? null,
    premiumFeatureIds,
    inviteCodes: await serializeInviteCodeRows(ownedInviteRows)
  };
}

export async function getAdminInvitationState(params: {
  page?: number;
  pageSize?: number;
} = {}): Promise<AdminInvitationState> {
  await ensureDefaultInviteCodePool();
  const [premiumFeatureIds, inviteRows] = await Promise.all([
    listPremiumFeatureIds(),
    loadAllInviteRows()
  ]);
  const serializedInviteCodes = await serializeInviteCodeRows(inviteRows);
  const pageSize = Math.max(1, Math.min(50, Math.trunc(params.pageSize ?? DEFAULT_ADMIN_INVITE_PAGE_SIZE)));
  const totalCount = serializedInviteCodes.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(params.page ?? 1)), totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    premiumFeatureIds,
    page,
    pageSize,
    totalCount,
    totalPages,
    inviteCodes: serializedInviteCodes.slice(startIndex, startIndex + pageSize)
  };
}

export async function generateAdminInviteCodes(params: {
  count: number;
  actorId: string;
}): Promise<InviteCodeRecord[]> {
  const normalizedCount = Math.max(1, Math.min(200, Math.trunc(params.count)));
  return generateUniqueInviteCodes({
    count: normalizedCount,
    ownerUserId: null,
    issuedByUserId: params.actorId
  });
}

export async function redeemInviteCode(params: {
  userId: string;
  code: string;
}): Promise<ProfileInvitationState> {
  await ensureDefaultInviteCodePool();
  const normalizedCode = normalizeInviteCode(params.code);
  if (!INVITE_CODE_PATTERN.test(normalizedCode)) {
    throw new Error('Invite code must be 9 capital letters.');
  }

  const user = await userRepo.findById(params.userId);
  if (!user) {
    throw new Error('User not found.');
  }

  if (user.redeemedInviteCode || user.hasPremiumAccess) {
    throw new Error('This account already used an invite code.');
  }

  const inviteRow = await findInviteRowByCode(normalizedCode);
  if (!inviteRow) {
    throw new Error('Invite code not found.');
  }
  if (inviteRow.usedByUserId) {
    throw new Error('This invite code has already been used.');
  }
  if (String(inviteRow.ownerUserId || '').trim() === params.userId) {
    throw new Error('You cannot redeem your own invite code.');
  }

  const updatedAt = nowIso();
  await putInviteRow({
    ...inviteRow,
    usedByUserId: params.userId,
    usedAt: updatedAt,
    updatedAt
  });

  const updatedUser = await userRepo.grantPremiumAccessById({
    id: params.userId,
    redeemedInviteCode: normalizedCode,
    invitedByUserId: typeof inviteRow.ownerUserId === 'string' ? inviteRow.ownerUserId : null
  });
  if (!updatedUser) {
    throw new Error('User not found.');
  }

  await generateUniqueInviteCodes({
    count: 2,
    ownerUserId: params.userId,
    issuedByUserId: params.userId
  });

  if (!inviteRow.ownerUserId) {
    await ensureDefaultInviteCodePool();
  }

  return getProfileInvitationState(params.userId);
}

export function isInviteCodeFormatValid(code: string): boolean {
  return INVITE_CODE_PATTERN.test(normalizeInviteCode(code));
}

export type { PremiumFeatureKey };
