import type { PostcardReportStatus } from '@prisma/client';

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

export type CancelDashboardReportResult =
  | { kind: 'not_found' }
  | { kind: 'resolved' }
  | { kind: 'deleted'; postcardId: string };

export type ReportRepo = {
  listDashboardReportsByReporter(userId: string): Promise<DashboardReportListItem[]>;
  cancelDashboardReport(params: {
    userId: string;
    reportId: string;
  }): Promise<CancelDashboardReportResult>;
};
