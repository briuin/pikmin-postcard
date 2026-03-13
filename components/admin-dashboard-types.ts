import { UserApprovalStatus, UserRole } from '@/lib/domain/enums';
import { buildPostcardDraftValues } from '@/components/workbench/postcard-draft';
import type {
  PostcardRecord,
  PostcardReportStatus,
  PostcardType
} from '@/components/workbench/types';

export type AdminUserRecord = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  approvalStatus: UserApprovalStatus;
  canCreatePostcard: boolean;
  canSubmitDetection: boolean;
  canVote: boolean;
  canUsePlantPaths: boolean;
  createdAt: string;
  postcardCount: number;
};

export type UserAccessDraft = {
  role: UserRole;
  approvalStatus: UserApprovalStatus;
  canCreatePostcard: boolean;
  canSubmitDetection: boolean;
  canVote: boolean;
  canUsePlantPaths: boolean;
};

export type AdminPostcardEditDraft = {
  title: string;
  postcardType: PostcardType;
  notes: string;
  placeName: string;
  locationInput: string;
};

export type AdminReportStatusDraft = {
  status: PostcardReportStatus;
  adminNote: string;
};

export type AdminFeedbackRecord = {
  id: string;
  subject: string;
  message: string;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  userEmail: string;
  userDisplayName: string | null;
};

export type AdminTabKey = 'users' | 'postcards' | 'reported' | 'feedback';

export function buildAdminPostcardDraft(postcard: PostcardRecord): AdminPostcardEditDraft {
  return buildPostcardDraftValues(postcard);
}

export function buildUserAccessDraft(user: AdminUserRecord): UserAccessDraft {
  return {
    role: user.role,
    approvalStatus: user.approvalStatus,
    canCreatePostcard: user.canCreatePostcard,
    canSubmitDetection: user.canSubmitDetection,
    canVote: user.canVote,
    canUsePlantPaths: user.canUsePlantPaths
  };
}

export function buildAdminReportStatusDraft(postcard: PostcardRecord): AdminReportStatusDraft {
  return {
    status: postcard.activeReportCaseStatus ?? 'PENDING',
    adminNote: postcard.activeReportAdminNote ?? ''
  };
}

export function isManagerOrAbove(role: UserRole | undefined): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}
