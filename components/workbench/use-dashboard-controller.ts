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
    postcardDrafts,
    setPostcardDrafts,
    isLoadingJobs,
    isLoadingMine,
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
    updateCropDraft
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
    postcardDrafts,
    savingJobId,
    savingPostcardId,
    deletingPostcardId,
    editingCropPostcardId,
    editingCropOriginalUrl,
    cropDraft,
    savingCropPostcardId,
    isLoadingJobs,
    isLoadingMine,
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
    updateCropDraft
  };
}
