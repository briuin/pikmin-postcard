'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { signIn, useSession } from '@/lib/auth-client';
import { UserRole } from '@/lib/domain/enums';
import { usePersistedLocale } from '@/components/use-persisted-locale';
import { messages, type AdminText } from '@/lib/i18n';
import { parseJsonResponseOrThrow } from '@/lib/http-response';
import { getReportReasonLabel, getReportStatusLabel } from '@/lib/postcards/report-label';
import { apiFetch } from '@/lib/client-api';

type AdminReportDetailPageProps = {
  caseId: string;
};

type ReportDetailRecord = {
  caseId: string;
  postcardId: string;
  version: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'VERIFIED' | 'REMOVED';
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  postcard: {
    id: string;
    title: string;
    imageUrl: string | null;
    placeName: string | null;
    deletedAt: string | null;
    wrongLocationReports: number;
    reportVersion: number;
    uploaderName: string;
  };
  reportCount: number;
  reasonCounts: Record<string, number>;
  reports: Array<{
    id: string;
    reason: 'WRONG_LOCATION' | 'SPAM' | 'ILLEGAL_IMAGE' | 'OTHER';
    description: string | null;
    createdAt: string;
    reporterName: string;
  }>;
};

function canAccessAdmin(role: UserRole | undefined): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

function reportStatusLabel(text: AdminText, status: ReportDetailRecord['status']): string {
  return getReportStatusLabel(status, {
    pending: text.reportStatusPending,
    inProgress: text.reportStatusInProgress,
    verified: text.reportStatusVerified,
    removed: text.reportStatusRemoved
  });
}

function reportReasonLabel(text: AdminText, reason: ReportDetailRecord['reports'][number]['reason']): string {
  return getReportReasonLabel(reason, {
    wrongLocation: text.reportReasonWrongLocation,
    spam: text.reportReasonSpam,
    illegalImage: text.reportReasonIllegalImage,
    other: text.reportReasonOther
  });
}

