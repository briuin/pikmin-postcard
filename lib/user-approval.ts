import { UserApprovalStatus, UserRole } from '@/lib/domain/enums';

export type NewUserApprovalMode = 'auto' | 'pending';

function normalizeNewUserApprovalMode(
  value: string | undefined | null
): NewUserApprovalMode {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'pending') {
    return 'pending';
  }
  return 'auto';
}

export function getNewUserApprovalMode(): NewUserApprovalMode {
  return normalizeNewUserApprovalMode(process.env.NEW_USER_APPROVAL_MODE);
}

export function defaultApprovalStatusForRole(role: UserRole): UserApprovalStatus {
  if (role === UserRole.ADMIN) {
    return UserApprovalStatus.APPROVED;
  }
  return getNewUserApprovalMode() === 'pending'
    ? UserApprovalStatus.PENDING
    : UserApprovalStatus.APPROVED;
}

export function isApprovedStatus(status: UserApprovalStatus): boolean {
  return status === UserApprovalStatus.APPROVED;
}
