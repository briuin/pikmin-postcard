import crypto from 'node:crypto';
import { UserApprovalStatus, UserRole } from '@prisma/client';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { defaultApprovalStatusForRole } from '@/lib/user-approval';
import { normalizeEmail, roleForEmail } from '@/lib/user-role';

const region = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
const tablePrefix = process.env.DDB_TABLE_PREFIX || 'pikmin-postcard';
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

export type AuthUserRecord = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  approvalStatus: UserApprovalStatus;
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

function toAuthUserRecord(row: DynamoUserRow, fallbackRole: UserRole): AuthUserRecord {
  const role = coerceRole(row.role, fallbackRole);
  const approvalStatus = coerceApprovalStatus(
    row.approvalStatus,
    defaultApprovalStatusForRole(role)
  );

  return {
    id: String(row.id),
    email: normalizeEmail(String(row.email)),
    displayName:
      typeof row.displayName === 'string' && row.displayName.trim().length > 0
        ? row.displayName.trim()
        : null,
    role,
    approvalStatus
  };
}

async function findUserByEmail(email: string): Promise<DynamoUserRow | null> {
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

export async function ensureUserByEmail(input: {
  email: string;
  displayName?: string | null;
}): Promise<AuthUserRecord> {
  const email = normalizeEmail(input.email);
  const displayName =
    typeof input.displayName === 'string' && input.displayName.trim().length > 0
      ? input.displayName.trim()
      : null;
  const defaultRole = roleForEmail(email);

  const existing = await findUserByEmail(email);
  if (!existing) {
    const now = new Date().toISOString();
    const role = defaultRole;
    const approvalStatus = defaultApprovalStatusForRole(role);
    const created: DynamoUserRow = {
      id: `usr_${crypto.randomUUID().replace(/-/g, '')}`,
      email,
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
    return toAuthUserRecord(created, defaultRole);
  }

  const current = toAuthUserRecord(existing, defaultRole);
  const shouldForceAdmin = defaultRole === UserRole.ADMIN && current.role !== UserRole.ADMIN;
  const shouldSetDisplayName = displayName && !current.displayName;
  const normalizedEmail = normalizeEmail(String(existing.email || email));

  if (shouldForceAdmin || shouldSetDisplayName || normalizedEmail !== current.email) {
    const updatedRole = shouldForceAdmin ? UserRole.ADMIN : current.role;
    const updatedApproval = shouldForceAdmin ? UserApprovalStatus.APPROVED : current.approvalStatus;
    const updated: DynamoUserRow = {
      ...existing,
      email: normalizedEmail,
      displayName: shouldSetDisplayName ? displayName : current.displayName,
      role: updatedRole,
      approvalStatus: updatedApproval,
      canCreatePostcard:
        typeof existing.canCreatePostcard === 'boolean' ? existing.canCreatePostcard : true,
      canSubmitDetection:
        typeof existing.canSubmitDetection === 'boolean' ? existing.canSubmitDetection : true,
      canVote: typeof existing.canVote === 'boolean' ? existing.canVote : true,
      updatedAt: new Date().toISOString()
    };

    await ddb.send(
      new PutCommand({
        TableName: usersTableName,
        Item: updated
      })
    );
    return toAuthUserRecord(updated, defaultRole);
  }

  return current;
}
