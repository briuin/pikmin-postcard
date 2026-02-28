import { Prisma, UserApprovalStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
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

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  approvalStatus: true,
  canCreatePostcard: true,
  canSubmitDetection: true,
  canVote: true,
  createdAt: true,
  _count: {
    select: {
      postcards: true
    }
  }
} as const;

type UserWithCounts = Prisma.UserGetPayload<{
  select: typeof userSelect;
}>;

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

function toAdminUserListItem(user: UserWithCounts): AdminUserListItem {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    approvalStatus: user.approvalStatus,
    canCreatePostcard: user.canCreatePostcard,
    canSubmitDetection: user.canSubmitDetection,
    canVote: user.canVote,
    createdAt: user.createdAt,
    postcardCount: user._count.postcards
  };
}

function buildListUsersWhere(query: ListUsersQuery): Prisma.UserWhereInput | undefined {
  const whereAnd: Prisma.UserWhereInput[] = [];

  if (query.role) {
    whereAnd.push({ role: query.role });
  }
  if (query.q && query.q.length > 0) {
    whereAnd.push({
      OR: [
        { email: { contains: query.q, mode: 'insensitive' as const } },
        { displayName: { contains: query.q, mode: 'insensitive' as const } }
      ]
    });
  }

  return whereAnd.length > 0 ? { AND: whereAnd } : undefined;
}

function buildUserAccessUpdateData(payload: UpdateUserAccessPayload): Prisma.UserUpdateInput {
  return {
    ...(payload.role ? { role: payload.role } : {}),
    ...(payload.approvalStatus ? { approvalStatus: payload.approvalStatus } : {}),
    ...(payload.canCreatePostcard !== undefined
      ? { canCreatePostcard: payload.canCreatePostcard }
      : {}),
    ...(payload.canSubmitDetection !== undefined
      ? { canSubmitDetection: payload.canSubmitDetection }
      : {}),
    ...(payload.canVote !== undefined ? { canVote: payload.canVote } : {})
  };
}

export async function listAdminUsers(query: ListUsersQuery): Promise<AdminUserListItem[]> {
  const users = await prisma.user.findMany({
    where: buildListUsersWhere(query),
    orderBy: [{ role: 'desc' }, { createdAt: 'desc' }],
    select: userSelect,
    take: query.limit
  });

  return users.map(toAdminUserListItem);
}

export async function updateAdminUserAccess(
  payload: UpdateUserAccessPayload
): Promise<UpdateAdminUserAccessResult> {
  const target = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, role: true }
  });

  if (!target) {
    return { kind: 'not_found' };
  }

  const targetDefaultRole = roleForEmail(target.email);
  if (payload.role && targetDefaultRole === UserRole.ADMIN && payload.role !== UserRole.ADMIN) {
    return { kind: 'bootstrap_role_locked' };
  }
  if (
    payload.approvalStatus &&
    targetDefaultRole === UserRole.ADMIN &&
    payload.approvalStatus !== UserApprovalStatus.APPROVED
  ) {
    return { kind: 'bootstrap_approval_locked' };
  }

  const updated = await prisma.user.update({
    where: { id: payload.userId },
    data: buildUserAccessUpdateData(payload),
    select: userSelect
  });

  return {
    kind: 'updated',
    user: toAdminUserListItem(updated)
  };
}
