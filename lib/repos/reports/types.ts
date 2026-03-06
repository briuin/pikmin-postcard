import type { PostcardReportStatus } from '@/lib/domain/enums';
import type {
  ActiveReportCaseDetail,
  AdminReportCaseRecord,
  DashboardReportListItem,
  ReportCaseStatusUpdateResult
} from '@/lib/postcards/report-types';

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
  findActiveReportCaseDetailMapForPostcards(
    postcardIds: string[]
  ): Promise<Map<string, ActiveReportCaseDetail>>;
  listAdminReportCases(params: {
    status?: PostcardReportStatus;
    search?: string;
    limit: number;
    reportTake?: number;
  }): Promise<AdminReportCaseRecord[]>;
  findAdminEditableReportCaseStateByPostcardId(
    postcardId: string
  ): Promise<PostcardReportStatus | null>;
  updateReportCaseStatus(params: {
    caseId: string;
    nextStatus: PostcardReportStatus;
    adminNote?: string | null;
    resolverUserId: string;
  }): Promise<ReportCaseStatusUpdateResult | null>;
  findAdminReportCaseById(caseId: string): Promise<AdminReportCaseRecord | null>;
};

export type {
  ActiveReportCaseDetail,
  AdminReportCaseRecord,
  DashboardReportListItem,
  ReportCaseStatusUpdateResult
} from '@/lib/postcards/report-types';
