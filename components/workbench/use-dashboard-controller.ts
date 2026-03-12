'use client';

import { useState } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import { useDashboardDataLoader } from '@/components/workbench/dashboard/use-dashboard-data-loader';
import { useDashboardMutations } from '@/components/workbench/dashboard/use-dashboard-mutations';

type UseDashboardControllerArgs = {
  text: WorkbenchText;
  ensureAuthenticated: () => boolean;
  currentUserId: string | null;
  currentUserEmail: string | null;
  loadPublicPostcards: () => Promise<void>;
};

export function useDashboardController({
  text,
  ensureAuthenticated,
  currentUserId,
  currentUserEmail,
  loadPublicPostcards
}: UseDashboardControllerArgs) {
  const [dashboardStatus, setDashboardStatus] = useState('');

  const {
    jobs,
    myPostcards,
    savedPostcards,
    myReports,
    postcardDrafts,
    setPostcardDrafts,
    isLoadingJobs,
    isLoadingMine,
    isLoadingSaved,
    isLoadingReports,
    isLoadingProfile,
    profileEmail,
    profileDisplayName,
    profileAccountId,
    profileHasPassword,
    setProfileDisplayName,
    setProfileHasPassword,
    loadProfileData,
    loadDashboardData
  } = useDashboardDataLoader({
    text,
    currentUserId,
    currentUserEmail,
    setDashboardStatus
  });

  const {
    savingJobId,
    savingPostcardId,
    deletingPostcardId,
    editingCropPostcardId,
    editingCropOriginalUrl,
    cropDraft,
    savingCropPostcardId,
    cancelingReportId,
    isSavingProfile,
    profilePassword,
    profilePasswordConfirm,
    profilePasswordStatus,
    profilePasswordStatusTone,
    dashboardViewMode,
    setProfilePassword,
    setProfilePasswordConfirm,
    setDashboardViewMode,
    updatePostcardDraft,
    isJobAlreadySaved,
    saveDetectedJobAsPostcard,
    saveProfileDisplayName,
    saveProfilePassword,
    savePostcardEdits,
    openCropEditor,
    closeCropEditor,
    saveCropEdit,
    softDeletePostcard,
    updateCropDraft,
    cancelReport
  } = useDashboardMutations({
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
    setProfileDisplayName,
    setProfileHasPassword
  });

  return {
    jobs,
    myPostcards,
    savedPostcards,
    myReports,
    postcardDrafts,
    savingJobId,
    savingPostcardId,
    deletingPostcardId,
    editingCropPostcardId,
    editingCropOriginalUrl,
    cropDraft,
    savingCropPostcardId,
    cancelingReportId,
    isLoadingJobs,
    isLoadingMine,
    isLoadingSaved,
    isLoadingReports,
    isLoadingProfile,
    isSavingProfile,
    profileEmail,
    profileDisplayName,
    profileAccountId,
    profileHasPassword,
    profilePassword,
    profilePasswordConfirm,
    profilePasswordStatus,
    profilePasswordStatusTone,
    dashboardStatus,
    dashboardViewMode,
    setProfileDisplayName,
    setProfilePassword,
    setProfilePasswordConfirm,
    setDashboardViewMode,
    loadProfileData,
    loadDashboardData,
    updatePostcardDraft,
    saveDetectedJobAsPostcard,
    saveProfileDisplayName,
    saveProfilePassword,
    savePostcardEdits,
    isJobAlreadySaved,
    openCropEditor,
    saveCropEdit,
    closeCropEditor,
    softDeletePostcard,
    updateCropDraft,
    cancelReport
  };
}
