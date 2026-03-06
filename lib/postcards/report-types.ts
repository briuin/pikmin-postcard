import type { PostcardReportStatus } from '@/lib/domain/enums';

export type ActiveReportCaseSummary = {
  postcardId: string;
  caseId: string;
  status: PostcardReportStatus;
  updatedAt: Date;
};

export type ActiveReportCaseDetail = ActiveReportCaseSummary & {
  adminNote: string | null;
  reportCount: number;
  reasonCounts: Record<string, number>;
  reports: Array<{
    id: string;
    reason: string;
    description: string | null;
    reporterName: string;
    createdAt: Date;
  }>;
};

export type DashboardReportListItem = {
  reportId: string;
  caseId: string;
  postcardId: string;
  postcardTitle: string;
  postcardImageUrl: string | null;
  postcardPlaceName: string | null;
  postcardDeletedAt: Date | null;
  reportReason: string;
  reportDescription: string | null;
  reportVersion: number;
  status: PostcardReportStatus;
  adminNote: string | null;
  reportedAt: Date;
  statusUpdatedAt: Date;
};

export type AdminReportCaseRecord = {
  caseId: string;
  postcardId: string;
  version: number;
  status: PostcardReportStatus;
  adminNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  postcard: {
    id: string;
    title: string;
    imageUrl: string | null;
    placeName: string | null;
    deletedAt: Date | null;
    wrongLocationReports: number;
    reportVersion: number;
    uploaderName: string;
  };
  reportCount: number;
  reasonCounts: Record<string, number>;
  reports: Array<{
    id: string;
    reason: string;
    description: string | null;
    createdAt: Date;
    reporterName: string;
  }>;
};

export type SerializedAdminReportCaseRecord = Omit<
  AdminReportCaseRecord,
  'createdAt' | 'updatedAt' | 'resolvedAt' | 'postcard' | 'reports'
> & {
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  postcard: Omit<AdminReportCaseRecord['postcard'], 'deletedAt'> & {
    deletedAt: string | null;
  };
  reports: Array<Omit<AdminReportCaseRecord['reports'][number], 'createdAt'> & { createdAt: string }>;
};

export type ReportCaseStatusUpdateResult = {
  caseId: string;
  postcardId: string;
  status: PostcardReportStatus;
  reportVersion: number;
  wrongLocationReports: number;
  postcardDeletedAt: Date | null;
};

export function getReporterName(reporter: { email: string; displayName: string | null }): string {
  return reporter.displayName || reporter.email;
}

export function buildReasonCounts(reports: Array<{ reason: string }>): Record<string, number> {
  return reports.reduce<Record<string, number>>((acc, report) => {
    acc[report.reason] = (acc[report.reason] ?? 0) + 1;
    return acc;
  }, {});
}

export function serializeAdminReportCaseRecord(
  record: AdminReportCaseRecord
): SerializedAdminReportCaseRecord {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    postcard: {
      ...record.postcard,
      deletedAt: record.postcard.deletedAt?.toISOString() ?? null
    },
    reports: record.reports.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString()
    }))
  };
}

export function serializeReportCaseStatusUpdate(result: ReportCaseStatusUpdateResult) {
  return {
    caseId: result.caseId,
    postcardId: result.postcardId,
    status: result.status,
    reportVersion: result.reportVersion,
    wrongLocationReports: result.wrongLocationReports,
    postcardDeletedAt: result.postcardDeletedAt?.toISOString() ?? null
  };
}
