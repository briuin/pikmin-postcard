'use client';

import type { WorkbenchText } from '@/lib/i18n';
import {
  actionButtonClassName,
  chipRowClassName,
  inlineFieldClassName,
  inputClassName,
  smallMutedClassName
} from '@/components/workbench/dashboard-view/styles';

type DashboardProfilePanelProps = {
  text: WorkbenchText;
  showHeader?: boolean;
  section?: 'personal' | 'password' | 'all';
  profileEmail: string;
  profileDisplayName: string;
  profileAccountId: string;
  profileHasPassword: boolean;
  profilePassword: string;
  profilePasswordConfirm: string;
  profilePasswordStatus: string;
  profilePasswordStatusTone: 'neutral' | 'success' | 'error' | 'loading';
  isLoadingProfile: boolean;
  isSavingProfile: boolean;
  onProfileDisplayNameChange: (value: string) => void;
  onProfilePasswordChange: (value: string) => void;
  onProfilePasswordConfirmChange: (value: string) => void;
  onSaveProfileDisplayName: () => void;
  onSaveProfilePassword: () => void;
};

export function DashboardProfilePanel({
  text,
  showHeader = true,
  section = 'all',
  profileEmail,
  profileDisplayName,
  profileAccountId,
  profileHasPassword,
  profilePassword,
  profilePasswordConfirm,
  profilePasswordStatus,
  profilePasswordStatusTone,
  isLoadingProfile,
  isSavingProfile,
  onProfileDisplayNameChange,
  onProfilePasswordChange,
  onProfilePasswordConfirmChange,
  onSaveProfileDisplayName,
  onSaveProfilePassword
}: DashboardProfilePanelProps) {
  const showPersonalSection = section === 'all' || section === 'personal';
  const showPasswordSection = section === 'all' || section === 'password';
  const passwordStatusClassName =
    profilePasswordStatusTone === 'error'
      ? 'rounded-[12px] border border-[#efc5bd] bg-[#fff3ef] px-3 py-2 text-[0.83rem] font-semibold text-[#b05338]'
      : profilePasswordStatusTone === 'success'
        ? 'rounded-[12px] border border-[#cfe5cd] bg-[#f1fff0] px-3 py-2 text-[0.83rem] font-semibold text-[#2f7a44]'
        : profilePasswordStatusTone === 'loading'
          ? 'rounded-[12px] border border-[#d9e6cf] bg-[#f6fbf0] px-3 py-2 text-[0.83rem] font-semibold text-[#56715d]'
          : 'rounded-[12px] border border-[#d9e6cf] bg-[#f6fbf0] px-3 py-2 text-[0.83rem] font-semibold text-[#56715d]';

  return (
    <div className="grid gap-2 rounded-[14px] border border-[#deead9] bg-[linear-gradient(140deg,rgba(244,255,245,0.95),rgba(247,254,255,0.92))] px-2.5 py-2">
      {showHeader ? <strong>{text.profileTitle}</strong> : null}
      {showHeader ? <small className={smallMutedClassName}>{text.profileSubtitle}</small> : null}
      {showPersonalSection ? (
        <>
          <div className="grid gap-1">
            <strong>{text.profilePersonalSectionTitle}</strong>
            <small className={smallMutedClassName}>{text.profilePersonalSectionBody}</small>
          </div>
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
          {profileAccountId ? (
            <small className={smallMutedClassName}>{text.profileAccountIdReadOnly(profileAccountId)}</small>
          ) : null}
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
        </>
      ) : null}

      {showPasswordSection ? (
        <>
          <div className="grid gap-1">
            <strong>{text.profilePasswordSectionTitle}</strong>
            <small className={smallMutedClassName}>
              {profileHasPassword ? text.profilePasswordHintSet : text.profilePasswordHintUnset}
            </small>
          </div>
          <small className={smallMutedClassName}>
            {text.profilePasswordStatusLabel}: {profileHasPassword ? text.profilePasswordStatusSet : text.profilePasswordStatusUnset}
          </small>
          <label className={inlineFieldClassName}>
            {text.profilePasswordLabel}
            <input
              className={inputClassName}
              value={profilePassword}
              onChange={(event) => onProfilePasswordChange(event.target.value)}
              placeholder={text.profilePasswordPlaceholder}
              disabled={isLoadingProfile || isSavingProfile}
              type="password"
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label className={inlineFieldClassName}>
            {text.profilePasswordConfirmLabel}
            <input
              className={inputClassName}
              value={profilePasswordConfirm}
              onChange={(event) => onProfilePasswordConfirmChange(event.target.value)}
              placeholder={text.profilePasswordConfirmPlaceholder}
              disabled={isLoadingProfile || isSavingProfile}
              type="password"
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <small className={smallMutedClassName}>{text.profilePasswordPlaceholder}</small>
          {profilePasswordStatus ? (
            <div
              aria-live="polite"
              role={profilePasswordStatusTone === 'error' ? 'alert' : 'status'}
              className={passwordStatusClassName}
            >
              {profilePasswordStatus}
            </div>
          ) : null}
          <div className={chipRowClassName}>
            <button
              type="button"
              className={actionButtonClassName}
              onClick={onSaveProfilePassword}
              disabled={isLoadingProfile || isSavingProfile}
            >
              {isSavingProfile ? text.buttonSaving : text.profilePasswordSaveButton}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
