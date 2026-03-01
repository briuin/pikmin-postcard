'use client';

import { useState } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import { useDashboardDataLoader } from '@/components/workbench/dashboard/use-dashboard-data-loader';
import { useDashboardMutations } from '@/components/workbench/dashboard/use-dashboard-mutations';

type UseDashboardControllerArgs = {
  text: WorkbenchText;
  ensureAuthenticated: () => boolean;
  loadPublicPostcards: () => Promise<void>;
};

export function useDashboardController({
  text,
  ensureAuthenticated,
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
    setProfileDisplayName,
    loadDashboardData
  } = useDashboardDataLoader({
    text,
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
  } = useDashboardMutations({
    text,
    ensureAuthenticated,
    loadPublicPostcards,
    loadDashboardData,
    setDashboardStatus,
    myPostcards,
    postcardDrafts,
    setPostcardDrafts,
    profileDisplayName,
    setProfileDisplayName
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
    dashboardStatus,
    dashboardViewMode,
    setProfileDisplayName,
    setDashboardViewMode,
    loadDashboardData,
    updatePostcardDraft,
    saveDetectedJobAsPostcard,
    saveProfileDisplayName,
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
