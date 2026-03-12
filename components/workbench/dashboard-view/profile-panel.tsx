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
  profileEmail: string;
  profileDisplayName: string;
  profileAccountId: string;
  profileHasPassword: boolean;
  profilePassword: string;
  profilePasswordConfirm: string;
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
  profileEmail,
  profileDisplayName,
  profileAccountId,
  profileHasPassword,
  profilePassword,
  profilePasswordConfirm,
  isLoadingProfile,
  isSavingProfile,
  onProfileDisplayNameChange,
  onProfilePasswordChange,
  onProfilePasswordConfirmChange,
  onSaveProfileDisplayName,
  onSaveProfilePassword
}: DashboardProfilePanelProps) {
  return (
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
      {profileAccountId ? (
        <small className={smallMutedClassName}>{text.profileAccountIdReadOnly(profileAccountId)}</small>
      ) : null}
      <small className={smallMutedClassName}>
        {text.profilePasswordStatusLabel}: {profileHasPassword ? text.profilePasswordStatusSet : text.profilePasswordStatusUnset}
      </small>
      <small className={smallMutedClassName}>
        {profileHasPassword ? text.profilePasswordHintSet : text.profilePasswordHintUnset}
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
        />
      </label>
      <div className={chipRowClassName}>
        <button
          type="button"
          className={actionButtonClassName}
          onClick={onSaveProfileDisplayName}
          disabled={isLoadingProfile || isSavingProfile}
        >
          {isSavingProfile ? text.buttonSaving : text.profileSaveButton}
        </button>
        <button
          type="button"
          className={actionButtonClassName}
          onClick={onSaveProfilePassword}
          disabled={isLoadingProfile || isSavingProfile}
        >
          {isSavingProfile ? text.buttonSaving : text.profilePasswordSaveButton}
        </button>
      </div>
    </div>
  );
}
