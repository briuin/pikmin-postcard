'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminText, WorkbenchText } from '@/lib/i18n';
import { UserRole } from '@/lib/domain/enums';
import {
  type AdminFeedbackRecord,
  type AdminPostcardEditDraft,
  type AdminReportStatusDraft,
  type AdminTabKey,
  type AdminUserRecord,
  type UserAccessDraft,
  buildAdminPostcardDraft,
  buildAdminReportStatusDraft,
  buildUserAccessDraft
} from '@/components/admin-dashboard-types';
import { parseLocationInput } from '@/components/workbench/utils';
import type { PostcardRecord } from '@/components/workbench/types';
import {
  getErrorMessageFromPayload,
  parseJsonPayload,
  parseJsonResponseOrThrow
} from '@/lib/http-response';
import { apiFetch } from '@/lib/client-api';

type UseAdminDashboardControllerArgs = {
  text: AdminText;
  parseText: WorkbenchText;
  isAuthenticated: boolean;
  canAccess: boolean;
  canManageUsers: boolean;
  currentUserId: string | null;
  currentUserEmail: string | null;
};

export function useAdminDashboardController({
  text,
  parseText,
  isAuthenticated,
  canAccess,
  canManageUsers,
  currentUserId,
  currentUserEmail
}: UseAdminDashboardControllerArgs) {
  const [activeTab, setActiveTab] = useState<AdminTabKey>('postcards');
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [allPostcards, setAllPostcards] = useState<PostcardRecord[]>([]);
  const [reportedPostcards, setReportedPostcards] = useState<PostcardRecord[]>([]);
  const [feedbacks, setFeedbacks] = useState<AdminFeedbackRecord[]>([]);
  const [userAccessDrafts, setUserAccessDrafts] = useState<Record<string, UserAccessDraft>>({});
  const [postcardDrafts, setPostcardDrafts] = useState<Record<string, AdminPostcardEditDraft>>({});
  const [reportStatusDrafts, setReportStatusDrafts] = useState<Record<string, AdminReportStatusDraft>>({});
  const [searchText, setSearchText] = useState('');
  const [userSearchText, setUserSearchText] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingPostcards, setIsLoadingPostcards] = useState(false);
  const [isLoadingFeedbacks, setIsLoadingFeedbacks] = useState(false);
  const [savingUserAccessId, setSavingUserAccessId] = useState<string | null>(null);
  const [savingPostcardId, setSavingPostcardId] = useState<string | null>(null);
  const [savingReportCaseId, setSavingReportCaseId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    if (!canManageUsers && activeTab === 'users') {
      setActiveTab('postcards');
    }
  }, [activeTab, canManageUsers]);

  const loadUsers = useCallback(async () => {
    if (!canManageUsers) {
      setUsers([]);
      return;
    }

    setIsLoadingUsers(true);
    try {
      const url = new URL('/api/admin/users', window.location.origin);
      if (userSearchText.trim().length > 0) {
        url.searchParams.set('q', userSearchText.trim());
      }
      if (userRoleFilter !== 'ALL') {
        url.searchParams.set('role', userRoleFilter);
      }
      url.searchParams.set('limit', '500');
      const response = await apiFetch(
        `${url.pathname}${url.search}`,
        { cache: 'no-store' },
        {
          userId: currentUserId,
          userEmail: currentUserEmail
        }
      );
      const payload = await parseJsonPayload(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(getErrorMessageFromPayload(payload) ?? text.roleSaveFailed);
      }

      setUsers(payload as AdminUserRecord[]);
      setUserAccessDrafts((current) => {
        const next = { ...current };
        for (const user of payload as AdminUserRecord[]) {
          next[user.id] = buildUserAccessDraft(user);
        }
        return next;
      });
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : text.roleSaveFailed);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [
    canManageUsers,
    currentUserEmail,
    currentUserId,
    text.roleSaveFailed,
    userRoleFilter,
    userSearchText
  ]);

  const loadFeedbacks = useCallback(async () => {
    if (!canAccess) {
      return;
    }

    setIsLoadingFeedbacks(true);
    try {
      const url = new URL('/api/admin/feedback', window.location.origin);
      if (searchText.trim().length > 0) {
        url.searchParams.set('q', searchText.trim());
      }
      url.searchParams.set('limit', '300');
      const response = await apiFetch(
        `${url.pathname}${url.search}`,
        { cache: 'no-store' },
        {
          userId: currentUserId,
          userEmail: currentUserEmail
        }
      );
      const payload = await parseJsonPayload(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(getErrorMessageFromPayload(payload) ?? text.feedbackEmpty);
      }

      setFeedbacks(payload as AdminFeedbackRecord[]);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : text.feedbackEmpty);
    } finally {
      setIsLoadingFeedbacks(false);
    }
  }, [canAccess, currentUserEmail, currentUserId, searchText, text.feedbackEmpty]);

  const loadPostcards = useCallback(
    async (reportedOnly: boolean) => {
      if (!canAccess) {
        return;
      }

      setIsLoadingPostcards(true);
      try {
        const url = new URL('/api/admin/postcards', window.location.origin);
        if (reportedOnly) {
          url.searchParams.set('reportedOnly', '1');
        }
        if (searchText.trim().length > 0) {
          url.searchParams.set('q', searchText.trim());
        }
        url.searchParams.set('limit', '260');

        const response = await apiFetch(
          `${url.pathname}${url.search}`,
          { cache: 'no-store' },
          {
            userId: currentUserId,
            userEmail: currentUserEmail
          }
        );
        const payload = await parseJsonPayload(response);
        if (!response.ok || !Array.isArray(payload)) {
          throw new Error(getErrorMessageFromPayload(payload) ?? text.savePostcardFailed);
        }
        const postcards = payload as PostcardRecord[];

        if (reportedOnly) {
          setReportedPostcards(postcards);
        } else {
          setAllPostcards(postcards);
        }

        setPostcardDrafts((current) => {
          const next = { ...current };
          for (const postcard of postcards) {
            next[postcard.id] = buildAdminPostcardDraft(postcard);
          }
          return next;
        });

        if (reportedOnly) {
          setReportStatusDrafts((current) => {
            const next = { ...current };
            for (const postcard of postcards) {
              if (!postcard.activeReportCaseId) {
                continue;
              }
              next[postcard.id] = buildAdminReportStatusDraft(postcard);
            }
            return next;
          });
        }
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : text.savePostcardFailed);
      } finally {
        setIsLoadingPostcards(false);
      }
    },
    [canAccess, currentUserEmail, currentUserId, searchText, text.savePostcardFailed]
  );

  const refreshAll = useCallback(async () => {
    setStatusText('');
    await Promise.all([loadUsers(), loadPostcards(false), loadPostcards(true), loadFeedbacks()]);
  }, [loadFeedbacks, loadPostcards, loadUsers]);

  useEffect(() => {
    if (!isAuthenticated || !canAccess) {
      return;
    }

    void refreshAll();
  }, [isAuthenticated, canAccess, refreshAll]);

  useEffect(() => {
    if (!isAuthenticated || !canManageUsers || activeTab !== 'users') {
      return;
    }

    const timer = setTimeout(() => {
      void loadUsers();
    }, 180);

    return () => clearTimeout(timer);
  }, [activeTab, canManageUsers, isAuthenticated, loadUsers, userRoleFilter, userSearchText]);

  const saveUserAccess = useCallback(
    async (user: AdminUserRecord) => {
      const draft = userAccessDrafts[user.id] ?? buildUserAccessDraft(user);
      setSavingUserAccessId(user.id);
      setStatusText('');
      try {
        const response = await apiFetch(
          '/api/admin/users',
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              role: draft.role,
              approvalStatus: draft.approvalStatus,
              canCreatePostcard: draft.canCreatePostcard,
              canSubmitDetection: draft.canSubmitDetection,
              canVote: draft.canVote
            })
          },
          {
            userId: currentUserId,
            userEmail: currentUserEmail
          }
        );
        await parseJsonResponseOrThrow(response, text.roleSaveFailed);

        setStatusText(text.roleSaved);
        await loadUsers();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : text.roleSaveFailed);
      } finally {
        setSavingUserAccessId(null);
      }
    },
    [currentUserEmail, currentUserId, loadUsers, text.roleSaveFailed, text.roleSaved, userAccessDrafts]
  );

  const savePostcard = useCallback(
    async (postcard: PostcardRecord) => {
      const draft = postcardDrafts[postcard.id] ?? buildAdminPostcardDraft(postcard);
      setSavingPostcardId(postcard.id);
      setStatusText('');

      try {
        const parsed = parseLocationInput(draft.locationInput, parseText);
        const response = await apiFetch(
          `/api/postcards/${postcard.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: draft.title,
              postcardType: draft.postcardType,
              notes: draft.notes,
              placeName: draft.placeName,
              latitude: parsed.latitude,
              longitude: parsed.longitude
            })
          },
          {
            userId: currentUserId,
            userEmail: currentUserEmail
          }
        );
        await parseJsonResponseOrThrow(response, text.savePostcardFailed);

        setStatusText(text.savePostcardDone);
        await Promise.all([loadPostcards(false), loadPostcards(true)]);
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : text.savePostcardFailed);
      } finally {
        setSavingPostcardId(null);
      }
    },
    [
      currentUserEmail,
      currentUserId,
      loadPostcards,
      parseText,
      postcardDrafts,
      text.savePostcardDone,
      text.savePostcardFailed
    ]
  );

  const saveReportedPostcardStatus = useCallback(
    async (postcard: PostcardRecord) => {
      if (!postcard.activeReportCaseId) {
        return;
      }

      const draft = reportStatusDrafts[postcard.id] ?? buildAdminReportStatusDraft(postcard);
      setSavingReportCaseId(postcard.activeReportCaseId);
      setStatusText('');

      try {
        const response = await apiFetch(
          '/api/admin/reports',
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caseId: postcard.activeReportCaseId,
              status: draft.status,
              adminNote: draft.adminNote
            })
          },
          {
            userId: currentUserId,
            userEmail: currentUserEmail
          }
        );
        await parseJsonResponseOrThrow(response, text.reportedStatusSaveFailed);

        setStatusText(text.reportedStatusSaved);
        await Promise.all([loadPostcards(false), loadPostcards(true)]);
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : text.reportedStatusSaveFailed);
      } finally {
        setSavingReportCaseId(null);
      }
    },
    [
      currentUserEmail,
      currentUserId,
      loadPostcards,
      reportStatusDrafts,
      text.reportedStatusSaveFailed,
      text.reportedStatusSaved
    ]
  );

  return {
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
  };
}
