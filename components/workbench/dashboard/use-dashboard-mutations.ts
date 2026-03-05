import { useState, type Dispatch, type SetStateAction } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import type { DashboardViewMode, PostcardEditDraft, PostcardRecord } from '@/components/workbench/types';
import { useDashboardJobActions } from '@/components/workbench/dashboard/use-dashboard-job-actions';
import { useDashboardPostcardActions } from '@/components/workbench/dashboard/use-dashboard-postcard-actions';
import { useDashboardProfileActions } from '@/components/workbench/dashboard/use-dashboard-profile-actions';
import { useDashboardReportActions } from '@/components/workbench/dashboard/use-dashboard-report-actions';

type UseDashboardMutationsArgs = {
  text: WorkbenchText;
  ensureAuthenticated: () => boolean;
  currentUserId: string | null;
  currentUserEmail: string | null;
  loadPublicPostcards: () => Promise<void>;
  loadDashboardData: () => Promise<void>;
  setDashboardStatus: (value: string) => void;
  myPostcards: PostcardRecord[];
  postcardDrafts: Record<string, PostcardEditDraft>;
  setPostcardDrafts: Dispatch<SetStateAction<Record<string, PostcardEditDraft>>>;
  profileDisplayName: string;
  setProfileDisplayName: Dispatch<SetStateAction<string>>;
};

export function useDashboardMutations({
  text,
  ensureAuthenticated,
  currentUserId,
  currentUserEmail,
  loadPublicPostcards,
  loadDashboardData,
  setDashboardStatus,
  myPostcards,
  postcardDrafts,
  setPostcardDrafts,
  profileDisplayName,
  setProfileDisplayName
}: UseDashboardMutationsArgs) {
  const [dashboardViewMode, setDashboardViewMode] = useState<DashboardViewMode>('grid');

  const { savingJobId, isJobAlreadySaved, saveDetectedJobAsPostcard } = useDashboardJobActions({
    text,
    ensureAuthenticated,
    currentUserId,
    currentUserEmail,
    loadPublicPostcards,
    loadDashboardData,
    setDashboardStatus,
    myPostcards
  });

  const {
    savingPostcardId,
    deletingPostcardId,
    editingCropPostcardId,
    editingCropOriginalUrl,
    cropDraft,
    savingCropPostcardId,
    updatePostcardDraft,
    savePostcardEdits,
    openCropEditor,
    closeCropEditor,
    saveCropEdit,
    softDeletePostcard,
    updateCropDraft
  } = useDashboardPostcardActions({
    text,
    ensureAuthenticated,
    currentUserId,
    currentUserEmail,
    loadPublicPostcards,
    loadDashboardData,
    setDashboardStatus,
    postcardDrafts,
    setPostcardDrafts
  });

  const { isSavingProfile, saveProfileDisplayName } = useDashboardProfileActions({
    text,
    ensureAuthenticated,
    currentUserId,
    currentUserEmail,
    loadPublicPostcards,
    setDashboardStatus,
    profileDisplayName,
    setProfileDisplayName
  });

  const { cancelingReportId, cancelReport } = useDashboardReportActions({
    text,
    ensureAuthenticated,
    currentUserId,
    currentUserEmail,
    loadDashboardData,
    loadPublicPostcards,
    setDashboardStatus
  });

  return {
    savingJobId,
    savingPostcardId,
    deletingPostcardId,
    editingCropPostcardId,
    editingCropOriginalUrl,
    cropDraft,
    savingCropPostcardId,
    cancelingReportId,
    isSavingProfile,
    dashboardViewMode,
    setDashboardViewMode,
    updatePostcardDraft,
    isJobAlreadySaved,
    saveDetectedJobAsPostcard,
    saveProfileDisplayName,
    savePostcardEdits,
    openCropEditor,
    closeCropEditor,
    saveCropEdit,
    softDeletePostcard,
    updateCropDraft,
    cancelReport
  };
}
