'use client';

import Image from 'next/image';
import ReactCrop, { type PercentCrop } from 'react-image-crop';
import type { WorkbenchText } from '@/lib/i18n';
import type {
  DashboardViewMode,
  DetectionDraft,
  DetectionJobRecord,
  PostcardEditDraft,
  PostcardRecord
} from '@/components/workbench/types';
import type { CropDraft } from '@/components/workbench/utils';

type DashboardSectionProps = {
  text: WorkbenchText;
  isAuthenticated: boolean;
  jobs: DetectionJobRecord[];
  myPostcards: PostcardRecord[];
  jobDrafts: Record<string, DetectionDraft>;
  postcardDrafts: Record<string, PostcardEditDraft>;
  savingJobId: string | null;
  savingPostcardId: string | null;
  deletingPostcardId: string | null;
  editingCropPostcardId: string | null;
  editingCropOriginalUrl: string | null;
  cropDraft: CropDraft;
  savingCropPostcardId: string | null;
  isLoadingJobs: boolean;
  isLoadingMine: boolean;
  isLoadingProfile: boolean;
  isSavingProfile: boolean;
  profileEmail: string;
  profileDisplayName: string;
  dashboardStatus: string;
  dashboardViewMode: DashboardViewMode;
  onSignIn: () => void;
  onProfileDisplayNameChange: (value: string) => void;
  onSaveProfileDisplayName: () => void;
  onSetDashboardViewMode: (mode: DashboardViewMode) => void;
  onRefresh: () => void;
  onUpdateJobDraft: (jobId: string, patch: Partial<DetectionDraft>) => void;
  onUpdatePostcardDraft: (postcardId: string, patch: Partial<PostcardEditDraft>) => void;
  onSaveDetectedJob: (job: DetectionJobRecord) => void;
  onSavePostcard: (postcard: PostcardRecord) => void;
  isJobAlreadySaved: (job: DetectionJobRecord) => boolean;
  onOpenCropEditor: (postcard: PostcardRecord) => void;
  onSaveCrop: (postcardId: string) => void;
  onCloseCropEditor: () => void;
  onSoftDelete: (postcard: PostcardRecord) => void;
  onCropChange: (crop: PercentCrop) => void;
};

