import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { deriveAccountIdFromEmail, normalizeAccountId, resolveAccountId } from '@/lib/account-id';
import { defaultApprovalStatusForRole } from '@/lib/user-approval';
import { UserApprovalStatus, UserRole } from '@/lib/domain/enums';
import { ddbDoc, ddbTables, newId, nowIso, scanAll } from '@/lib/repos/dynamodb/shared';
import { normalizeEmail, roleForEmail } from '@/lib/user-role';
import type {
  UpsertUserByEmailInput,
  UserRepo,
  UserRepoAuthRecord,
  UserRepoRecord
} from '@/lib/repos/users/types';

type DynamoUserRow = {
  id: string;
  email: string;
  displayName?: string | null;
  accountId?: string | null;
  role?: string | null;
  approvalStatus?: string | null;
  canCreatePostcard?: boolean;
  canSubmitDetection?: boolean;
  canVote?: boolean;
  passwordHash?: string | null;
  passwordSalt?: string | null;
  passwordUpdatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function coerceRole(value: string | null | undefined, fallback: UserRole): UserRole {
  if (value === UserRole.ADMIN || value === UserRole.MANAGER || value === UserRole.MEMBER) {
    return value;
  }
  return fallback;
}

function coerceApprovalStatus(
  value: string | null | undefined,
  fallback: UserApprovalStatus
): UserApprovalStatus {
  if (value === UserApprovalStatus.APPROVED || value === UserApprovalStatus.PENDING) {
    return value;
  }
  return fallback;
}

function rowHasPassword(row: Pick<DynamoUserRow, 'passwordHash' | 'passwordSalt'>): boolean {
  return Boolean(
    typeof row.passwordHash === 'string' &&
      row.passwordHash.trim().length > 0 &&
      typeof row.passwordSalt === 'string' &&
      row.passwordSalt.trim().length > 0
  );
}

function toUserRepoRecord(row: DynamoUserRow, fallbackRole: UserRole): UserRepoRecord {
  const role = coerceRole(row.role, fallbackRole);
  return {
    id: String(row.id),
    email: normalizeEmail(String(row.email)),
    displayName:
      typeof row.displayName === 'string' && row.displayName.trim().length > 0
        ? row.displayName.trim()
        : null,
    accountId: resolveAccountId(
      typeof row.accountId === 'string' ? row.accountId : null,
      String(row.email)
    ),
    role,
    approvalStatus: coerceApprovalStatus(row.approvalStatus, defaultApprovalStatusForRole(role)),
    canCreatePostcard: typeof row.canCreatePostcard === 'boolean' ? row.canCreatePostcard : true,
    canSubmitDetection: typeof row.canSubmitDetection === 'boolean' ? row.canSubmitDetection : true,
    canVote: typeof row.canVote === 'boolean' ? row.canVote : true,
    hasPassword: rowHasPassword(row)
  };
}

function toUserRepoAuthRecord(row: DynamoUserRow, fallbackRole: UserRole): UserRepoAuthRecord {
  return {
    ...toUserRepoRecord(row, fallbackRole),
    passwordHash: typeof row.passwordHash === 'string' ? row.passwordHash : null,
    passwordSalt: typeof row.passwordSalt === 'string' ? row.passwordSalt : null
  };
}

async function listAllUserRows(): Promise<DynamoUserRow[]> {
  return (await scanAll(ddbTables.users)) as DynamoUserRow[];
}

async function findRowById(id: string): Promise<DynamoUserRow | null> {
  const result = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.users,
      Key: { id }
    })
  );
  return (result.Item as DynamoUserRow | undefined) ?? null;
}

async function findRowByEmail(email: string): Promise<DynamoUserRow | null> {
  const normalizedEmail = normalizeEmail(email);
  const result = await ddbDoc.send(
    new QueryCommand({
      TableName: ddbTables.users,
      IndexName: 'email-index',
      KeyConditionExpression: '#email = :email',
      ExpressionAttributeNames: { '#email': 'email' },
      ExpressionAttributeValues: { ':email': normalizedEmail },
      Limit: 1
    })
  );
  return (result.Items?.[0] as DynamoUserRow | undefined) ?? null;
}

async function findRowByAccountId(accountId: string): Promise<DynamoUserRow | null> {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId) {
    return null;
  }

  const rows = await listAllUserRows();
  return (
    rows.find((row) => {
      const rowAccountId = resolveAccountId(
        typeof row.accountId === 'string' ? row.accountId : null,
        String(row.email || '')
      );
      return rowAccountId === normalizedAccountId;
    }) ?? null
  );
}

async function nextUniqueAccountId(baseAccountId: string, excludeUserId?: string): Promise<string> {
  const normalizedBase = normalizeAccountId(baseAccountId) || 'user';
  const rows = await listAllUserRows();
  const used = new Set(
    rows
      .filter((row) => String(row.id || '') !== String(excludeUserId || ''))
      .map((row) =>
        resolveAccountId(
          typeof row.accountId === 'string' ? row.accountId : null,
          String(row.email || '')
        )
      )
      .filter(Boolean)
  );

  if (!used.has(normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 2;
  while (used.has(`${normalizedBase}-${suffix}`)) {
    suffix += 1;
  }
  return `${normalizedBase}-${suffix}`;
}

async function ensureStoredAccountId(row: DynamoUserRow): Promise<DynamoUserRow> {
  const existingAccountId = normalizeAccountId(row.accountId);
  if (existingAccountId) {
    return row;
  }

  const accountId = await nextUniqueAccountId(deriveAccountIdFromEmail(row.email), row.id);
  const updated: DynamoUserRow = {
    ...row,
    accountId,
    updatedAt: nowIso()
  };

  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.users,
      Item: updated
    })
  );

  return updated;
}

