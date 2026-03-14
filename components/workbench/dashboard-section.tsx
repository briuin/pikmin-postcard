'use client';

import { useState } from 'react';
import { DashboardAiJobsList } from '@/components/workbench/dashboard-view/ai-jobs-list';
import { DashboardAuthCallout } from '@/components/workbench/dashboard-view/auth-callout';
import { DashboardCategoryTabs } from '@/components/workbench/dashboard-view/category-tabs';
import { DashboardImagePreviewModal } from '@/components/workbench/dashboard-view/image-preview-modal';
import { DashboardPostcardsList } from '@/components/workbench/dashboard-view/postcards-list';
import { DashboardReportsList } from '@/components/workbench/dashboard-view/reports-list';
import { DashboardSavedList } from '@/components/workbench/dashboard-view/saved-list';
import { AuthLoadingState } from '@/components/auth-loading-state';
import {
  getDashboardListClassName,
  panelClassName,
  sectionHeadClassName,
  smallMutedClassName
} from '@/components/workbench/dashboard-view/styles';
import type {
  DashboardCategory,
  DashboardSectionProps,
  PreviewImage
} from '@/components/workbench/dashboard-view/types';
import { DashboardToolbar } from '@/components/workbench/dashboard-view/toolbar';
import { useBodyScrollLock } from '@/components/use-body-scroll-lock';

export function DashboardSection({
  text,
  isAuthenticated,
  isSessionLoading,
  sessionCheckingText,
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
  dashboardStatus,
  dashboardViewMode,
  onSignIn,
  onSetDashboardViewMode,
  onRefresh,
  onUpdatePostcardDraft,
  onSaveDetectedJob,
  onSavePostcard,
  isJobAlreadySaved,
  onOpenCropEditor,
  onSharePostcard,
  onSaveCrop,
  onCloseCropEditor,
  onSoftDelete,
  onCropChange,
  onCancelReport
}: DashboardSectionProps) {
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [activeCategory, setActiveCategory] = useState<DashboardCategory>('postcards');
  useBodyScrollLock(Boolean(previewImage));

  const dashboardListClassName = getDashboardListClassName(dashboardViewMode);

  return (
    <article className={`${panelClassName} grid content-start gap-3`}>
      <div className={sectionHeadClassName}>
        <div>
          <h2>{text.dashboardTitle}</h2>
          <small className={smallMutedClassName}>{text.dashboardSubtitle}</small>
        </div>
      </div>

      {!isAuthenticated ? (
        isSessionLoading ? (
          <AuthLoadingState title={text.loginRequiredTitle} body={sessionCheckingText} />
        ) : (
          <DashboardAuthCallout text={text} onSignIn={onSignIn} />
        )
      ) : (
        <>
          <DashboardToolbar
            text={text}
            jobsCount={jobs.length}
            postcardsCount={myPostcards.length}
            savedCount={savedPostcards.length}
            dashboardViewMode={dashboardViewMode}
            isLoadingJobs={isLoadingJobs}
            isLoadingMine={isLoadingMine}
            isLoadingSaved={isLoadingSaved}
            onSetDashboardViewMode={onSetDashboardViewMode}
            onRefresh={onRefresh}
          />

          {dashboardStatus ? <small className={smallMutedClassName}>{dashboardStatus}</small> : null}

          <div className="grid gap-2">
            <DashboardCategoryTabs
              text={text}
              activeCategory={activeCategory}
              jobsCount={jobs.length}
              postcardsCount={myPostcards.length}
              savedCount={savedPostcards.length}
              reportsCount={myReports.length}
              onChangeCategory={setActiveCategory}
            />

            {activeCategory === 'ai' ? (
              <DashboardAiJobsList
                text={text}
                jobs={jobs}
                isLoadingJobs={isLoadingJobs}
                dashboardListClassName={dashboardListClassName}
                savingJobId={savingJobId}
                isJobAlreadySaved={isJobAlreadySaved}
                onSaveDetectedJob={onSaveDetectedJob}
                onPreviewImage={setPreviewImage}
              />
            ) : null}

            {activeCategory === 'postcards' ? (
              <DashboardPostcardsList
                text={text}
                myPostcards={myPostcards}
                postcardDrafts={postcardDrafts}
                savingPostcardId={savingPostcardId}
                deletingPostcardId={deletingPostcardId}
                editingCropPostcardId={editingCropPostcardId}
                editingCropOriginalUrl={editingCropOriginalUrl}
                cropDraft={cropDraft}
                savingCropPostcardId={savingCropPostcardId}
                isLoadingMine={isLoadingMine}
                dashboardViewMode={dashboardViewMode}
                dashboardListClassName={dashboardListClassName}
                onUpdatePostcardDraft={onUpdatePostcardDraft}
                onSavePostcard={onSavePostcard}
                onOpenCropEditor={onOpenCropEditor}
                onSharePostcard={onSharePostcard}
                onSaveCrop={onSaveCrop}
                onCloseCropEditor={onCloseCropEditor}
                onSoftDelete={onSoftDelete}
                onCropChange={onCropChange}
                onPreviewImage={setPreviewImage}
              />
            ) : null}

            {activeCategory === 'reports' ? (
              <DashboardReportsList
                text={text}
                reports={myReports}
                isLoadingReports={isLoadingReports}
                dashboardListClassName={dashboardListClassName}
                cancelingReportId={cancelingReportId}
                onCancelReport={onCancelReport}
              />
            ) : null}

            {activeCategory === 'saved' ? (
              <DashboardSavedList
                text={text}
                savedPostcards={savedPostcards}
                isLoadingSaved={isLoadingSaved}
                dashboardListClassName={dashboardListClassName}
                onPreviewImage={setPreviewImage}
              />
            ) : null}
          </div>
        </>
      )}

      <DashboardImagePreviewModal text={text} previewImage={previewImage} onClose={() => setPreviewImage(null)} />
    </article>
  );
}