export function DashboardSection({
  text,
  isAuthenticated,
  jobs,
  myPostcards,
  jobDrafts,
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
  onUpdateJobDraft,
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
  const panelClassName =
    'relative rounded-[22px] border border-white/60 bg-[linear-gradient(165deg,rgba(255,255,255,0.96),rgba(245,255,246,0.92))] p-[0.88rem] shadow-[0_16px_34px_rgba(57,78,66,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] max-[780px]:rounded-2xl max-[780px]:p-3';
  const sectionHeadClassName = 'mb-2 grid gap-1.5';
  const chipRowClassName = 'flex flex-wrap gap-1.5';
  const chipClassName =
    'inline-flex items-center rounded-full border border-[#d6e8d4] bg-[#f4fff4] px-2.5 py-1 text-[0.78rem] font-bold text-[#2b6442]';
  const inlineFieldClassName = 'mb-0 grid gap-1.5 text-[0.91rem] font-bold text-[#39604f]';
  const postcardItemClassName = 'grid gap-1.5 rounded-[14px] border border-[#e2eee0] bg-[#f8fffc] px-3 py-2.5';
  const postcardItemHeadClassName = 'flex items-center justify-between gap-2';
  const smallMutedClassName = 'text-[0.82rem] text-[#5f736c]';
  const actionButtonClassName =
    'rounded-[10px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-2.5 py-1.5 text-[0.83rem] font-bold text-white shadow-[0_4px_10px_rgba(47,158,88,0.18)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';
  const authCalloutClassName =
    'grid gap-2 rounded-[14px] border border-[#dce8d7] bg-[linear-gradient(145deg,rgba(243,251,226,0.8),rgba(241,255,251,0.8))] p-3';
  const dashboardToolbarClassName =
    'flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#deead9] bg-[linear-gradient(140deg,rgba(244,255,245,0.95),rgba(247,254,255,0.92))] px-2.5 py-2';
  const cropEditorClassName = 'grid gap-2 rounded-xl border border-dashed border-[#c9dfc7] bg-[#f6fff6] p-2.5';
  const cropPreviewClassName = 'w-full overflow-hidden rounded-[10px] border border-[#d8e7d8] bg-[#edf4ed]';
  const cropImageClassName = 'block h-auto max-h-[420px] w-full bg-[#edf4ed] object-contain';
  const dashboardListClassName =
    dashboardViewMode === 'grid'
      ? 'mt-2 grid grid-cols-2 gap-2 max-[780px]:grid-cols-1'
      : 'mt-2 grid grid-cols-1 gap-2';
  const inputClassName =
    'w-full rounded-[13px] border border-[#d8e6d5] bg-[#fdfffc] px-3 py-2 text-[#1f2e29] outline-none transition focus:border-[#72b485] focus:ring-4 focus:ring-[rgba(86,179,106,0.18)] disabled:opacity-60';
  const primaryButtonClassName =
    'rounded-[13px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-4 py-2.5 font-bold text-white shadow-[0_8px_16px_rgba(47,158,88,0.23)] transition hover:enabled:-translate-y-px hover:enabled:shadow-[0_11px_18px_rgba(47,158,88,0.27)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';

  return (
    <article className={`${panelClassName} grid content-start gap-3`}>
      <div className={sectionHeadClassName}>
        <div>
          <h2>{text.dashboardTitle}</h2>
          <small className={smallMutedClassName}>{text.dashboardSubtitle}</small>
        </div>
      </div>

      {!isAuthenticated ? (
        <div className={authCalloutClassName}>
          <strong>{text.loginRequiredTitle}</strong>
          <small className={smallMutedClassName}>{text.loginRequiredDashboardBody}</small>
          <button type="button" className={primaryButtonClassName} onClick={onSignIn}>
            {text.buttonSignInGoogle}
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-2 rounded-[14px] border border-[#deead9] bg-[linear-gradient(140deg,rgba(244,255,245,0.95),rgba(247,254,255,0.92))] px-2.5 py-2">
            <strong>{text.profileTitle}</strong>
            <small className={smallMutedClassName}>{text.profileSubtitle}</small>
            <label className={inlineFieldClassName}>
              {text.profileDisplayNameLabel}
              <input
                className={inputClassName}
                value={profileDisplayName}
                onChange={(event) => onProfileDisplayNameChange(event.target.value)}
                placeholder={text.profileDisplayNamePlaceholder}
                disabled={isLoadingProfile || isSavingProfile}
              />
            </label>
            {profileEmail ? <small className={smallMutedClassName}>{text.profileEmailReadOnly(profileEmail)}</small> : null}
            <div className={chipRowClassName}>
              <button
                type="button"
                className={actionButtonClassName}
                onClick={onSaveProfileDisplayName}
                disabled={isLoadingProfile || isSavingProfile}
              >
                {isSavingProfile ? text.buttonSaving : text.profileSaveButton}
              </button>
            </div>
          </div>

          <div className={dashboardToolbarClassName}>
            <div className={chipRowClassName}>
              <span className={chipClassName}>{text.chipAiJobs(jobs.length)}</span>
              <span className={chipClassName}>{text.chipMyPostcards(myPostcards.length)}</span>
            </div>
            <div className={chipRowClassName}>
              <button type="button" className={actionButtonClassName} onClick={() => onSetDashboardViewMode('grid')} disabled={dashboardViewMode === 'grid'}>
                {text.buttonGrid}
              </button>
              <button type="button" className={actionButtonClassName} onClick={() => onSetDashboardViewMode('list')} disabled={dashboardViewMode === 'list'}>
                {text.buttonList}
              </button>
              <button type="button" className={actionButtonClassName} onClick={onRefresh} disabled={isLoadingJobs || isLoadingMine}>
                {text.buttonRefresh}
              </button>
            </div>
          </div>

          {dashboardStatus ? <small className={smallMutedClassName}>{dashboardStatus}</small> : null}

          <h3 className="mt-2">{text.aiJobsTitle}</h3>
          {isLoadingJobs ? <small className={smallMutedClassName}>{text.aiJobsLoading}</small> : null}
          {!isLoadingJobs && jobs.length === 0 ? <small className={smallMutedClassName}>{text.aiJobsEmpty}</small> : null}
          <div className={dashboardListClassName}>
            {jobs.slice(0, 20).map((job) => (
              <article key={job.id} className={postcardItemClassName}>
                <div className={postcardItemHeadClassName}>
                  <strong>{job.status}</strong>
                  <small className={smallMutedClassName}>{new Date(job.createdAt).toLocaleString(text.dateLocale)}</small>
                </div>
                {job.imageUrl ? (
                  <Image
                    className="h-auto max-h-[180px] w-full rounded-[10px] border border-[#deeadb] bg-[#edf6ef] object-contain"
                    src={job.imageUrl}
                    alt={text.aiJobImageAlt(job.id)}
                    width={640}
                    height={420}
                  />
                ) : null}
                <small className={smallMutedClassName}>{job.placeGuess ?? text.aiJobNoGuess}</small>
                {job.status === 'SUCCEEDED' && job.latitude !== null && job.longitude !== null ? (
                  <small className={smallMutedClassName}>
                    {job.latitude.toFixed(6)}, {job.longitude.toFixed(6)}
                    {job.confidence !== null ? ` (${text.aiConfidenceLabel(Math.round(job.confidence * 100))})` : ''}
                  </small>
                ) : null}
                {job.status === 'SUCCEEDED' && job.latitude !== null && job.longitude !== null ? (
                  <>
                    <label className={inlineFieldClassName}>
                      {text.fieldName}
                      <input
                        className={inputClassName}
                        value={jobDrafts[job.id]?.title ?? ''}
                        onChange={(event) => onUpdateJobDraft(job.id, { title: event.target.value })}
                        placeholder={text.fieldName}
                        disabled={savingJobId === job.id}
                      />
                    </label>
                    <label className={inlineFieldClassName}>
                      {text.fieldDescription}
                      <textarea
                        className={inputClassName}
                        rows={3}
                        value={jobDrafts[job.id]?.notes ?? ''}
                        onChange={(event) => onUpdateJobDraft(job.id, { notes: event.target.value })}
                        placeholder={text.fieldDescription}
                        disabled={savingJobId === job.id}
                      />
                    </label>
                    <label className={inlineFieldClassName}>
                      {text.fieldLocation}
                      <input
                        className={inputClassName}
                        value={jobDrafts[job.id]?.locationInput ?? ''}
                        onChange={(event) => onUpdateJobDraft(job.id, { locationInput: event.target.value })}
                        placeholder={text.manualLocationPlaceholder}
                        disabled={savingJobId === job.id}
                      />
                    </label>
                    {isJobAlreadySaved(job) ? (
                      <small className={smallMutedClassName}>{text.aiResultAlreadySaved}</small>
                    ) : (
                      <button
                        type="button"
                        className={primaryButtonClassName}
                        onClick={() => onSaveDetectedJob(job)}
                        disabled={savingJobId === job.id}
                      >
                        {savingJobId === job.id ? text.buttonSaving : text.saveAsPostcard}
                      </button>
                    )}
                  </>
                ) : null}
                {job.status === 'FAILED' && job.errorMessage ? <small className={smallMutedClassName}>{job.errorMessage}</small> : null}
              </article>
            ))}
          </div>

          <h3 className="mt-2">{text.myPostcardsTitle}</h3>
          {isLoadingMine ? <small className={smallMutedClassName}>{text.myPostcardsLoading}</small> : null}
          {!isLoadingMine && myPostcards.length === 0 ? <small className={smallMutedClassName}>{text.myPostcardsEmpty}</small> : null}
          <div className={dashboardListClassName}>
            {myPostcards.slice(0, 20).map((postcard) => (
              <article key={postcard.id} className={postcardItemClassName}>
                <div className={postcardItemHeadClassName}>
                  <strong>{postcard.title}</strong>
                  <small className={smallMutedClassName}>{new Date(postcard.createdAt).toLocaleDateString(text.dateLocale)}</small>
                </div>
                {postcard.imageUrl ? (
                  <Image
                    className="h-auto max-h-[180px] w-full rounded-[10px] border border-[#deeadb] object-cover"
                    src={postcard.imageUrl}
                    alt={postcard.title}
                    width={640}
                    height={420}
                  />
                ) : null}
                <label className={inlineFieldClassName}>
                  {text.fieldName}
                  <input
                    className={inputClassName}
                    value={postcardDrafts[postcard.id]?.title ?? ''}
                    onChange={(event) => onUpdatePostcardDraft(postcard.id, { title: event.target.value })}
                    placeholder={text.fieldName}
                    disabled={savingPostcardId === postcard.id || deletingPostcardId === postcard.id}
                  />
                </label>
                <label className={inlineFieldClassName}>
                  {text.fieldPlaceName}
                  <input
                    className={inputClassName}
                    value={postcardDrafts[postcard.id]?.placeName ?? ''}
                    onChange={(event) => onUpdatePostcardDraft(postcard.id, { placeName: event.target.value })}
                    placeholder={text.exploreUnknownPlace}
                    disabled={savingPostcardId === postcard.id || deletingPostcardId === postcard.id}
                  />
                </label>
                <label className={inlineFieldClassName}>
                  {text.fieldDescription}
                  <textarea
                    className={inputClassName}
                    rows={3}
                    value={postcardDrafts[postcard.id]?.notes ?? ''}
                    onChange={(event) => onUpdatePostcardDraft(postcard.id, { notes: event.target.value })}
                    placeholder={text.manualDescriptionPlaceholder}
                    disabled={savingPostcardId === postcard.id || deletingPostcardId === postcard.id}
                  />
                </label>
                <label className={inlineFieldClassName}>
                  {text.fieldLocation}
                  <input
                    className={inputClassName}
                    value={postcardDrafts[postcard.id]?.locationInput ?? ''}
                    onChange={(event) => onUpdatePostcardDraft(postcard.id, { locationInput: event.target.value })}
                    placeholder={text.manualLocationPlaceholder}
                    disabled={savingPostcardId === postcard.id || deletingPostcardId === postcard.id}
                  />
                </label>
                <div className={chipRowClassName}>
                  <button
                    type="button"
                    className={actionButtonClassName}
                    onClick={() => onSavePostcard(postcard)}
                    disabled={savingPostcardId === postcard.id || deletingPostcardId === postcard.id}
                  >
                    {savingPostcardId === postcard.id ? text.buttonSavingChanges : text.buttonSaveChanges}
                  </button>
                  <button
                    type="button"
                    className={actionButtonClassName}
                    onClick={() => onOpenCropEditor(postcard)}
                    disabled={
                      savingCropPostcardId === postcard.id ||
                      deletingPostcardId === postcard.id ||
                      savingPostcardId === postcard.id
                    }
                  >
                    {editingCropPostcardId === postcard.id ? text.buttonEditingCrop : text.buttonEditCrop}
                  </button>
                  <button
                    type="button"
                    className={actionButtonClassName}
                    onClick={() => onSoftDelete(postcard)}
                    disabled={
                      deletingPostcardId === postcard.id ||
                      savingCropPostcardId === postcard.id ||
                      savingPostcardId === postcard.id
                    }
                  >
                    {deletingPostcardId === postcard.id ? text.buttonRemoving : text.buttonRemoveSoftDelete}
                  </button>
                </div>
                {editingCropPostcardId === postcard.id && editingCropOriginalUrl ? (
                  <div className={cropEditorClassName}>
                    <strong>{text.cropEditorTitle}</strong>
                    <small className={smallMutedClassName}>{text.cropEditorBody}</small>
                    <div className={cropPreviewClassName}>
                      <ReactCrop
                        crop={cropDraft}
                        onChange={(_, percentCrop) => onCropChange(percentCrop)}
                        ruleOfThirds
                        keepSelection
                        className="block w-full"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={editingCropOriginalUrl} alt={text.cropEditorImageAlt} className={cropImageClassName} />
                      </ReactCrop>
                    </div>
                    <small className={smallMutedClassName}>{text.cropSelection(
                      Math.round(cropDraft.x ?? 0),
                      Math.round(cropDraft.y ?? 0),
                      Math.round(cropDraft.width ?? 0),
                      Math.round(cropDraft.height ?? 0)
                    )}</small>
                    <div className={chipRowClassName}>
                      <button
                        type="button"
                        className={actionButtonClassName}
                        onClick={() => onSaveCrop(postcard.id)}
                        disabled={savingCropPostcardId === postcard.id}
                      >
                        {savingCropPostcardId === postcard.id ? text.buttonSavingCrop : text.buttonSaveCrop}
                      </button>
                      <button
                        type="button"
                        className={actionButtonClassName}
                        onClick={onCloseCropEditor}
                        disabled={savingCropPostcardId === postcard.id}
                      >
                        {text.buttonCancel}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
