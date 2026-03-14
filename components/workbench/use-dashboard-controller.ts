'use client';

import { useCallback, useState } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import { useDashboardDataLoader } from '@/components/workbench/dashboard/use-dashboard-data-loader';
import { useDashboardMutations } from '@/components/workbench/dashboard/use-dashboard-mutations';
import type { PostcardRecord } from '@/components/workbench/types';

type UseDashboardControllerArgs = {
  text: WorkbenchText;
  ensureAuthenticated: () => boolean;
  currentUserId: string | null;
  currentUserEmail: string | null;
  loadPublicPostcards: () => Promise<void>;
  refreshAuthSession?: () => Promise<void>;
};

export function useDashboardController({
  text,
  ensureAuthenticated,
  currentUserId,
  currentUserEmail,
  loadPublicPostcards,
  refreshAuthSession
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
    profileHasPremiumAccess,
    profileRedeemedInviteCode,
    profileInviteCodes,
    profilePremiumFeatureIds,
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
    profileInviteCode,
    profileInviteCodeStatus,
    profileInviteCodeStatusTone,
    dashboardViewMode,
    setProfilePassword,
    setProfilePasswordConfirm,
    setProfileInviteCode,
    setDashboardViewMode,
    updatePostcardDraft,
    isJobAlreadySaved,
    saveDetectedJobAsPostcard,
    saveProfileDisplayName,
    saveProfilePassword,
    redeemProfileInviteCode,
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
    refreshAuthSession,
    loadProfileData,
    loadDashboardData,
    setDashboardStatus,
    myPostcards,
    postcardDrafts,
    setPostcardDrafts,
    profileDisplayName,
    setProfileDisplayName,
    setProfileHasPassword
  });

  const sharePostcard = useCallback(
    async (postcard: PostcardRecord) => {
      try {
        const url = `${window.location.origin}/postcard/${postcard.id}`;

        if (typeof navigator.share === 'function') {
          try {
            await navigator.share({
              title: postcard.title,
              url
            });
            setDashboardStatus(text.exploreSharePostcardDone);
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
              return;
            }
          }
        }

        await navigator.clipboard.writeText(url);
        setDashboardStatus(text.exploreSharePostcardDone);
      } catch {
        setDashboardStatus(text.exploreSharePostcardFailed);
      }
    },
    [setDashboardStatus, text.exploreSharePostcardDone, text.exploreSharePostcardFailed]
  );

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
    profileHasPremiumAccess,
    profileRedeemedInviteCode,
    profileInviteCodes,
    profilePremiumFeatureIds,
    profilePassword,
    profilePasswordConfirm,
    profilePasswordStatus,
    profilePasswordStatusTone,
    profileInviteCode,
    profileInviteCodeStatus,
    profileInviteCodeStatusTone,
    dashboardStatus,
    dashboardViewMode,
    setProfileDisplayName,
    setProfilePassword,
    setProfilePasswordConfirm,
    setProfileInviteCode,
    setDashboardViewMode,
    loadProfileData,
    loadDashboardData,
    updatePostcardDraft,
    saveDetectedJobAsPostcard,
    saveProfileDisplayName,
    saveProfilePassword,
    redeemProfileInviteCode,
    savePostcardEdits,
    isJobAlreadySaved,
    openCropEditor,
    sharePostcard,
    saveCropEdit,
    closeCropEditor,
    softDeletePostcard,
    updateCropDraft,
    cancelReport
  };
}
