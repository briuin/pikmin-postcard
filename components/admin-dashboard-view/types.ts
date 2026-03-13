import type { Dispatch, SetStateAction } from 'react';
import type { UserRole } from '@/lib/domain/enums';
import type { AdminText, WorkbenchText } from '@/lib/i18n';
import type { InviteCodeRecord } from '@/lib/invitations/types';
import type { PremiumFeatureKey } from '@/lib/premium-features';
import type {
  AdminFeedbackRecord,
  AdminPostcardEditDraft,
  AdminReportStatusDraft,
  AdminTabKey,
  AdminUserRecord,
  UserAccessDraft
} from '@/components/admin-dashboard-types';
import type { PostcardRecord } from '@/components/workbench/types';

export type VisibleAdminTab = {
  key: AdminTabKey;
  label: string;
};

export type AdminTabToolbarProps = {
  activeTab: AdminTabKey;
  visibleTabs: VisibleAdminTab[];
  text: AdminText;
  isLoadingUsers: boolean;
  isLoadingPostcards: boolean;
  onChangeTab: (tab: AdminTabKey) => void;
  onRefresh: () => void;
};

export type AdminSearchControlsProps = {
  text: AdminText;
  activeTab: AdminTabKey;
  userSearchText: string;
  userRoleFilter: 'ALL' | UserRole;
  searchText: string;
  onUserSearchChange: (value: string) => void;
  onUserRoleFilterChange: (value: 'ALL' | UserRole) => void;
  onSearchTextChange: (value: string) => void;
};

export type AdminUsersPanelProps = {
  text: AdminText;
  users: AdminUserRecord[];
  premiumFeatureIds: PremiumFeatureKey[];
  inviteCodes: InviteCodeRecord[];
  invitePage: number;
  invitePageSize: number;
  inviteTotalCount: number;
  inviteTotalPages: number;
  inviteGenerateCount: string;
  userAccessDrafts: Record<string, UserAccessDraft>;
  setUserAccessDrafts: Dispatch<SetStateAction<Record<string, UserAccessDraft>>>;
  setInviteGenerateCount: Dispatch<SetStateAction<string>>;
  isLoadingUsers: boolean;
  isLoadingInvitations: boolean;
  savingUserAccessId: string | null;
  isSavingPremiumFeatures: boolean;
  isGeneratingInviteCodes: boolean;
  onSaveUserAccess: (user: AdminUserRecord) => void;
  onTogglePremiumFeature: (featureId: PremiumFeatureKey, enabled: boolean) => void;
  onSavePremiumFeatures: () => void;
  onGenerateInviteCodes: () => void;
  onChangeInvitePage: (page: number) => void;
  dateLocale: 'zh-TW' | 'en-US';
};

export type AdminFeedbackPanelProps = {
  text: AdminText;
  feedbacks: AdminFeedbackRecord[];
  isLoadingFeedbacks: boolean;
  dateLocale: 'zh-TW' | 'en-US';
};

export type AdminPostcardsPanelProps = {
  text: AdminText;
  workbenchText: WorkbenchText;
  activeTab: AdminTabKey;
  postcards: PostcardRecord[];
  postcardDrafts: Record<string, AdminPostcardEditDraft>;
  setPostcardDrafts: Dispatch<SetStateAction<Record<string, AdminPostcardEditDraft>>>;
  reportStatusDrafts: Record<string, AdminReportStatusDraft>;
  setReportStatusDrafts: Dispatch<SetStateAction<Record<string, AdminReportStatusDraft>>>;
  isLoadingPostcards: boolean;
  savingPostcardId: string | null;
  savingReportCaseId: string | null;
  onSavePostcard: (postcard: PostcardRecord) => void;
  onSaveReportedStatus: (postcard: PostcardRecord) => void;
  dateLocale: 'zh-TW' | 'en-US';
};
