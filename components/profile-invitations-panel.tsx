'use client';

import type { WorkbenchText } from '@/lib/i18n';
import type { InviteCodeRecord } from '@/lib/invitations/types';
import type { PremiumFeatureKey } from '@/lib/premium-features';
import {
  actionButtonClassName,
  inlineFieldClassName,
  inputClassName,
  smallMutedClassName
} from '@/components/workbench/dashboard-view/styles';

type StatusTone = 'neutral' | 'success' | 'error' | 'loading';

type ProfileInvitationsPanelProps = {
  text: WorkbenchText;
  hasPremiumAccess: boolean;
  redeemedInviteCode: string;
  premiumFeatureIds: PremiumFeatureKey[];
  inviteCodes: InviteCodeRecord[];
  inviteCodeInput: string;
  inviteCodeStatus: string;
  inviteCodeStatusTone: StatusTone;
  isBusy: boolean;
  onInviteCodeChange: (value: string) => void;
  onApplyInviteCode: () => void;
};

function premiumFeatureLabel(text: WorkbenchText, featureId: PremiumFeatureKey): string {
  if (featureId === 'plantPaths') {
    return text.profilePremiumFeaturePlantPaths;
  }

  return featureId;
}

export function ProfileInvitationsPanel({
  text,
  hasPremiumAccess,
  redeemedInviteCode,
  premiumFeatureIds,
  inviteCodes,
  inviteCodeInput,
  inviteCodeStatus,
  inviteCodeStatusTone,
  isBusy,
  onInviteCodeChange,
  onApplyInviteCode
}: ProfileInvitationsPanelProps) {
  const statusClassName =
    inviteCodeStatusTone === 'error'
      ? 'rounded-[12px] border border-[#efc5bd] bg-[#fff3ef] px-3 py-2 text-[0.83rem] font-semibold text-[#b05338]'
      : inviteCodeStatusTone === 'success'
        ? 'rounded-[12px] border border-[#cfe5cd] bg-[#f1fff0] px-3 py-2 text-[0.83rem] font-semibold text-[#2f7a44]'
        : 'rounded-[12px] border border-[#d9e6cf] bg-[#f6fbf0] px-3 py-2 text-[0.83rem] font-semibold text-[#56715d]';

  return (
    <section className="grid gap-3 rounded-[16px] border border-[#deead9] bg-[linear-gradient(140deg,rgba(244,255,245,0.95),rgba(247,254,255,0.92))] px-3 py-3">
      <div className="grid gap-1">
        <strong>{text.profileInviteTitle}</strong>
        <small className={smallMutedClassName}>{text.profileInviteSubtitle}</small>
      </div>

      <div className="grid gap-2 rounded-[14px] border border-[#d9e7d7] bg-white/90 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[0.76rem] font-bold ${
              hasPremiumAccess
                ? 'border border-[#cfe5cd] bg-[#f1fff0] text-[#2f7a44]'
                : 'border border-[#ead8c9] bg-[#fff8f1] text-[#9b6242]'
            }`}
          >
            {hasPremiumAccess ? text.profilePremiumActive : text.profilePremiumLocked}
          </span>
          {premiumFeatureIds.map((featureId) => (
            <span
              key={featureId}
              className="rounded-full border border-[#d9e6d7] bg-[#f6fbf5] px-2.5 py-1 text-[0.76rem] font-semibold text-[#446554]"
            >
              {premiumFeatureLabel(text, featureId)}
            </span>
          ))}
        </div>

        <small className={smallMutedClassName}>
          {hasPremiumAccess ? text.profilePremiumActiveBody : text.profilePremiumLockedBody}
        </small>

        {redeemedInviteCode ? (
          <small className={smallMutedClassName}>{text.profileRedeemedInviteCode(redeemedInviteCode)}</small>
        ) : null}

        {!hasPremiumAccess ? (
          <>
            <label className={inlineFieldClassName}>
              {text.profileInviteCodeLabel}
              <input
                className={`${inputClassName} font-mono uppercase tracking-[0.16em]`}
                value={inviteCodeInput}
                onChange={(event) => onInviteCodeChange(event.target.value)}
                placeholder={text.profileInviteCodePlaceholder}
                disabled={isBusy}
                maxLength={9}
                autoCapitalize="characters"
                autoCorrect="off"
              />
            </label>
            <button
              type="button"
              className={actionButtonClassName}
              onClick={onApplyInviteCode}
              disabled={isBusy}
            >
              {isBusy ? text.buttonSaving : text.profileInviteCodeApplyButton}
            </button>
          </>
        ) : null}

        {inviteCodeStatus ? (
          <div
            aria-live="polite"
            role={inviteCodeStatusTone === 'error' ? 'alert' : 'status'}
            className={statusClassName}
          >
            {inviteCodeStatus}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 rounded-[14px] border border-[#d9e7d7] bg-white/90 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <strong>{text.profileMyInviteCodesTitle}</strong>
          <small className={smallMutedClassName}>{text.profileMyInviteCodesCount(inviteCodes.length)}</small>
        </div>
        {inviteCodes.length === 0 ? (
          <small className={smallMutedClassName}>{text.profileMyInviteCodesEmpty}</small>
        ) : (
          <div className="grid gap-2">
            {inviteCodes.map((invite) => (
              <div
                key={invite.code}
                className="grid gap-1 rounded-[12px] border border-[#dce8dc] bg-[#f8fcf8] px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="text-[0.98rem] font-bold tracking-[0.16em] text-[#214333]">
                    {invite.code}
                  </code>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[0.74rem] font-bold ${
                      invite.isUsed
                        ? 'border border-[#e7d7cb] bg-[#fff7f2] text-[#9b6242]'
                        : 'border border-[#cfe5cd] bg-[#f1fff0] text-[#2f7a44]'
                    }`}
                  >
                    {invite.isUsed ? text.profileInviteCodeUsed : text.profileInviteCodeAvailable}
                  </span>
                </div>
                <small className={smallMutedClassName}>
                  {invite.isUsed && invite.usedByAccountId
                    ? text.profileInviteCodeUsedBy(invite.usedByAccountId)
                    : invite.isUsed
                      ? text.profileInviteCodeUsed
                      : text.profileInviteCodeAvailableHint}
                </small>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
