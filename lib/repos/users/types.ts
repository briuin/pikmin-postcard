import { UserApprovalStatus, UserRole } from '@prisma/client';

export type UserRepoRecord = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  approvalStatus: UserApprovalStatus;
  canCreatePostcard: boolean;
  canSubmitDetection: boolean;
  canVote: boolean;
};

export type UpsertUserByEmailInput = {
  email: string;
  displayName?: string | null;
  forceAdmin?: boolean;
};

export type UserRepo = {
  findById: (id: string) => Promise<UserRepoRecord | null>;
  findByEmail: (email: string) => Promise<UserRepoRecord | null>;
  upsertByEmail: (input: UpsertUserByEmailInput) => Promise<UserRepoRecord>;
  updateDisplayNameById: (id: string, displayName: string) => Promise<UserRepoRecord | null>;
};
