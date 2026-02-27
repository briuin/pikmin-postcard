'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import type { WorkbenchText } from '@/lib/i18n';

type CreateSectionProps = {
  text: WorkbenchText;
  isAuthenticated: boolean;
  isSubmittingAi: boolean;
  isSavingManual: boolean;
  aiFile: File | null;
  manualTitle: string;
  manualNotes: string;
  manualLocationInput: string;
  aiInputVersion: number;
  createStatus: string;
  queuedAiJobId: string | null;
  queuedAiImageUrl: string | null;
  onSignIn: () => void;
  onSubmitAi: (event: FormEvent) => void;
  onAiFileChange: (file: File | null) => void;
  onOpenDashboard: () => void;
  onManualTitleChange: (value: string) => void;
  onManualNotesChange: (value: string) => void;
  onManualLocationInputChange: (value: string) => void;
  onManualFileChange: (file: File | null) => void;
  onSaveManual: () => void;
};

export function CreateSection({
  text,
  isAuthenticated,
  isSubmittingAi,
  isSavingManual,
  aiFile,
  manualTitle,
  manualNotes,
  manualLocationInput,
  aiInputVersion,
  createStatus,
  queuedAiJobId,
  queuedAiImageUrl,
  onSignIn,
  onSubmitAi,
  onAiFileChange,
  onOpenDashboard,
  onManualTitleChange,
  onManualNotesChange,
  onManualLocationInputChange,
  onManualFileChange,
  onSaveManual
}: CreateSectionProps) {
  const panelClassName =
    'relative rounded-[22px] border border-white/60 bg-[linear-gradient(165deg,rgba(255,255,255,0.96),rgba(245,255,246,0.92))] p-[0.88rem] shadow-[0_16px_34px_rgba(57,78,66,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] max-[780px]:rounded-2xl max-[780px]:p-3';
  const sectionHeadClassName = 'mb-2 grid gap-1.5';
  const smallMutedClassName = 'text-[0.82rem] text-[#5f736c]';
  const formStackClassName = 'grid gap-0.5';
  const inlineFieldClassName = 'mb-0 grid gap-1.5 text-[0.91rem] font-bold text-[#39604f]';
  const authCalloutClassName =
    'grid gap-2 rounded-[14px] border border-[#dce8d7] bg-[linear-gradient(145deg,rgba(243,251,226,0.8),rgba(241,255,251,0.8))] p-3';
  const statusBoxClassName = 'grid gap-1 rounded-[14px] border border-[#e3eddc] bg-[#fbfffa] p-3';
  const statusSuccessClassName =
    'grid gap-1 rounded-[14px] border border-[#b9e3c3] bg-[linear-gradient(145deg,rgba(230,255,236,0.92),rgba(243,255,250,0.95))] p-3';
  const inputClassName =
    'w-full rounded-[13px] border border-[#d8e6d5] bg-[#fdfffc] px-3 py-2 text-[#1f2e29] outline-none transition focus:border-[#72b485] focus:ring-4 focus:ring-[rgba(86,179,106,0.18)] disabled:opacity-60';
  const primaryButtonClassName =
    'rounded-[13px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-4 py-2.5 font-bold text-white shadow-[0_8px_16px_rgba(47,158,88,0.23)] transition hover:enabled:-translate-y-px hover:enabled:shadow-[0_11px_18px_rgba(47,158,88,0.27)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';

  return (
    <article className={`${panelClassName} grid content-start gap-3`}>
      <div className={sectionHeadClassName}>
        <div>
          <h2>{text.createTitle}</h2>
          <small className={smallMutedClassName}>{text.createSubtitle}</small>
        </div>
      </div>

      {!isAuthenticated ? (
        <div className={authCalloutClassName}>
          <strong>{text.loginRequiredTitle}</strong>
          <small className={smallMutedClassName}>{text.loginRequiredCreateBody}</small>
          <button type="button" className={primaryButtonClassName} onClick={onSignIn}>
            {text.buttonSignInGoogle}
          </button>
        </div>
      ) : null}

      <form onSubmit={onSubmitAi} className={formStackClassName}>
        <h3>{text.optionAiTitle}</h3>
        <small className={smallMutedClassName}>{text.optionAiBody}</small>
        <label className={inlineFieldClassName}>
          {text.fieldImage}
          <input
            className={inputClassName}
            key={aiInputVersion}
            type="file"
            accept="image/*"
            onChange={(event) => onAiFileChange(event.target.files?.[0] ?? null)}
            disabled={!isAuthenticated || isSubmittingAi || isSavingManual}
          />
        </label>
        <button type="submit" className={primaryButtonClassName} disabled={!isAuthenticated || !aiFile || isSubmittingAi || isSavingManual}>
          {isSubmittingAi ? text.buttonSubmitting : text.buttonSubmitAiJob}
        </button>
      </form>

      {queuedAiJobId ? (
        <div className={statusSuccessClassName}>
          <small className={smallMutedClassName}>{text.queuedBody}</small>
          <small className={smallMutedClassName}>{text.queuedJobId(queuedAiJobId)}</small>
          {queuedAiImageUrl ? (
            <small className={smallMutedClassName}>
              {text.queuedImageLabel}:{' '}
              <Link href={queuedAiImageUrl} target="_blank" rel="noreferrer">
                {text.queuedOpenUploadedImage}
              </Link>
            </small>
          ) : null}
          <button type="button" className={primaryButtonClassName} onClick={onOpenDashboard}>
            {text.buttonOpenDashboard}
          </button>
        </div>
      ) : null}

      <div className={formStackClassName}>
        <h3>{text.optionManualTitle}</h3>
        <small className={smallMutedClassName}>{text.optionManualBody}</small>
        <label className={inlineFieldClassName}>
          {text.fieldName}
          <input
            className={inputClassName}
            value={manualTitle}
            onChange={(event) => onManualTitleChange(event.target.value)}
            placeholder={text.manualNamePlaceholder}
            disabled={!isAuthenticated || isSavingManual || isSubmittingAi}
          />
        </label>
        <label className={inlineFieldClassName}>
          {text.fieldDescription}
          <textarea
            className={inputClassName}
            rows={4}
            value={manualNotes}
            onChange={(event) => onManualNotesChange(event.target.value)}
            placeholder={text.manualDescriptionPlaceholder}
            disabled={!isAuthenticated || isSavingManual || isSubmittingAi}
          />
        </label>
        <label className={inlineFieldClassName}>
          {text.fieldLocation}
          <input
            className={inputClassName}
            value={manualLocationInput}
            onChange={(event) => onManualLocationInputChange(event.target.value)}
            placeholder={text.manualLocationPlaceholder}
            disabled={!isAuthenticated || isSavingManual || isSubmittingAi}
          />
        </label>
        <label className={inlineFieldClassName}>
          {text.fieldImage}
          <input
            className={inputClassName}
            type="file"
            accept="image/*"
            onChange={(event) => onManualFileChange(event.target.files?.[0] ?? null)}
            disabled={!isAuthenticated || isSavingManual || isSubmittingAi}
          />
        </label>
        <button type="button" className={primaryButtonClassName} disabled={!isAuthenticated || isSavingManual || isSubmittingAi} onClick={onSaveManual}>
          {isSavingManual ? text.buttonSaving : text.buttonCreatePostcard}
        </button>
      </div>

      <div className={statusBoxClassName}>
        <small className={smallMutedClassName}>{createStatus || text.noActionYet}</small>
      </div>
    </article>
  );
}
