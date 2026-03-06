import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { UserApprovalStatus, UserRole } from '@/lib/domain/enums';
import { ddbDoc, ddbTables, includesKeyword, normalizeSearchText, nowIso, queryAllByIndex, scanAll } from '@/lib/repos/dynamodb/shared';
import { roleForEmail } from '@/lib/user-role';

export const listUsersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.nativeEnum(UserRole).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(300)
});

export const updateUserAccessSchema = z
  .object({
    userId: z.string().min(1),
    role: z.nativeEnum(UserRole).optional(),
    approvalStatus: z.nativeEnum(UserApprovalStatus).optional(),
    canCreatePostcard: z.boolean().optional(),
    canSubmitDetection: z.boolean().optional(),
    canVote: z.boolean().optional()
  })
  .refine(
    (value) =>
      value.role !== undefined ||
      value.approvalStatus !== undefined ||
      value.canCreatePostcard !== undefined ||
      value.canSubmitDetection !== undefined ||
      value.canVote !== undefined,
    { message: 'No update fields provided.' }
  );

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserAccessPayload = z.infer<typeof updateUserAccessSchema>;

export type AdminUserListItem = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  approvalStatus: UserApprovalStatus;
  canCreatePostcard: boolean;
  canSubmitDetection: boolean;
  canVote: boolean;
  createdAt: Date;
  postcardCount: number;
};

export type UpdateAdminUserAccessResult =
  | { kind: 'not_found' }
  | { kind: 'bootstrap_role_locked' }
  | { kind: 'bootstrap_approval_locked' }
  | { kind: 'updated'; user: AdminUserListItem };

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

function normalizeRole(value: unknown, fallback: UserRole): UserRole {
  const role = String(value || '').toUpperCase();
  if (role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.MEMBER) {
    return role;
  }
  return fallback;
}

function normalizeApprovalStatus(
  value: unknown,
  role: UserRole
): UserApprovalStatus {
  const approval = String(value || '').toUpperCase();
  if (approval === UserApprovalStatus.APPROVED || approval === UserApprovalStatus.PENDING) {
    return approval;
  }
  if (role === UserRole.ADMIN) {
    return UserApprovalStatus.APPROVED;
  }
  return UserApprovalStatus.PENDING;
}

function roleSortWeight(role: UserRole): number {
  switch (role) {
    case UserRole.ADMIN:
      return 3;
    case UserRole.MANAGER:
      return 2;
    default:
      return 1;
  }
}

function toAdminUserListItem(
  row: DynamoUserRow,
  postcardCount: number
): AdminUserListItem {
  const email = String(row.email || '').trim().toLowerCase();
  const role = normalizeRole(row.role, roleForEmail(email));
  const approvalStatus = normalizeApprovalStatus(row.approvalStatus, role);

  return {
    id: String(row.id),
    email,
    displayName:
      typeof row.displayName === 'string' && row.displayName.trim().length > 0
        ? row.displayName.trim()
        : null,
    role,
    approvalStatus,
    canCreatePostcard: typeof row.canCreatePostcard === 'boolean' ? row.canCreatePostcard : true,
    canSubmitDetection:
      typeof row.canSubmitDetection === 'boolean' ? row.canSubmitDetection : true,
    canVote: typeof row.canVote === 'boolean' ? row.canVote : true,
    createdAt: new Date(String(row.createdAt || nowIso())),
    postcardCount
  };
}

export async function listAdminUsers(query: ListUsersQuery): Promise<AdminUserListItem[]> {
  const [users, postcards] = await Promise.all([
    scanAll(ddbTables.users),
    scanAll(ddbTables.postcards)
  ]);

  const postcardCountByUserId = new Map<string, number>();
  for (const postcard of postcards) {
    if (postcard.deletedAt) {
      continue;
    }
    const userId = String(postcard.userId || '').trim();
    if (!userId) {
      continue;
    }
    postcardCountByUserId.set(userId, Number(postcardCountByUserId.get(userId) || 0) + 1);
  }

  const keyword = normalizeSearchText(query.q);

  return users
    .map((item) => item as DynamoUserRow)
    .filter((user) => {
      const email = String(user.email || '').trim().toLowerCase();
      const role = normalizeRole(user.role, roleForEmail(email));
      const approvalStatus = normalizeApprovalStatus(user.approvalStatus, role);

      if (query.role && role !== query.role) {
        return false;
      }

      return includesKeyword(
        [user.email, user.displayName, role, approvalStatus],
        keyword
      );
    })
    .sort((left, right) => {
      const leftRole = normalizeRole(left.role, roleForEmail(String(left.email || '')));
      const rightRole = normalizeRole(right.role, roleForEmail(String(right.email || '')));
      const roleDiff = roleSortWeight(rightRole) - roleSortWeight(leftRole);
      if (roleDiff !== 0) {
        return roleDiff;
      }
      return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
    })
    .slice(0, query.limit)
    .map((user) =>
      toAdminUserListItem(
        user,
        Number(postcardCountByUserId.get(String(user.id || '')) || 0)
      )
    );
}

export async function updateAdminUserAccess(
  payload: UpdateUserAccessPayload
): Promise<UpdateAdminUserAccessResult> {
  const existingResponse = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.users,
      Key: { id: payload.userId }
    })
  );

  const existing = (existingResponse.Item as DynamoUserRow | undefined) ?? null;
  if (!existing) {
    return { kind: 'not_found' };
  }

  const email = String(existing.email || '').trim().toLowerCase();
  const defaultRole = roleForEmail(email);
  const currentRole = normalizeRole(existing.role, defaultRole);

  if (payload.role && defaultRole === UserRole.ADMIN && payload.role !== UserRole.ADMIN) {
    return { kind: 'bootstrap_role_locked' };
  }
  if (
    payload.approvalStatus &&
    defaultRole === UserRole.ADMIN &&
    payload.approvalStatus !== UserApprovalStatus.APPROVED
  ) {
    return { kind: 'bootstrap_approval_locked' };
  }

  const updated: DynamoUserRow = {
    ...existing,
    role: payload.role ?? currentRole,
    approvalStatus:
      payload.approvalStatus ?? normalizeApprovalStatus(existing.approvalStatus, currentRole),
    canCreatePostcard:
      payload.canCreatePostcard !== undefined
        ? payload.canCreatePostcard
        : typeof existing.canCreatePostcard === 'boolean'
          ? existing.canCreatePostcard
          : true,
    canSubmitDetection:
      payload.canSubmitDetection !== undefined
        ? payload.canSubmitDetection
        : typeof existing.canSubmitDetection === 'boolean'
          ? existing.canSubmitDetection
          : true,
    canVote:
      payload.canVote !== undefined
        ? payload.canVote
        : typeof existing.canVote === 'boolean'
          ? existing.canVote
          : true,
    updatedAt: nowIso()
  };

  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.users,
      Item: updated
    })
  );

  const postcardRows = await queryAllByIndex({
    tableName: ddbTables.postcards,
    indexName: 'userId-createdAt-index',
    keyExpression: '#u = :u',
    attrNames: { '#u': 'userId' },
    attrValues: { ':u': payload.userId },
    scanIndexForward: false,
    limit: 2000
  });
  const postcardCount = postcardRows.filter((row) => !row.deletedAt).length;

  return {
    kind: 'updated',
    user: toAdminUserListItem(updated, postcardCount)
  };
}
