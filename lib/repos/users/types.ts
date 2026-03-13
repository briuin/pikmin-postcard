import type { UserApprovalStatus, UserRole } from '@/lib/domain/enums';

export type UserRepoRecord = {
  id: string;
  email: string;
  displayName: string | null;
  accountId: string;
  role: UserRole;
  approvalStatus: UserApprovalStatus;
  canCreatePostcard: boolean;
  canSubmitDetection: boolean;
  canVote: boolean;
  canUsePlantPaths: boolean;
  hasPremiumAccess: boolean;
  redeemedInviteCode: string | null;
  hasPassword: boolean;
};

export type UserRepoAuthRecord = UserRepoRecord & {
  passwordHash: string | null;
  passwordSalt: string | null;
};

export type UpsertUserByEmailInput = {
  email: string;
  displayName?: string | null;
  forceAdmin?: boolean;
};

export type UserRepo = {
  findById: (id: string) => Promise<UserRepoRecord | null>;
  findByEmail: (email: string) => Promise<UserRepoRecord | null>;
  findAuthByAccountId: (accountId: string) => Promise<UserRepoAuthRecord | null>;
  upsertByEmail: (input: UpsertUserByEmailInput) => Promise<UserRepoRecord>;
  updateDisplayNameById: (id: string, displayName: string) => Promise<UserRepoRecord | null>;
  updatePasswordById: (id: string, passwordHash: string, passwordSalt: string) => Promise<UserRepoRecord | null>;
  grantPremiumAccessById: (input: {
    id: string;
    redeemedInviteCode: string;
    invitedByUserId?: string | null;
  }) => Promise<UserRepoRecord | null>;
};
