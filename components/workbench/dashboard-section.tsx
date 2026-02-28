'use client';

import { useEffect, useState } from 'react';
import { DashboardAiJobsList } from '@/components/workbench/dashboard-view/ai-jobs-list';
import { DashboardAuthCallout } from '@/components/workbench/dashboard-view/auth-callout';
import { DashboardCategoryTabs } from '@/components/workbench/dashboard-view/category-tabs';
import { DashboardImagePreviewModal } from '@/components/workbench/dashboard-view/image-preview-modal';
import { DashboardPostcardsList } from '@/components/workbench/dashboard-view/postcards-list';
import { DashboardProfilePanel } from '@/components/workbench/dashboard-view/profile-panel';
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

export function DashboardSection({
  text,
  isAuthenticated,
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
  onSignIn,
  onProfileDisplayNameChange,
  onSaveProfileDisplayName,
  onSetDashboardViewMode,
  onRefresh,
  onUpdatePostcardDraft,
  onSaveDetectedJob,
  onSavePostcard,
  isJobAlreadySaved,
  onOpenCropEditor,
  onSaveCrop,
  onCloseCropEditor,
  onSoftDelete,
  onCropChange
}: DashboardSectionProps) {
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [activeCategory, setActiveCategory] = useState<DashboardCategory>('ai');

  useEffect(() => {
    if (!previewImage) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [previewImage]);

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
        <DashboardAuthCallout text={text} onSignIn={onSignIn} />
      ) : (
        <>
          <DashboardProfilePanel
            text={text}
            profileEmail={profileEmail}
            profileDisplayName={profileDisplayName}
            isLoadingProfile={isLoadingProfile}
            isSavingProfile={isSavingProfile}
            onProfileDisplayNameChange={onProfileDisplayNameChange}
            onSaveProfileDisplayName={onSaveProfileDisplayName}
          />

          <DashboardToolbar
            text={text}
            jobsCount={jobs.length}
            postcardsCount={myPostcards.length}
            dashboardViewMode={dashboardViewMode}
            isLoadingJobs={isLoadingJobs}
            isLoadingMine={isLoadingMine}
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
                dashboardListClassName={dashboardListClassName}
                onUpdatePostcardDraft={onUpdatePostcardDraft}
                onSavePostcard={onSavePostcard}
                onOpenCropEditor={onOpenCropEditor}
                onSaveCrop={onSaveCrop}
                onCloseCropEditor={onCloseCropEditor}
                onSoftDelete={onSoftDelete}
                onCropChange={onCropChange}
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
