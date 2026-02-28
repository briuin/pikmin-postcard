import { UserApprovalStatus, UserRole } from '@prisma/client';
import type { PostcardRecord, PostcardType } from '@/components/workbench/types';

export type AdminUserRecord = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  approvalStatus: UserApprovalStatus;
  canCreatePostcard: boolean;
  canSubmitDetection: boolean;
  canVote: boolean;
  createdAt: string;
  postcardCount: number;
};

export type UserAccessDraft = {
  role: UserRole;
  approvalStatus: UserApprovalStatus;
  canCreatePostcard: boolean;
  canSubmitDetection: boolean;
  canVote: boolean;
};

export type AdminPostcardEditDraft = {
  title: string;
  postcardType: PostcardType;
  notes: string;
  placeName: string;
  locationInput: string;
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
  return {
    title: postcard.title ?? '',
    postcardType: postcard.postcardType ?? 'UNKNOWN',
    notes: postcard.notes ?? '',
    placeName: postcard.placeName ?? '',
    locationInput:
      typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number'
        ? `${postcard.latitude.toFixed(6)}, ${postcard.longitude.toFixed(6)}`
        : ''
  };
}

export function buildUserAccessDraft(user: AdminUserRecord): UserAccessDraft {
  return {
    role: user.role,
    approvalStatus: user.approvalStatus,
    canCreatePostcard: user.canCreatePostcard,
    canSubmitDetection: user.canSubmitDetection,
    canVote: user.canVote
  };
}

export function isManagerOrAbove(role: UserRole | undefined): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}
