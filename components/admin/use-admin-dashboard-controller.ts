'use client';

import { UserRole } from '@prisma/client';
import { useCallback, useEffect, useState } from 'react';
import type { AdminText, WorkbenchText } from '@/lib/i18n';
import {
  type AdminFeedbackRecord,
  type AdminPostcardEditDraft,
  type AdminTabKey,
  type AdminUserRecord,
  type UserAccessDraft,
  buildAdminPostcardDraft,
  buildUserAccessDraft
} from '@/components/admin-dashboard-types';
import { parseLocationInput } from '@/components/workbench/utils';
import type { PostcardRecord } from '@/components/workbench/types';

type UseAdminDashboardControllerArgs = {
  text: AdminText;
  parseText: WorkbenchText;
  isAuthenticated: boolean;
  canAccess: boolean;
  canManageUsers: boolean;
};

export function useAdminDashboardController({
  text,
  parseText,
  isAuthenticated,
  canAccess,
  canManageUsers
}: UseAdminDashboardControllerArgs) {
  const [activeTab, setActiveTab] = useState<AdminTabKey>('postcards');
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [allPostcards, setAllPostcards] = useState<PostcardRecord[]>([]);
  const [reportedPostcards, setReportedPostcards] = useState<PostcardRecord[]>([]);
  const [feedbacks, setFeedbacks] = useState<AdminFeedbackRecord[]>([]);
  const [userAccessDrafts, setUserAccessDrafts] = useState<Record<string, UserAccessDraft>>({});
  const [postcardDrafts, setPostcardDrafts] = useState<Record<string, AdminPostcardEditDraft>>({});
  const [searchText, setSearchText] = useState('');
  const [userSearchText, setUserSearchText] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingPostcards, setIsLoadingPostcards] = useState(false);
  const [isLoadingFeedbacks, setIsLoadingFeedbacks] = useState(false);
  const [savingUserAccessId, setSavingUserAccessId] = useState<string | null>(null);
  const [savingPostcardId, setSavingPostcardId] = useState<string | null>(null);
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
      const response = await fetch(url.toString(), { cache: 'no-store' });
      const payload = (await response.json()) as AdminUserRecord[] | { error?: string };
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error((payload as { error?: string }).error ?? text.roleSaveFailed);
      }

      setUsers(payload);
      setUserAccessDrafts((current) => {
        const next = { ...current };
        for (const user of payload) {
          next[user.id] = buildUserAccessDraft(user);
        }
        return next;
      });
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : text.roleSaveFailed);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [canManageUsers, text.roleSaveFailed, userRoleFilter, userSearchText]);

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
      const response = await fetch(url.toString(), { cache: 'no-store' });
      const payload = (await response.json()) as AdminFeedbackRecord[] | { error?: string };
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error((payload as { error?: string }).error ?? text.feedbackEmpty);
      }

      setFeedbacks(payload);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : text.feedbackEmpty);
    } finally {
      setIsLoadingFeedbacks(false);
    }
  }, [canAccess, searchText, text.feedbackEmpty]);

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

        const response = await fetch(url.toString(), { cache: 'no-store' });
        const payload = (await response.json()) as PostcardRecord[] | { error?: string };
        if (!response.ok || !Array.isArray(payload)) {
          throw new Error((payload as { error?: string }).error ?? text.savePostcardFailed);
        }

        if (reportedOnly) {
          setReportedPostcards(payload);
        } else {
          setAllPostcards(payload);
        }

        setPostcardDrafts((current) => {
          const next = { ...current };
          for (const postcard of payload) {
            next[postcard.id] = buildAdminPostcardDraft(postcard);
          }
          return next;
        });
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : text.savePostcardFailed);
      } finally {
        setIsLoadingPostcards(false);
      }
    },
    [canAccess, searchText, text.savePostcardFailed]
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
        const response = await fetch('/api/admin/users', {
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
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? text.roleSaveFailed);
        }

        setStatusText(text.roleSaved);
        await loadUsers();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : text.roleSaveFailed);
      } finally {
        setSavingUserAccessId(null);
      }
    },
    [loadUsers, text.roleSaveFailed, text.roleSaved, userAccessDrafts]
  );

  const savePostcard = useCallback(
    async (postcard: PostcardRecord) => {
      const draft = postcardDrafts[postcard.id] ?? buildAdminPostcardDraft(postcard);
      setSavingPostcardId(postcard.id);
      setStatusText('');

      try {
        const parsed = parseLocationInput(draft.locationInput, parseText);
        const response = await fetch(`/api/postcards/${postcard.id}`, {
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
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? text.savePostcardFailed);
        }

        setStatusText(text.savePostcardDone);
        await Promise.all([loadPostcards(false), loadPostcards(true)]);
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : text.savePostcardFailed);
      } finally {
        setSavingPostcardId(null);
      }
    },
    [loadPostcards, parseText, postcardDrafts, text.savePostcardDone, text.savePostcardFailed]
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
    statusText,
    refreshAll,
    saveUserAccess,
    savePostcard
  };
}
