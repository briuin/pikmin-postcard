'use client';

import { UserRole } from '@prisma/client';
import Image from 'next/image';
import { signIn, useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import { messages } from '@/lib/i18n';
import { parseLocationInput } from '@/components/workbench/utils';
import type { PostcardRecord } from '@/components/workbench/types';

type AdminDashboardProps = {
  locale: Locale;
};

type AdminUserRecord = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
  postcardCount: number;
};

type PostcardEditDraft = {
  title: string;
  notes: string;
  placeName: string;
  locationInput: string;
};

type AdminFeedbackRecord = {
  id: string;
  subject: string;
  message: string;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  userEmail: string;
  userDisplayName: string | null;
};

type TabKey = 'users' | 'postcards' | 'reported' | 'feedback';

function buildPostcardDraft(postcard: PostcardRecord): PostcardEditDraft {
  return {
    title: postcard.title ?? '',
    notes: postcard.notes ?? '',
    placeName: postcard.placeName ?? '',
    locationInput:
      typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number'
        ? `${postcard.latitude.toFixed(6)}, ${postcard.longitude.toFixed(6)}`
        : ''
  };
}

function isManagerOrAbove(role: UserRole | undefined): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export function AdminDashboard({ locale }: AdminDashboardProps) {
  const { data: session, status } = useSession();
  const text = messages[locale].admin;
  const parseText = messages[locale].workbench;

  const userRole = ((session?.user as { role?: UserRole } | undefined)?.role ?? undefined) as
    | UserRole
    | undefined;
  const isAuthenticated = status === 'authenticated';
  const canAccess = isManagerOrAbove(userRole);
  const canManageUsers = userRole === UserRole.ADMIN;

  const [activeTab, setActiveTab] = useState<TabKey>('postcards');
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [allPostcards, setAllPostcards] = useState<PostcardRecord[]>([]);
  const [reportedPostcards, setReportedPostcards] = useState<PostcardRecord[]>([]);
  const [feedbacks, setFeedbacks] = useState<AdminFeedbackRecord[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, UserRole>>({});
  const [postcardDrafts, setPostcardDrafts] = useState<Record<string, PostcardEditDraft>>({});
  const [searchText, setSearchText] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingPostcards, setIsLoadingPostcards] = useState(false);
  const [isLoadingFeedbacks, setIsLoadingFeedbacks] = useState(false);
  const [savingRoleUserId, setSavingRoleUserId] = useState<string | null>(null);
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
      const response = await fetch('/api/admin/users', { cache: 'no-store' });
      const payload = (await response.json()) as AdminUserRecord[] | { error?: string };
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error((payload as { error?: string }).error ?? text.roleSaveFailed);
      }

      setUsers(payload);
      setRoleDrafts((current) => {
        const next = { ...current };
        for (const user of payload) {
          next[user.id] = user.role;
        }
        return next;
      });
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : text.roleSaveFailed);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [canManageUsers, text.roleSaveFailed]);

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
            next[postcard.id] = buildPostcardDraft(postcard);
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

  async function saveUserRole(user: AdminUserRecord) {
    const nextRole = roleDrafts[user.id] ?? user.role;
    setSavingRoleUserId(user.id);
    setStatusText('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          role: nextRole
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
      setSavingRoleUserId(null);
    }
  }

  async function savePostcard(postcard: PostcardRecord) {
    const draft = postcardDrafts[postcard.id] ?? buildPostcardDraft(postcard);
    setSavingPostcardId(postcard.id);
    setStatusText('');

    try {
      const parsed = parseLocationInput(draft.locationInput, parseText);
      const response = await fetch(`/api/postcards/${postcard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title,
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
  }

  const visibleTabs = useMemo(() => {
    const tabs: Array<{ key: TabKey; label: string }> = [
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
      <section className="grid gap-2 rounded-[20px] border border-[#d8e8d8] bg-white/80 p-4">
        <h2>{text.title}</h2>
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className="grid gap-2 rounded-[20px] border border-[#d8e8d8] bg-white/80 p-4">
        <h2>{text.title}</h2>
        <small className="text-[#5f736c]">{text.authRequired}</small>
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
      <section className="grid gap-2 rounded-[20px] border border-[#d8e8d8] bg-white/80 p-4">
        <h2>{text.title}</h2>
        <small className="text-[#5f736c]">{text.forbidden}</small>
      </section>
    );
  }

  const cardsToRender = activeTab === 'reported' ? reportedPostcards : allPostcards;

  return (
    <section className="grid gap-3 rounded-[22px] border border-white/60 bg-[linear-gradient(165deg,rgba(255,255,255,0.96),rgba(245,255,246,0.92))] p-3 shadow-[0_16px_34px_rgba(57,78,66,0.1),inset_0_1px_0_rgba(255,255,255,0.9)]">
      <div className="grid gap-1">
        <h2>{text.title}</h2>
        <small className="text-[#5f736c]">{text.subtitle}</small>
        <small className="text-[#5f736c]">{text.roleBadge(userRole ?? UserRole.MEMBER)}</small>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-[#deead9] bg-[linear-gradient(140deg,rgba(244,255,245,0.95),rgba(247,254,255,0.92))] px-2.5 py-2">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={
              activeTab === tab.key
                ? 'rounded-full border border-[#83c797] bg-[linear-gradient(135deg,#56b36a,#359d59)] px-3 py-1.5 text-[0.82rem] font-bold text-white shadow-[0_6px_12px_rgba(47,158,88,0.22)]'
                : 'rounded-full border border-[#d6e8d4] bg-[#f4fff4] px-3 py-1.5 text-[0.82rem] font-bold text-[#2b6442]'
            }
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          className="ml-auto rounded-[10px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-2.5 py-1.5 text-[0.83rem] font-bold text-white"
          onClick={() => void refreshAll()}
          disabled={isLoadingUsers || isLoadingPostcards}
        >
          {text.buttonRefresh}
        </button>
      </div>

      <label className="grid gap-1 text-[0.91rem] font-bold text-[#39604f]">
        {text.searchLabel}
        <input
          className="w-full rounded-[13px] border border-[#d8e6d5] bg-[#fdfffc] px-3 py-2 text-[#1f2e29] outline-none transition focus:border-[#72b485] focus:ring-4 focus:ring-[rgba(86,179,106,0.18)]"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder={text.searchPlaceholder}
        />
      </label>

      {statusText ? <small className="text-[#5f736c]">{statusText}</small> : null}

      {activeTab === 'users' ? (
        <div className="grid gap-2">
          <strong>{text.usersTitle}</strong>
          <small className="text-[#5f736c]">{text.usersHint}</small>
          {isLoadingUsers ? <small className="text-[#5f736c]">{text.usersLoading}</small> : null}
          {!isLoadingUsers && users.length === 0 ? <small className="text-[#5f736c]">{text.usersEmpty}</small> : null}

          <div className="grid gap-2">
            {users.map((user) => (
              <article key={user.id} className="grid gap-1.5 rounded-[14px] border border-[#e2eee0] bg-[#f8fffc] px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{user.displayName?.trim() || user.email}</strong>
                  <small className="text-[#5f736c]">{user.email}</small>
                </div>
                <small className="text-[#5f736c]">
                  {new Date(user.createdAt).toLocaleDateString(locale === 'zh-TW' ? 'zh-TW' : 'en-US')} · {user.postcardCount} postcards
                </small>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="grid gap-1 text-[0.86rem] font-bold text-[#39604f]">
                    {text.userRoleLabel}
                    <select
                      className="rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-1.5"
                      value={roleDrafts[user.id] ?? user.role}
                      onChange={(event) =>
                        setRoleDrafts((current) => ({
                          ...current,
                          [user.id]: event.target.value as UserRole
                        }))
                      }
                    >
                      <option value={UserRole.ADMIN}>ADMIN</option>
                      <option value={UserRole.MANAGER}>MANAGER</option>
                      <option value={UserRole.MEMBER}>MEMBER</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="rounded-[10px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-3 py-1.5 text-[0.83rem] font-bold text-white disabled:opacity-60"
                    disabled={savingRoleUserId === user.id}
                    onClick={() => void saveUserRole(user)}
                  >
                    {savingRoleUserId === user.id ? text.savingRole : text.saveRole}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === 'feedback' ? (
        <div className="grid gap-2">
          <strong>{text.feedbackTitle}</strong>
          {isLoadingFeedbacks ? <small className="text-[#5f736c]">{text.feedbackLoading}</small> : null}
          {!isLoadingFeedbacks && feedbacks.length === 0 ? <small className="text-[#5f736c]">{text.feedbackEmpty}</small> : null}

          <div className="grid gap-2">
            {feedbacks.map((item) => (
              <article key={item.id} className="grid gap-1.5 rounded-[14px] border border-[#e2eee0] bg-[#f8fffc] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <strong>{item.subject}</strong>
                  <small className="text-[#5f736c]">
                    {item.status === 'OPEN' ? text.feedbackStatusOpen : text.feedbackStatusClosed}
                  </small>
                </div>
                <small className="text-[#5f736c]">
                  {(item.userDisplayName?.trim() || item.userEmail)} · {new Date(item.createdAt).toLocaleString(locale === 'zh-TW' ? 'zh-TW' : 'en-US')}
                </small>
                <p className="m-0 whitespace-pre-wrap break-words rounded-[10px] border border-[#deeadb] bg-white px-2.5 py-2 text-[0.9rem] text-[#294136]">
                  {item.message}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab !== 'users' && activeTab !== 'feedback' ? (
        <div className="grid gap-2">
          <strong>{activeTab === 'reported' ? text.reportedTitle : text.postcardsTitle}</strong>
          {isLoadingPostcards ? <small className="text-[#5f736c]">{text.postcardsLoading}</small> : null}
          {!isLoadingPostcards && cardsToRender.length === 0 ? (
            <small className="text-[#5f736c]">{activeTab === 'reported' ? text.reportedEmpty : text.postcardsEmpty}</small>
          ) : null}

          <div className="grid gap-2 max-[960px]:grid-cols-1 min-[961px]:grid-cols-2">
            {cardsToRender.map((postcard) => {
              const draft = postcardDrafts[postcard.id] ?? buildPostcardDraft(postcard);
              return (
                <article key={postcard.id} className="grid gap-1.5 rounded-[14px] border border-[#e2eee0] bg-[#f8fffc] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <small className="text-[#5f736c]">{new Date(postcard.createdAt).toLocaleString(locale === 'zh-TW' ? 'zh-TW' : 'en-US')}</small>
                    <small className="text-[#5f736c]">⚠️ {postcard.wrongLocationReports}</small>
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
                  <small className="text-[#5f736c]">{text.uploaderLabel(postcard.uploaderName ?? 'unknown')}</small>
                  <label className="grid gap-1 text-[0.86rem] font-bold text-[#39604f]">
                    {text.fieldTitle}
                    <input
                      className="rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-1.5"
                      value={draft.title}
                      onChange={(event) =>
                        setPostcardDrafts((current) => ({
                          ...current,
                          [postcard.id]: {
                            ...draft,
                            title: event.target.value
                          }
                        }))
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-[0.86rem] font-bold text-[#39604f]">
                    {text.fieldPlaceName}
                    <input
                      className="rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-1.5"
                      value={draft.placeName}
                      onChange={(event) =>
                        setPostcardDrafts((current) => ({
                          ...current,
                          [postcard.id]: {
                            ...draft,
                            placeName: event.target.value
                          }
                        }))
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-[0.86rem] font-bold text-[#39604f]">
                    {text.fieldDescription}
                    <textarea
                      className="rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-1.5"
                      rows={3}
                      value={draft.notes}
                      onChange={(event) =>
                        setPostcardDrafts((current) => ({
                          ...current,
                          [postcard.id]: {
                            ...draft,
                            notes: event.target.value
                          }
                        }))
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-[0.86rem] font-bold text-[#39604f]">
                    {text.fieldLocation}
                    <input
                      className="rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-1.5"
                      value={draft.locationInput}
                      onChange={(event) =>
                        setPostcardDrafts((current) => ({
                          ...current,
                          [postcard.id]: {
                            ...draft,
                            locationInput: event.target.value
                          }
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded-[10px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-3 py-1.5 text-[0.83rem] font-bold text-white disabled:opacity-60"
                    disabled={savingPostcardId === postcard.id}
                    onClick={() => void savePostcard(postcard)}
                  >
                    {savingPostcardId === postcard.id ? text.savingPostcard : text.savePostcard}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
