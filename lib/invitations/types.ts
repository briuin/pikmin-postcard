import type { PremiumFeatureKey } from '@/lib/premium-features';

export type InviteCodeRecord = {
  code: string;
  createdAt: string;
  ownerUserId: string | null;
  ownerAccountId: string | null;
  ownerName: string | null;
  usedByUserId: string | null;
  usedByAccountId: string | null;
  usedByName: string | null;
  usedAt: string | null;
  isUsed: boolean;
};

export type ProfileInvitationState = {
  hasPremiumAccess: boolean;
  redeemedInviteCode: string | null;
  premiumFeatureIds: PremiumFeatureKey[];
  inviteCodes: InviteCodeRecord[];
};

export type AdminInvitationState = {
  premiumFeatureIds: PremiumFeatureKey[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  inviteCodes: InviteCodeRecord[];
};
