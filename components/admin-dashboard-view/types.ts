import type { Dispatch, SetStateAction } from 'react';
import { type UserRole } from '@prisma/client';
import type { AdminText, WorkbenchText } from '@/lib/i18n';
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
  userAccessDrafts: Record<string, UserAccessDraft>;
  setUserAccessDrafts: Dispatch<SetStateAction<Record<string, UserAccessDraft>>>;
  isLoadingUsers: boolean;
  savingUserAccessId: string | null;
  onSaveUserAccess: (user: AdminUserRecord) => void;
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
