'use client';

import dynamic from 'next/dynamic';
import { signIn, useSession } from 'next-auth/react';
import 'react-image-crop/dist/ReactCrop.css';
import { useCallback, useEffect } from 'react';
import { messages, type Locale } from '@/lib/i18n';
import { ExploreSection } from '@/components/workbench/explore-section';
import { CreateSection } from '@/components/workbench/create-section';
import { DashboardSection } from '@/components/workbench/dashboard-section';
import { useCreateController } from '@/components/workbench/use-create-controller';
import { useDashboardController } from '@/components/workbench/use-dashboard-controller';
import { useExploreController } from '@/components/workbench/use-explore-controller';

type PostcardWorkbenchProps = {
  mode?: 'explore' | 'create' | 'dashboard' | 'full';
  locale?: Locale;
};

const OpenMap = dynamic(
  async () => {
    const mod = await import('@/components/open-map');
    return mod.OpenMap;
  },
  { ssr: false }
);

export function PostcardWorkbench({ mode = 'full', locale = 'en' }: PostcardWorkbenchProps) {
  const { data: session, status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === 'authenticated';
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const currentUserEmail = session?.user?.email ?? null;
  const text = messages[locale].workbench;

  const showExplore = mode === 'explore' || mode === 'full';
  const showCreate = mode === 'create' || mode === 'full';
  const showDashboard = mode === 'dashboard';

  const ensureAuthenticated = useCallback((): boolean => {
    return isAuthenticated;
  }, [isAuthenticated]);

  const explore = useExploreController({
    text,
    isAuthenticated,
    currentUserId,
    currentUserEmail,
    showExplore
  });

  const create = useCreateController({
    text,
    isAuthenticated,
    currentUserId,
    currentUserEmail,
    loadPublicPostcards: explore.loadPublicPostcards
  });

  const { loadDashboardData, ...dashboard } = useDashboardController({
    text,
    ensureAuthenticated,
    currentUserId,
    currentUserEmail,
    loadPublicPostcards: explore.loadPublicPostcards
  });

  useEffect(() => {
    if (!showDashboard || !isAuthenticated) {
      return;
    }

    void loadDashboardData();
  }, [showDashboard, isAuthenticated, loadDashboardData]);

  const isExploreOnlyPage = mode === 'explore';

  const workbenchClassName = [
    'grid gap-3',
    showExplore && showCreate ? 'grid-cols-[1.28fr_0.86fr] max-[1080px]:grid-cols-1' : 'grid-cols-1',
    isExploreOnlyPage ? 'h-full min-h-0 overflow-hidden max-[1080px]:overflow-visible' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const exploreMapClassName = isExploreOnlyPage
    ? 'h-full min-h-0 max-[1080px]:h-[460px] max-[1080px]:min-h-[460px] max-[780px]:h-[380px] max-[780px]:min-h-[380px]'
    : 'h-[540px] min-h-[560px] max-[1080px]:h-[460px] max-[1080px]:min-h-[460px] max-[780px]:h-[380px] max-[780px]:min-h-[380px]';

  return (
    <section className={workbenchClassName}>
      {showExplore ? (
        <ExploreSection
          text={text}
          isAuthenticated={isAuthenticated}
          visiblePostcards={explore.visiblePostcards}
          publicMarkerCount={explore.publicMarkers.length}
          visibleTotal={explore.visibleTotal}
          visibleHasMore={explore.visibleHasMore}
          exploreLimit={explore.exploreLimit}
          exploreSort={explore.exploreSort}
          searchText={explore.searchText}
          mapBoundsLoaded={Boolean(explore.mapBounds)}
          isLoadingPublic={explore.isLoadingPublic}
          exploreStatus={explore.exploreStatus}
          focusedMarkerId={explore.focusedMarkerId}
          feedbackPendingKey={explore.feedbackPendingKey}
          onSearchChange={explore.setSearchText}
          onSortChange={explore.setExploreSort}
          onLimitChange={explore.setExploreLimit}
          onSubmitFeedback={(postcardId, action, reportInput) =>
            void explore.submitExploreFeedback(postcardId, action, reportInput)
          }
          onSignIn={() => signIn('google')}
          mapNode={
            <OpenMap
              className={exploreMapClassName}
              markers={explore.publicMarkers}
              focusedMarkerId={explore.focusedMarkerId}
              viewerFocusSignal={explore.viewerFocusSignal}
              onLocateRequest={() => explore.requestDeviceLocation(false)}
              isLocating={explore.isRequestingLocation}
              onViewportChange={explore.handleViewportChange}
              viewerPoint={
                explore.deviceLocation
                  ? {
                      latitude: explore.deviceLocation.latitude,
                      longitude: explore.deviceLocation.longitude,
                      label: text.exploreViewerLabel,
                      accuracy: explore.deviceLocation.accuracy
                    }
                  : undefined
              }
            />
          }
        />
      ) : null}

      {showCreate ? (
        <CreateSection
          text={text}
          isAuthenticated={isAuthenticated}
          isSubmittingAi={create.isSubmittingAi}
          isSavingManual={create.isSavingManual}
          aiFile={create.aiFile}
          manualFile={create.manualFile}
          manualTitle={create.manualTitle}
          manualPostcardType={create.manualPostcardType}
          manualNotes={create.manualNotes}
          manualLocationInput={create.manualLocationInput}
          aiInputVersion={create.aiInputVersion}
          createStatus={create.createStatus}
          queuedAiJobId={create.queuedAiJobId}
          queuedAiImageUrl={create.queuedAiImageUrl}
          onSignIn={() => signIn('google')}
          onSubmitAi={create.submitAiDetectJob}
          onAiFileChange={create.setAiFile}
          onOpenDashboard={create.openDashboard}
          onManualTitleChange={create.setManualTitle}
          onManualPostcardTypeChange={create.setManualPostcardType}
          onManualNotesChange={create.setManualNotes}
          onManualLocationInputChange={create.setManualLocationInput}
          onManualFileChange={create.setManualFile}
          onSaveManual={() => void create.saveManualPostcard()}
        />
      ) : null}

      {showDashboard ? (
        <DashboardSection
          text={text}
          isAuthenticated={isAuthenticated}
          jobs={dashboard.jobs}
          myPostcards={dashboard.myPostcards}
          savedPostcards={dashboard.savedPostcards}
          myReports={dashboard.myReports}
          postcardDrafts={dashboard.postcardDrafts}
          savingJobId={dashboard.savingJobId}
          savingPostcardId={dashboard.savingPostcardId}
          deletingPostcardId={dashboard.deletingPostcardId}
          editingCropPostcardId={dashboard.editingCropPostcardId}
          editingCropOriginalUrl={dashboard.editingCropOriginalUrl}
          cropDraft={dashboard.cropDraft}
          savingCropPostcardId={dashboard.savingCropPostcardId}
          cancelingReportId={dashboard.cancelingReportId}
          isLoadingJobs={dashboard.isLoadingJobs}
          isLoadingMine={dashboard.isLoadingMine}
          isLoadingSaved={dashboard.isLoadingSaved}
          isLoadingReports={dashboard.isLoadingReports}
          isLoadingProfile={dashboard.isLoadingProfile}
          isSavingProfile={dashboard.isSavingProfile}
          profileEmail={dashboard.profileEmail}
          profileDisplayName={dashboard.profileDisplayName}
          dashboardStatus={dashboard.dashboardStatus}
          dashboardViewMode={dashboard.dashboardViewMode}
          onSignIn={() => signIn('google')}
          onProfileDisplayNameChange={dashboard.setProfileDisplayName}
          onSaveProfileDisplayName={() => void dashboard.saveProfileDisplayName()}
          onSetDashboardViewMode={dashboard.setDashboardViewMode}
          onRefresh={() => void loadDashboardData()}
          onUpdatePostcardDraft={dashboard.updatePostcardDraft}
          onSaveDetectedJob={(job) => void dashboard.saveDetectedJobAsPostcard(job)}
          onSavePostcard={(postcard) => void dashboard.savePostcardEdits(postcard)}
          isJobAlreadySaved={dashboard.isJobAlreadySaved}
          onOpenCropEditor={dashboard.openCropEditor}
          onSaveCrop={(postcardId) => void dashboard.saveCropEdit(postcardId)}
          onCloseCropEditor={dashboard.closeCropEditor}
          onSoftDelete={(postcard) => void dashboard.softDeletePostcard(postcard)}
          onCropChange={dashboard.updateCropDraft}
          onCancelReport={(report) => void dashboard.cancelReport(report)}
        />
      ) : null}
    </section>
  );
}
