import crypto from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { UserApprovalStatus, UserRole } from '@prisma/client';
import { defaultApprovalStatusForRole } from '@/lib/user-approval';
import { normalizeEmail, roleForEmail } from '@/lib/user-role';
import type { UpsertUserByEmailInput, UserRepo, UserRepoRecord } from '@/lib/repos/users/types';

const region = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
const tablePrefix =
  String(process.env.DDB_TABLE_PREFIX || 'pikmin-postcard-dev').trim() || 'pikmin-postcard-dev';
const usersTableName = `${tablePrefix}-users`;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true }
});

type DynamoUserRow = {
  id: string;
  email: string;
  displayName?: string | null;
  role?: string | null;
  approvalStatus?: string | null;
  canCreatePostcard?: boolean;
  canSubmitDetection?: boolean;
  canVote?: boolean;
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

function toUserRepoRecord(row: DynamoUserRow, fallbackRole: UserRole): UserRepoRecord {
  const role = coerceRole(row.role, fallbackRole);
  return {
    id: String(row.id),
    email: normalizeEmail(String(row.email)),
    displayName:
      typeof row.displayName === 'string' && row.displayName.trim().length > 0
        ? row.displayName.trim()
        : null,
    role,
    approvalStatus: coerceApprovalStatus(row.approvalStatus, defaultApprovalStatusForRole(role)),
    canCreatePostcard: typeof row.canCreatePostcard === 'boolean' ? row.canCreatePostcard : true,
    canSubmitDetection: typeof row.canSubmitDetection === 'boolean' ? row.canSubmitDetection : true,
    canVote: typeof row.canVote === 'boolean' ? row.canVote : true
  };
}

async function findRowById(id: string): Promise<DynamoUserRow | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: usersTableName,
      Key: { id }
    })
  );
  return (result.Item as DynamoUserRow | undefined) ?? null;
}

async function findRowByEmail(email: string): Promise<DynamoUserRow | null> {
  const normalizedEmail = normalizeEmail(email);
  const result = await ddb.send(
    new QueryCommand({
      TableName: usersTableName,
      IndexName: 'email-index',
      KeyConditionExpression: '#email = :email',
      ExpressionAttributeNames: { '#email': 'email' },
      ExpressionAttributeValues: { ':email': normalizedEmail },
      Limit: 1
    })
  );
  return (result.Items?.[0] as DynamoUserRow | undefined) ?? null;
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

async function upsertByEmail(input: UpsertUserByEmailInput): Promise<UserRepoRecord> {
  const normalizedEmail = normalizeEmail(input.email);
  const displayName =
    typeof input.displayName === 'string' && input.displayName.trim().length > 0
      ? input.displayName.trim()
      : null;
  const defaultRole = roleForEmail(normalizedEmail);

  const existing = await findRowByEmail(normalizedEmail);
  if (!existing) {
    const now = new Date().toISOString();
    const role = input.forceAdmin ? UserRole.ADMIN : defaultRole;
    const approvalStatus = input.forceAdmin
      ? UserApprovalStatus.APPROVED
      : defaultApprovalStatusForRole(role);
    const created: DynamoUserRow = {
      id: `usr_${crypto.randomUUID().replace(/-/g, '')}`,
      email: normalizedEmail,
      displayName,
      role,
      approvalStatus,
      canCreatePostcard: true,
      canSubmitDetection: true,
      canVote: true,
      createdAt: now,
      updatedAt: now
    };
    await ddb.send(
      new PutCommand({
        TableName: usersTableName,
        Item: created
      })
    );
    return toUserRepoRecord(created, defaultRole);
  }

  const current = toUserRepoRecord(existing, defaultRole);
  const shouldForceAdmin = Boolean(input.forceAdmin) && current.role !== UserRole.ADMIN;
  const shouldSetDisplayName = Boolean(displayName) && !current.displayName;

  if (!shouldForceAdmin && !shouldSetDisplayName) {
    return current;
  }

  const updated: DynamoUserRow = {
    ...existing,
    displayName: shouldSetDisplayName ? displayName : current.displayName,
    role: shouldForceAdmin ? UserRole.ADMIN : current.role,
    approvalStatus: shouldForceAdmin ? UserApprovalStatus.APPROVED : current.approvalStatus,
    canCreatePostcard: current.canCreatePostcard,
    canSubmitDetection: current.canSubmitDetection,
    canVote: current.canVote,
    updatedAt: new Date().toISOString()
  };

  await ddb.send(
    new PutCommand({
      TableName: usersTableName,
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

  const updated: DynamoUserRow = {
    ...existing,
    displayName: normalizedDisplayName,
    updatedAt: new Date().toISOString()
  };

  await ddb.send(
    new PutCommand({
      TableName: usersTableName,
      Item: updated
    })
  );

  return toUserRepoRecord(updated, roleForEmail(String(updated.email)));
}

export const dynamoUserRepo: UserRepo = {
  findById,
  findByEmail,
  upsertByEmail,
  updateDisplayNameById
};