async function findById(id: string): Promise<UserRepoRecord | null> {
  const row = await findRowById(id);
  if (!row) {
    return null;
  }
  return toUserRepoRecord(row, roleForEmail(String(row.email)));
}

async function findByEmail(email: string): Promise<UserRepoRecord | null> {
  const row = await findRowByEmail(email);
  if (!row) {
    return null;
  }
  return toUserRepoRecord(row, roleForEmail(String(row.email)));
}

async function findAuthByAccountId(accountId: string): Promise<UserRepoAuthRecord | null> {
  const row = await findRowByAccountId(accountId);
  if (!row) {
    return null;
  }
  return toUserRepoAuthRecord(row, roleForEmail(String(row.email)));
}

async function upsertByEmail(input: UpsertUserByEmailInput): Promise<UserRepoRecord> {
  const normalizedEmail = normalizeEmail(input.email);
  const displayName =
    typeof input.displayName === 'string' && input.displayName.trim().length > 0
      ? input.displayName.trim()
      : null;
  const defaultRole = roleForEmail(normalizedEmail);

  const existing = await findRowByEmail(normalizedEmail);
  if (!existing) {
    const now = nowIso();
    const role = input.forceAdmin ? UserRole.ADMIN : defaultRole;
    const approvalStatus = input.forceAdmin
      ? UserApprovalStatus.APPROVED
      : defaultApprovalStatusForRole(role);
    const accountId = await nextUniqueAccountId(deriveAccountIdFromEmail(normalizedEmail));
    const created: DynamoUserRow = {
      id: newId('usr'),
      email: normalizedEmail,
      displayName,
      accountId,
      role,
      approvalStatus,
      canCreatePostcard: true,
      canSubmitDetection: true,
      canVote: true,
      createdAt: now,
      updatedAt: now
    };
    await ddbDoc.send(
      new PutCommand({
        TableName: ddbTables.users,
        Item: created
      })
    );
    return toUserRepoRecord(created, defaultRole);
  }

  const current = toUserRepoRecord(existing, defaultRole);
  const shouldForceAdmin = Boolean(input.forceAdmin) && current.role !== UserRole.ADMIN;
  const shouldSetDisplayName = Boolean(displayName) && !current.displayName;
  const hasStoredAccountId = normalizeAccountId(existing.accountId).length > 0;
  const accountId = normalizeAccountId(existing.accountId)
    ? current.accountId
    : await nextUniqueAccountId(deriveAccountIdFromEmail(normalizedEmail), existing.id);

  if (!shouldForceAdmin && !shouldSetDisplayName && hasStoredAccountId && accountId === current.accountId) {
    return current;
  }

  const updated: DynamoUserRow = {
    ...existing,
    displayName: shouldSetDisplayName ? displayName : current.displayName,
    accountId,
    role: shouldForceAdmin ? UserRole.ADMIN : current.role,
    approvalStatus: shouldForceAdmin ? UserApprovalStatus.APPROVED : current.approvalStatus,
    canCreatePostcard: current.canCreatePostcard,
    canSubmitDetection: current.canSubmitDetection,
    canVote: current.canVote,
    updatedAt: nowIso()
  };

  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.users,
      Item: updated
    })
  );

  return toUserRepoRecord(updated, defaultRole);
}

async function updateDisplayNameById(id: string, displayName: string): Promise<UserRepoRecord | null> {
  const normalizedDisplayName = displayName.trim();
  if (!normalizedDisplayName) {
    return null;
  }

  const existing = await findRowById(id);
  if (!existing) {
    return null;
  }

  const resolved = await ensureStoredAccountId(existing);
  const updated: DynamoUserRow = {
    ...resolved,
    displayName: normalizedDisplayName,
    updatedAt: nowIso()
  };

  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.users,
      Item: updated
    })
  );

  return toUserRepoRecord(updated, roleForEmail(String(updated.email)));
}

async function updatePasswordById(
  id: string,
  passwordHash: string,
  passwordSalt: string
): Promise<UserRepoRecord | null> {
  const existing = await findRowById(id);
  if (!existing) {
    return null;
  }

  const resolved = await ensureStoredAccountId(existing);
  const updated: DynamoUserRow = {
    ...resolved,
    passwordHash,
    passwordSalt,
    passwordUpdatedAt: nowIso(),
    updatedAt: nowIso()
  };

  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.users,
      Item: updated
    })
  );

  return toUserRepoRecord(updated, roleForEmail(String(updated.email)));
}

export const dynamoUserRepo: UserRepo = {
  findById,
  findByEmail,
  findAuthByAccountId,
  upsertByEmail,
  updateDisplayNameById,
  updatePasswordById
};