export function AdminReportDetailPage({ caseId }: AdminReportDetailPageProps) {
  const { data: session, status } = useSession();
  const { locale } = usePersistedLocale('en');
  const text = messages[locale].admin;
  const dateLocale: 'zh-TW' | 'en-US' = locale === 'zh-TW' ? 'zh-TW' : 'en-US';

  const [record, setRecord] = useState<ReportDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusDraft, setStatusDraft] = useState<ReportDetailRecord['status']>('PENDING');
  const [adminNoteDraft, setAdminNoteDraft] = useState('');
  const [statusText, setStatusText] = useState('');
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const userRole = ((session?.user as { role?: UserRole } | undefined)?.role ?? undefined) as
    | UserRole
    | undefined;
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const currentUserEmail = session?.user?.email ?? null;
  const allowAdmin = canAccessAdmin(userRole);

  const loadRecord = useCallback(async () => {
    if (!allowAdmin) {
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch(
        `/api/admin/reports/${caseId}`,
        { cache: 'no-store' },
        {
          userId: currentUserId,
          userEmail: currentUserEmail
        }
      );
      const payload = await parseJsonResponseOrThrow<ReportDetailRecord>(
        response,
        text.reportedStatusSaveFailed
      );
      setRecord(payload);
      setStatusDraft(payload.status);
      setAdminNoteDraft(payload.adminNote ?? '');
      setStatusText('');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : text.reportedStatusSaveFailed);
    } finally {
      setLoading(false);
    }
  }, [allowAdmin, caseId, currentUserEmail, currentUserId, text.reportedStatusSaveFailed]);

  useEffect(() => {
    if (status !== 'authenticated' || !allowAdmin) {
      return;
    }
    void loadRecord();
  }, [allowAdmin, loadRecord, status]);

  const reasonSummary = useMemo(() => {
    if (!record) {
      return '';
    }
    return Object.entries(record.reasonCounts)
      .map(([reason, count]) => `${reportReasonLabel(text, reason as ReportDetailRecord['reports'][number]['reason'])}: ${count}`)
      .join(' · ');
  }, [record, text]);

  async function saveStatusUpdate() {
    if (!record) {
      return;
    }
    if (statusDraft === 'REMOVED') {
      setShowRemoveConfirm(true);
      return;
    }
    await runSave();
  }

  async function runSave() {
    if (!record) {
      return;
    }
    setSaving(true);
    try {
      const response = await apiFetch(
        `/api/admin/reports/${record.caseId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: statusDraft,
            adminNote: adminNoteDraft
          })
        },
        {
          userId: currentUserId,
          userEmail: currentUserEmail
        }
      );
      await parseJsonResponseOrThrow(response, text.reportedStatusSaveFailed);
      setStatusText(text.reportedStatusSaved);
      await loadRecord();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : text.reportedStatusSaveFailed);
    } finally {
      setSaving(false);
      setShowRemoveConfirm(false);
    }
  }

  if (status === 'loading') {
    return (
      <section className="mx-auto grid w-full max-w-[980px] gap-3 px-3 py-3">
        <article className="grid gap-2 rounded-[18px] border border-[#dbe9d9] bg-[#fbfffb] p-3">
          <strong>{text.reportedTitle}</strong>
        </article>
      </section>
    );
  }

  if (status !== 'authenticated') {
    return (
      <section className="mx-auto grid w-full max-w-[980px] gap-3 px-3 py-3">
        <article className="grid gap-2 rounded-[18px] border border-[#dbe9d9] bg-[#fbfffb] p-3">
          <strong>{text.authRequired}</strong>
          <button
            type="button"
            className="w-fit rounded-[12px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-4 py-2 font-bold text-white"
            onClick={() => signIn()}
          >
            {messages[locale].workbench.buttonSignInGoogle}
          </button>
        </article>
      </section>
    );
  }

  if (!allowAdmin) {
    return (
      <section className="mx-auto grid w-full max-w-[980px] gap-3 px-3 py-3">
        <article className="grid gap-2 rounded-[18px] border border-[#dbe9d9] bg-[#fbfffb] p-3">
          <strong>{text.forbidden}</strong>
        </article>
      </section>
    );
  }

  return (
    <section className="mx-auto grid w-full max-w-[980px] gap-3 px-3 py-3">
      <article className="grid gap-2 rounded-[18px] border border-[#dbe9d9] bg-[#fbfffb] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid gap-1">
            <strong>{text.reportedTitle}</strong>
            <small className="text-[#5f736c]">Case: {caseId}</small>
          </div>
          <Link
            href="/admin"
            className="rounded-[10px] border border-[#d7e6d4] bg-white px-3 py-1.5 text-[0.82rem] font-bold text-[#335548] no-underline"
          >
            {text.reportedBackToList}
          </Link>
        </div>

        {statusText ? <small className="text-[#5f736c]">{statusText}</small> : null}
      </article>

      {loading ? (
        <article className="grid gap-2 rounded-[18px] border border-[#dbe9d9] bg-[#fbfffb] p-3">
          <small className="text-[#5f736c]">{text.postcardsLoading}</small>
        </article>
      ) : null}

      {!loading && record ? (
        <>
          <article className="grid gap-2 rounded-[18px] border border-[#dbe9d9] bg-[#fbfffb] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid gap-1">
                <strong>{record.postcard.title}</strong>
                <small className="text-[#5f736c]">{record.postcard.placeName || '-'}</small>
                <small className="text-[#5f736c]">{text.uploaderLabel(record.postcard.uploaderName)}</small>
              </div>
              <small className="text-[#5f736c]">
                {text.reportedStatusLabel}: {reportStatusLabel(text, record.status)}
              </small>
            </div>
            {record.postcard.imageUrl ? (
              <Image
                src={record.postcard.imageUrl}
                alt={record.postcard.title}
                width={980}
                height={620}
                className="h-auto max-h-[360px] w-full rounded-[12px] border border-[#deeadb] object-cover"
              />
            ) : null}
            <small className="text-[#5f736c]">{text.reportCountLabel(record.reportCount)}</small>
            {reasonSummary ? <small className="text-[#5f736c]">{reasonSummary}</small> : null}
            <small className="text-[#5f736c]">
              {new Date(record.updatedAt).toLocaleString(dateLocale)}
            </small>
          </article>

          <article className="grid gap-2 rounded-[18px] border border-[#dbe9d9] bg-[#fbfffb] p-3">
            <strong>{text.reportedStatusLabel}</strong>
            <label className="grid gap-1 text-[0.86rem] font-bold text-[#39604f]">
              {text.reportedStatusLabel}
              <select
                className="rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-2"
                value={statusDraft}
                onChange={(event) =>
                  setStatusDraft(event.target.value as ReportDetailRecord['status'])
                }
                disabled={saving}
              >
                <option value="PENDING">{text.reportStatusPending}</option>
                <option value="IN_PROGRESS">{text.reportStatusInProgress}</option>
                <option value="VERIFIED">{text.reportStatusVerified}</option>
                <option value="REMOVED">{text.reportStatusRemoved}</option>
              </select>
            </label>
            <label className="grid gap-1 text-[0.86rem] font-bold text-[#39604f]">
              {text.reportedAdminNoteLabel}
              <textarea
                rows={3}
                className="rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-2"
                value={adminNoteDraft}
                onChange={(event) => setAdminNoteDraft(event.target.value)}
                disabled={saving}
              />
            </label>
            <button
              type="button"
              className="w-fit rounded-[10px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-3 py-1.5 text-[0.83rem] font-bold text-white disabled:opacity-60"
              onClick={() => void saveStatusUpdate()}
              disabled={saving}
            >
              {saving ? text.reportedSavingStatus : text.reportedSaveStatus}
            </button>
          </article>

          <article className="grid gap-2 rounded-[18px] border border-[#dbe9d9] bg-[#fbfffb] p-3">
            <strong>{text.reportCountLabel(record.reportCount)}</strong>
            {record.reports.length === 0 ? (
              <small className="text-[#5f736c]">{text.reportedEmpty}</small>
            ) : (
              <div className="grid gap-1.5">
                {record.reports.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-1 rounded-[10px] border border-[#ead8c9] bg-[#fffdf9] px-2.5 py-2"
                  >
                    <small className="text-[#5f736c]">
                      {reportReasonLabel(text, item.reason)} · {item.reporterName}
                    </small>
                    <small className="text-[#5f736c]">
                      {new Date(item.createdAt).toLocaleString(dateLocale)}
                    </small>
                    {item.description ? <small className="text-[#5f736c]">{item.description}</small> : null}
                  </div>
                ))}
              </div>
            )}
          </article>
        </>
      ) : null}

      {showRemoveConfirm ? (
        <div className="fixed inset-0 z-[1300] grid place-items-center bg-[rgba(16,28,22,0.58)] px-3">
          <article className="grid w-full max-w-[440px] gap-2.5 rounded-[16px] border border-[#e7d7c8] bg-[#fffaf4] p-3.5 shadow-[0_16px_32px_rgba(28,32,20,0.26)]">
            <strong className="text-[1.02rem] text-[#5a3e2a]">{text.reportedRemoveConfirmTitle}</strong>
            <small className="text-[#5f736c]">
              {text.reportedRemoveConfirmBody(record?.postcard.title ?? '-')}
            </small>
            <div className="flex flex-wrap justify-end gap-1.5">
              <button
                type="button"
                className="rounded-[10px] border border-[#d7e6d4] bg-white px-3 py-1.5 text-[0.83rem] font-bold text-[#36594a]"
                onClick={() => setShowRemoveConfirm(false)}
                disabled={saving}
              >
                {text.reportedRemoveConfirmNo}
              </button>
              <button
                type="button"
                className="rounded-[10px] border border-[#efccb3] bg-[#fff1e4] px-3 py-1.5 text-[0.83rem] font-bold text-[#8c4f2a] disabled:opacity-60"
                onClick={() => void runSave()}
                disabled={saving}
              >
                {saving ? text.reportedSavingStatus : text.reportedRemoveConfirmYes}
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
