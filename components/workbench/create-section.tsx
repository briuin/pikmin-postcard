'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import { PostcardTypeOptions } from '@/components/workbench/postcard-type-options';
import type { PostcardType } from '@/components/workbench/types';

type CreateSectionProps = {
  text: WorkbenchText;
  isAuthenticated: boolean;
  isSubmittingAi: boolean;
  isSavingManual: boolean;
  aiFile: File | null;
  manualFile: File | null;
  manualTitle: string;
  manualPostcardType: PostcardType | '';
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
  onManualPostcardTypeChange: (value: PostcardType | '') => void;
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
  manualFile,
  manualTitle,
  manualPostcardType,
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
  onManualPostcardTypeChange,
  onManualNotesChange,
  onManualLocationInputChange,
  onManualFileChange,
  onSaveManual
}: CreateSectionProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('manual');
  const aiReady = Boolean(isAuthenticated && aiFile);
  const manualReady = Boolean(isAuthenticated && manualPostcardType && manualTitle.trim() && manualLocationInput.trim() && manualFile);
  const panelClassName =
    'relative grid content-start gap-3 rounded-[24px] border border-white/70 bg-[linear-gradient(168deg,rgba(255,255,255,0.97),rgba(238,251,239,0.9))] p-3 shadow-[0_18px_36px_rgba(57,78,66,0.12),inset_0_1px_0_rgba(255,255,255,0.92)] max-[780px]:rounded-2xl';
  const sectionHeadClassName = 'grid gap-1';
  const smallMutedClassName = 'text-[0.82rem] leading-relaxed text-[#5b7468]';
  const formStackClassName = 'grid gap-3 rounded-[18px] border border-[#d6e8d5] bg-[linear-gradient(162deg,rgba(255,255,255,0.92),rgba(244,255,248,0.9))] p-3';
  const fieldGridClassName = 'grid gap-2.5 sm:grid-cols-2';
  const inlineFieldClassName = 'mb-0 grid gap-1.5 text-[0.91rem] font-bold text-[#39604f]';
  const authCalloutClassName =
    'grid gap-2 rounded-[16px] border border-[#d8e8d2] bg-[linear-gradient(145deg,rgba(242,252,228,0.9),rgba(240,255,250,0.86))] p-3';
  const statusBoxClassName = 'grid gap-1 rounded-[14px] border border-[#d5e8d1] bg-[linear-gradient(145deg,rgba(248,255,246,0.95),rgba(236,251,242,0.92))] p-3';
  const statusSuccessClassName =
    'grid gap-1 rounded-[14px] border border-[#b8e2c2] bg-[linear-gradient(145deg,rgba(230,255,236,0.93),rgba(240,255,249,0.95))] p-3';
  const inputClassName =
    'w-full rounded-[13px] border border-[#d8e6d5] bg-[#fdfffc] px-3 py-2 text-[#1f2e29] outline-none transition focus:border-[#72b485] focus:ring-4 focus:ring-[rgba(86,179,106,0.18)] disabled:opacity-60';
  const primaryButtonClassName =
    'cursor-pointer rounded-[13px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-4 py-2.5 font-bold text-white shadow-[0_8px_16px_rgba(47,158,88,0.23)] transition hover:enabled:-translate-y-px hover:enabled:shadow-[0_11px_18px_rgba(47,158,88,0.27)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';
  const tabBarClassName = 'grid grid-cols-2 gap-1.5 rounded-[14px] border border-[#d6e8d5] bg-[linear-gradient(145deg,rgba(243,250,241,0.9),rgba(246,254,248,0.9))] p-1';
  const tabButtonBaseClassName =
    'cursor-pointer rounded-[11px] px-3 py-2 text-left text-[0.85rem] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#72b485]';
  const tabButtonActiveClassName =
    'bg-[linear-gradient(135deg,#56b36a,#2f9e58)] text-white shadow-[0_6px_12px_rgba(47,158,88,0.2)]';
  const tabButtonIdleClassName = 'bg-transparent text-[#3f6253] hover:bg-[#edf7ea]';
  const fileInfoClassName = 'text-[0.78rem] font-semibold text-[#5b7468]';

  return (
    <article className={panelClassName}>
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

      <div className={tabBarClassName}>
        <button
          type="button"
          className={`${tabButtonBaseClassName} ${activeTab === 'manual' ? tabButtonActiveClassName : tabButtonIdleClassName}`}
          onClick={() => setActiveTab('manual')}
          aria-pressed={activeTab === 'manual'}
        >
          {text.createTabManual}
        </button>
        <button
          type="button"
          className={`${tabButtonBaseClassName} ${activeTab === 'ai' ? tabButtonActiveClassName : tabButtonIdleClassName}`}
          onClick={() => setActiveTab('ai')}
          aria-pressed={activeTab === 'ai'}
        >
          {text.createTabAi}
        </button>
      </div>

      {activeTab === 'manual' ? (
        <div className={formStackClassName}>
          <h3>{text.optionManualTitle}</h3>
          <small className={smallMutedClassName}>{text.optionManualBody}</small>
          <div className={fieldGridClassName}>
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
              {text.fieldPostcardType}
              <select
                className={inputClassName}
                value={manualPostcardType}
                onChange={(event) => onManualPostcardTypeChange(event.target.value as PostcardType | '')}
                disabled={!isAuthenticated || isSavingManual || isSubmittingAi}
              >
                <PostcardTypeOptions
                  text={text}
                  includePlaceholder
                  placeholderLabel={text.postcardTypeSelectPlaceholder}
                />
              </select>
            </label>
            <label className={`${inlineFieldClassName} sm:col-span-2`}>
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
              <small className={fileInfoClassName}>{manualFile ? manualFile.name : '-'}</small>
            </label>
          </div>
          <button
            type="button"
            className={primaryButtonClassName}
            disabled={!manualReady || isSavingManual || isSubmittingAi}
            onClick={onSaveManual}
          >
            {isSavingManual ? text.buttonSaving : text.buttonCreatePostcard}
          </button>
        </div>
      ) : null}

      {activeTab === 'ai' ? (
        <>
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
              <small className={fileInfoClassName}>{aiFile ? aiFile.name : '-'}</small>
            </label>
            <button
              type="submit"
              className={primaryButtonClassName}
              disabled={!aiReady || isSubmittingAi || isSavingManual}
            >
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
        </>
      ) : null}

      {createStatus ? (
        <div className={statusBoxClassName}>
          <small className={smallMutedClassName}>{createStatus}</small>
        </div>
      ) : null}
    </article>
  );
}
