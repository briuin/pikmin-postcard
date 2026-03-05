import { UserApprovalStatus, UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { defaultApprovalStatusForRole } from '@/lib/user-approval';
import { normalizeEmail, roleForEmail } from '@/lib/user-role';
import type { UpsertUserByEmailInput, UserRepo, UserRepoRecord } from '@/lib/repos/users/types';

function toUserRepoRecord(input: {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  approvalStatus: UserApprovalStatus;
  canCreatePostcard: boolean;
  canSubmitDetection: boolean;
  canVote: boolean;
}): UserRepoRecord {
  return {
    id: input.id,
    email: normalizeEmail(input.email),
    displayName:
      typeof input.displayName === 'string' && input.displayName.trim().length > 0
        ? input.displayName.trim()
        : null,
    role: input.role,
    approvalStatus: input.approvalStatus,
    canCreatePostcard: input.canCreatePostcard,
    canSubmitDetection: input.canSubmitDetection,
    canVote: input.canVote
  };
}

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  approvalStatus: true,
  canCreatePostcard: true,
  canSubmitDetection: true,
  canVote: true
} as const;

async function findById(id: string): Promise<UserRepoRecord | null> {
  const row = await prisma.user.findUnique({
    where: { id },
    select: userSelect
  });
  if (!row) {
    return null;
  }
  return toUserRepoRecord(row);
}

async function findByEmail(email: string): Promise<UserRepoRecord | null> {
  const normalizedEmail = normalizeEmail(email);
  const row = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: userSelect
  });
  if (!row) {
    return null;
  }
  return toUserRepoRecord(row);
}

async function upsertByEmail(input: UpsertUserByEmailInput): Promise<UserRepoRecord> {
  const normalizedEmail = normalizeEmail(input.email);
  const displayName =
    typeof input.displayName === 'string' && input.displayName.trim().length > 0
      ? input.displayName.trim()
      : null;
  const defaultRole = roleForEmail(normalizedEmail);
  const defaultApprovalStatus = defaultApprovalStatusForRole(defaultRole);

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: userSelect
  });

  if (!existing) {
    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        displayName,
        role: input.forceAdmin ? UserRole.ADMIN : defaultRole,
        approvalStatus: input.forceAdmin ? UserApprovalStatus.APPROVED : defaultApprovalStatus
      },
      select: userSelect
    });

    return toUserRepoRecord(created);
  }

  const shouldForceAdmin = Boolean(input.forceAdmin) && existing.role !== UserRole.ADMIN;
  const shouldSetDisplayName = Boolean(displayName) && !existing.displayName;

  if (!shouldForceAdmin && !shouldSetDisplayName) {
    return toUserRepoRecord(existing);
  }

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      ...(shouldSetDisplayName ? { displayName } : {}),
      ...(shouldForceAdmin
        ? {
            role: UserRole.ADMIN,
            approvalStatus: UserApprovalStatus.APPROVED
          }
        : {})
    },
    select: userSelect
  });

  return toUserRepoRecord(updated);
}

async function updateDisplayNameById(id: string, displayName: string): Promise<UserRepoRecord | null> {
  const normalizedDisplayName = displayName.trim();
  if (!normalizedDisplayName) {
    return null;
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: { displayName: normalizedDisplayName },
      select: userSelect
    });
    return toUserRepoRecord(updated);
  } catch {
    return null;
  }
}

export const prismaUserRepo: UserRepo = {
  findById,
  findByEmail,
  upsertByEmail,
  updateDisplayNameById
};
