'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { WorkbenchText } from '@/lib/i18n';
import type { DashboardReportRecord } from '@/components/workbench/types';
import { smallMutedClassName } from '@/components/workbench/dashboard-view/styles';
import { getReportReasonLabel, getReportStatusLabel } from '@/lib/postcards/report-label';

type DashboardReportsListProps = {
  text: WorkbenchText;
  reports: DashboardReportRecord[];
  isLoadingReports: boolean;
  dashboardListClassName: string;
  cancelingReportId: string | null;
  onCancelReport: (report: DashboardReportRecord) => void;
};

function reportReasonLabel(text: WorkbenchText, reason: DashboardReportRecord['reportReason']): string {
  return getReportReasonLabel(reason, {
    wrongLocation: text.exploreReportReasonWrongLocation,
    spam: text.exploreReportReasonSpam,
    illegalImage: text.exploreReportReasonIllegalImage,
    other: text.exploreReportReasonOther
  });
}

function reportStatusLabel(text: WorkbenchText, status: DashboardReportRecord['status']): string {
  return getReportStatusLabel(status, {
    pending: text.reportStatusPending,
    inProgress: text.reportStatusInProgress,
    verified: text.reportStatusVerified,
    removed: text.reportStatusRemoved
  });
}

export function DashboardReportsList({
  text,
  reports,
  isLoadingReports,
  dashboardListClassName,
  cancelingReportId,
  onCancelReport
}: DashboardReportsListProps) {
  const [confirmReportId, setConfirmReportId] = useState<string | null>(null);
  const pendingConfirmReport =
    confirmReportId ? reports.find((item) => item.reportId === confirmReportId) ?? null : null;

  return (
    <>
      <h3 className="mt-1">{text.dashboardReportsTitle}</h3>
      {isLoadingReports ? (
        <small className={smallMutedClassName}>{text.dashboardReportsLoading}</small>
      ) : null}
      {!isLoadingReports && reports.length === 0 ? (
        <small className={smallMutedClassName}>{text.dashboardReportsEmpty}</small>
      ) : null}
      <div className={dashboardListClassName}>
        {reports.map((report) => (
          <article
            key={report.reportId}
            className="grid gap-1.5 rounded-[14px] border border-[#e2eee0] bg-[#f8fffc] px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <strong className="min-w-0 [overflow-wrap:anywhere] text-[0.98rem]">
                {report.postcardTitle}
              </strong>
              <small className={smallMutedClassName}>
                {new Date(report.reportedAt).toLocaleDateString(text.dateLocale)}
              </small>
            </div>
            {report.postcardImageUrl ? (
              <Image
                className="h-auto max-h-[180px] w-full rounded-[10px] border border-[#deeadb] object-cover"
                src={report.postcardImageUrl}
                alt={report.postcardTitle}
                width={640}
                height={420}
              />
            ) : null}
            <small className={smallMutedClassName}>
              {text.dashboardReportReason(reportReasonLabel(text, report.reportReason))}
            </small>
            <small className={smallMutedClassName}>
              {text.dashboardReportStatus(reportStatusLabel(text, report.status))}
            </small>
            <small className={smallMutedClassName}>{text.dashboardReportVersion(report.reportVersion)}</small>
            {report.reportDescription ? (
              <small className={smallMutedClassName}>{report.reportDescription}</small>
            ) : null}
            {report.adminNote ? (
              <small className={smallMutedClassName}>
                {text.dashboardReportAdminNote(report.adminNote)}
              </small>
            ) : null}
            {report.status === 'REMOVED' || report.postcardDeletedAt ? (
              <small className={smallMutedClassName}>{text.reportStatusRemoved}</small>
            ) : null}
            {report.status === 'PENDING' || report.status === 'IN_PROGRESS' ? (
              <div>
                <button
                  type="button"
                  className="cursor-pointer rounded-[10px] border border-[#e8d1bf] bg-[#fff7ef] px-3 py-1.5 text-[0.82rem] font-bold text-[#8a5532] disabled:opacity-60"
                  disabled={cancelingReportId === report.reportId}
                  onClick={() => setConfirmReportId(report.reportId)}
                >
                  {cancelingReportId === report.reportId
                    ? text.dashboardReportCanceling
                    : text.dashboardReportCancelButton}
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {pendingConfirmReport ? (
        <div className="fixed inset-0 z-[1300] grid place-items-center bg-[rgba(16,28,22,0.58)] px-3">
          <article className="grid w-full max-w-[420px] gap-2.5 rounded-[16px] border border-[#dcead8] bg-[#fbfffb] p-3.5 shadow-[0_16px_32px_rgba(20,42,30,0.24)]">
            <strong className="text-[1.02rem] text-[#1f3a2d]">
              {text.dashboardReportCancelConfirmTitle}
            </strong>
            <small className={smallMutedClassName}>
              {text.dashboardReportCancelConfirmBody(pendingConfirmReport.postcardTitle)}
            </small>
            <div className="flex flex-wrap justify-end gap-1.5">
              <button
                type="button"
                className="cursor-pointer rounded-[10px] border border-[#d3e4d2] bg-white px-3 py-1.5 text-[0.82rem] font-bold text-[#325445]"
                onClick={() => setConfirmReportId(null)}
                disabled={cancelingReportId === pendingConfirmReport.reportId}
              >
                {text.dashboardReportCancelConfirmNo}
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-[10px] border border-[#e8d1bf] bg-[#fff7ef] px-3 py-1.5 text-[0.82rem] font-bold text-[#8a5532] disabled:opacity-60"
                onClick={() => {
                  onCancelReport(pendingConfirmReport);
                  setConfirmReportId(null);
                }}
                disabled={cancelingReportId === pendingConfirmReport.reportId}
              >
                {cancelingReportId === pendingConfirmReport.reportId
                  ? text.dashboardReportCanceling
                  : text.dashboardReportCancelConfirmYes}
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </>
  );
}
