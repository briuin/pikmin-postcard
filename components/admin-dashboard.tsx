'use client';

import { UserRole } from '@prisma/client';
import { useMemo } from 'react';
import { signIn, useSession } from '@/lib/auth-client';
import { AdminFeedbackPanel } from '@/components/admin-dashboard-view/feedback-panel';
import { AdminPostcardsPanel } from '@/components/admin-dashboard-view/postcards-panel';
import { AdminSearchControls } from '@/components/admin-dashboard-view/search-controls';
import {
  fallbackPanelClassName,
  mutedTextClassName,
  shellClassName
} from '@/components/admin-dashboard-view/styles';
import { AdminTabToolbar } from '@/components/admin-dashboard-view/tab-toolbar';
import type { VisibleAdminTab } from '@/components/admin-dashboard-view/types';
import { AdminUsersPanel } from '@/components/admin-dashboard-view/users-panel';
import { isManagerOrAbove } from '@/components/admin-dashboard-types';
import { useAdminDashboardController } from '@/components/admin/use-admin-dashboard-controller';
import type { Locale } from '@/lib/i18n';
import { messages } from '@/lib/i18n';

type AdminDashboardProps = {
  locale: Locale;
};

export function AdminDashboard({ locale }: AdminDashboardProps) {
  const { data: session, status } = useSession();
  const text = messages[locale].admin;
  const parseText = messages[locale].workbench;
  const dateLocale: 'zh-TW' | 'en-US' = locale === 'zh-TW' ? 'zh-TW' : 'en-US';

  const userRole = ((session?.user as { role?: UserRole } | undefined)?.role ?? undefined) as
    | UserRole
    | undefined;
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const currentUserEmail = session?.user?.email ?? null;
  const isAuthenticated = status === 'authenticated';
  const canAccess = isManagerOrAbove(userRole);
  const canManageUsers = userRole === UserRole.ADMIN;

  const {
    activeTab,
    setActiveTab,
    users,
    allPostcards,
    reportedPostcards,
    feedbacks,
    userAccessDrafts,
    setUserAccessDrafts,
    postcardDrafts,
    setPostcardDrafts,
    reportStatusDrafts,
    setReportStatusDrafts,
    searchText,
    setSearchText,
    userSearchText,
    setUserSearchText,
    userRoleFilter,
    setUserRoleFilter,
    isLoadingUsers,
    isLoadingPostcards,
    isLoadingFeedbacks,
    savingUserAccessId,
    savingPostcardId,
    savingReportCaseId,
    statusText,
    refreshAll,
    saveUserAccess,
    savePostcard,
    saveReportedPostcardStatus
  } = useAdminDashboardController({
    text,
    parseText,
    isAuthenticated,
    canAccess,
    canManageUsers,
    currentUserId,
    currentUserEmail
  });

  const visibleTabs = useMemo<VisibleAdminTab[]>(() => {
    const tabs: VisibleAdminTab[] = [
      { key: 'postcards', label: text.tabPostcards },
      { key: 'reported', label: text.tabReported },
      { key: 'feedback', label: text.tabFeedback }
    ];

    if (canManageUsers) {
      tabs.unshift({ key: 'users', label: text.tabUsers });
    }
    return tabs;
  }, [canManageUsers, text.tabFeedback, text.tabPostcards, text.tabReported, text.tabUsers]);

  if (status === 'loading') {
    return (
      <section className={fallbackPanelClassName}>
        <h2>{text.title}</h2>
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className={fallbackPanelClassName}>
        <h2>{text.title}</h2>
        <small className={mutedTextClassName}>{text.authRequired}</small>
        <button
          type="button"
          className="w-fit rounded-[12px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-4 py-2 font-bold text-white"
          onClick={() => signIn('google')}
        >
          {messages[locale].workbench.buttonSignInGoogle}
        </button>
      </section>
    );
  }

  if (!canAccess) {
    return (
      <section className={fallbackPanelClassName}>
        <h2>{text.title}</h2>
        <small className={mutedTextClassName}>{text.forbidden}</small>
      </section>
    );
  }

  const cardsToRender = activeTab === 'reported' ? reportedPostcards : allPostcards;

  return (
    <section className={shellClassName}>
      <div className="grid gap-1">
        <h2>{text.title}</h2>
        <small className={mutedTextClassName}>{text.subtitle}</small>
        <small className={mutedTextClassName}>{text.roleBadge(userRole ?? UserRole.MEMBER)}</small>
      </div>

      <AdminTabToolbar
        activeTab={activeTab}
        visibleTabs={visibleTabs}
        text={text}
        isLoadingUsers={isLoadingUsers}
        isLoadingPostcards={isLoadingPostcards}
        onChangeTab={setActiveTab}
        onRefresh={() => void refreshAll()}
      />

      <AdminSearchControls
        text={text}
        activeTab={activeTab}
        userSearchText={userSearchText}
        userRoleFilter={userRoleFilter}
        searchText={searchText}
        onUserSearchChange={setUserSearchText}
        onUserRoleFilterChange={setUserRoleFilter}
        onSearchTextChange={setSearchText}
      />

      {statusText ? <small className={mutedTextClassName}>{statusText}</small> : null}

      {activeTab === 'users' ? (
        <AdminUsersPanel
          text={text}
          users={users}
          userAccessDrafts={userAccessDrafts}
          setUserAccessDrafts={setUserAccessDrafts}
          isLoadingUsers={isLoadingUsers}
          savingUserAccessId={savingUserAccessId}
          onSaveUserAccess={(user) => void saveUserAccess(user)}
          dateLocale={dateLocale}
        />
      ) : null}

      {activeTab === 'feedback' ? (
        <AdminFeedbackPanel
          text={text}
          feedbacks={feedbacks}
          isLoadingFeedbacks={isLoadingFeedbacks}
          dateLocale={dateLocale}
        />
      ) : null}

      {activeTab !== 'users' && activeTab !== 'feedback' ? (
        <AdminPostcardsPanel
          text={text}
          workbenchText={parseText}
          activeTab={activeTab}
          postcards={cardsToRender}
          postcardDrafts={postcardDrafts}
          setPostcardDrafts={setPostcardDrafts}
          reportStatusDrafts={reportStatusDrafts}
          setReportStatusDrafts={setReportStatusDrafts}
          isLoadingPostcards={isLoadingPostcards}
          savingPostcardId={savingPostcardId}
          savingReportCaseId={savingReportCaseId}
          onSavePostcard={(postcard) => void savePostcard(postcard)}
          onSaveReportedStatus={(postcard) => void saveReportedPostcardStatus(postcard)}
          dateLocale={dateLocale}
        />
      ) : null}
    </section>
  );
}
