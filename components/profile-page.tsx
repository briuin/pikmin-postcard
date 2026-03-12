'use client';

import Link from 'next/link';
import { useCallback, useEffect } from 'react';
import { signIn, useSession } from '@/lib/auth-client';
import { messages, type Locale } from '@/lib/i18n';
import { useDashboardController } from '@/components/workbench/use-dashboard-controller';
import { DashboardAuthCallout } from '@/components/workbench/dashboard-view/auth-callout';
import { DashboardProfilePanel } from '@/components/workbench/dashboard-view/profile-panel';
import {
  chipClassName,
  panelClassName,
  sectionHeadClassName,
  smallMutedClassName
} from '@/components/workbench/dashboard-view/styles';

type ProfilePageProps = {
  locale?: Locale;
};

export function ProfilePage({ locale = 'en' }: ProfilePageProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const currentUserEmail = session?.user?.email ?? null;
  const text = messages[locale].workbench;

  const ensureAuthenticated = useCallback((): boolean => isAuthenticated, [isAuthenticated]);
  const loadPublicPostcards = useCallback(async () => {}, []);

  const { loadProfileData, ...profile } = useDashboardController({
    text,
    ensureAuthenticated,
    currentUserId,
    currentUserEmail,
    loadPublicPostcards
  });

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void loadProfileData();
  }, [isAuthenticated, loadProfileData]);

  const secondaryLinkClassName =
    'inline-flex items-center justify-center rounded-full border border-[#d6e8d4] bg-[#f8fff7] px-3 py-1.5 text-[0.82rem] font-bold text-[#2f6542] no-underline transition hover:border-[#58ac74] hover:text-[#25563a]';
  const shouldShowPageStatus =
    Boolean(profile.dashboardStatus) && profile.dashboardStatus !== profile.profilePasswordStatus;

  return (
    <article className={`${panelClassName} grid content-start gap-3`}>
      <div className={sectionHeadClassName}>
        <div>
          <h2>{text.profilePageTitle}</h2>
          <small className={smallMutedClassName}>{text.profilePageSubtitle}</small>
        </div>
      </div>

      {!isAuthenticated ? (
        <DashboardAuthCallout text={text} body={text.loginRequiredProfileBody} onSignIn={() => signIn()} />
      ) : (
        <>
          <div className="grid gap-2 rounded-[14px] border border-[#deead9] bg-[linear-gradient(145deg,rgba(244,255,245,0.94),rgba(250,254,255,0.94))] px-3 py-3">
            <strong>{text.profileOverviewTitle}</strong>
            <small className={smallMutedClassName}>
              {profile.isLoadingProfile && !profile.profileAccountId ? text.profilePageLoading : text.profileOverviewBody}
            </small>
            <div className="flex flex-wrap gap-1.5">
              {profile.profileAccountId ? (
                <span className={chipClassName}>{text.profileOverviewAccountId(profile.profileAccountId)}</span>
              ) : null}
              {profile.profileEmail ? <span className={chipClassName}>{profile.profileEmail}</span> : null}
              <span className={chipClassName}>
                {text.profilePasswordStatusLabel}:{' '}
                {profile.profileHasPassword ? text.profilePasswordStatusSet : text.profilePasswordStatusUnset}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard" className={secondaryLinkClassName}>
                {text.profileGoDashboard}
              </Link>
              <Link href="/plant-paths" className={secondaryLinkClassName}>
                {text.profileGoPaths}
              </Link>
            </div>
          </div>

          <DashboardProfilePanel
            text={text}
            showHeader={false}
            profileEmail={profile.profileEmail}
            profileDisplayName={profile.profileDisplayName}
            profileAccountId={profile.profileAccountId}
            profileHasPassword={profile.profileHasPassword}
            profilePassword={profile.profilePassword}
            profilePasswordConfirm={profile.profilePasswordConfirm}
            profilePasswordStatus={profile.profilePasswordStatus}
            profilePasswordStatusTone={profile.profilePasswordStatusTone}
            isLoadingProfile={profile.isLoadingProfile}
            isSavingProfile={profile.isSavingProfile}
            onProfileDisplayNameChange={profile.setProfileDisplayName}
            onProfilePasswordChange={profile.setProfilePassword}
            onProfilePasswordConfirmChange={profile.setProfilePasswordConfirm}
            onSaveProfileDisplayName={() => void profile.saveProfileDisplayName()}
            onSaveProfilePassword={() => void profile.saveProfilePassword()}
          />

          {shouldShowPageStatus ? <small className={smallMutedClassName}>{profile.dashboardStatus}</small> : null}
        </>
      )}
    </article>
  );
}
