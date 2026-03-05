import { useCallback, useState } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import type { DashboardReportRecord } from '@/components/workbench/types';
import { parseJsonResponseOrThrow } from '@/lib/http-response';
import { apiFetch } from '@/lib/client-api';

type UseDashboardReportActionsArgs = {
  text: WorkbenchText;
  ensureAuthenticated: () => boolean;
  currentUserId: string | null;
  currentUserEmail: string | null;
  loadDashboardData: () => Promise<void>;
  loadPublicPostcards: () => Promise<void>;
  setDashboardStatus: (value: string) => void;
};

export function useDashboardReportActions({
  text,
  ensureAuthenticated,
  currentUserId,
  currentUserEmail,
  loadDashboardData,
  loadPublicPostcards,
  setDashboardStatus
}: UseDashboardReportActionsArgs) {
  const [cancelingReportId, setCancelingReportId] = useState<string | null>(null);

  const cancelReport = useCallback(
    async (report: DashboardReportRecord) => {
      if (!ensureAuthenticated()) {
        return;
      }

      setCancelingReportId(report.reportId);
      setDashboardStatus(text.dashboardReportCanceling);

      try {
        const response = await apiFetch(
          `/api/reports/${report.reportId}`,
          {
            method: 'DELETE'
          },
          {
            userId: currentUserId,
            userEmail: currentUserEmail
          }
        );
        await parseJsonResponseOrThrow(response, text.dashboardReportCancelFailed);
        await Promise.all([loadDashboardData(), loadPublicPostcards()]);
        setDashboardStatus(text.dashboardReportCancelDone);
      } catch (error) {
        setDashboardStatus(error instanceof Error ? error.message : text.dashboardReportCancelFailed);
      } finally {
        setCancelingReportId(null);
      }
    },
    [
      ensureAuthenticated,
      currentUserEmail,
      currentUserId,
      loadDashboardData,
      loadPublicPostcards,
      setDashboardStatus,
      text.dashboardReportCancelDone,
      text.dashboardReportCancelFailed,
      text.dashboardReportCanceling
    ]
  );

  return {
    cancelingReportId,
    cancelReport
  };
}
