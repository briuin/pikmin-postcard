import type { PostcardReportStatus } from '@/lib/domain/enums';
import { reportRepo } from '@/lib/repos/reports';
import {
  serializeAdminReportCaseRecord,
  serializeReportCaseStatusUpdate,
  type ActiveReportCaseDetail,
  type ActiveReportCaseSummary,
  type AdminReportCaseRecord,
  type DashboardReportListItem,
  type ReportCaseStatusUpdateResult,
  type SerializedAdminReportCaseRecord
} from '@/lib/postcards/report-types';

export type {
  ActiveReportCaseDetail,
  ActiveReportCaseSummary,
  AdminReportCaseRecord,
  DashboardReportListItem,
  ReportCaseStatusUpdateResult,
  SerializedAdminReportCaseRecord
};

export { serializeAdminReportCaseRecord, serializeReportCaseStatusUpdate };

export async function listDashboardReportsByReporter(userId: string): Promise<DashboardReportListItem[]> {
  return reportRepo.listDashboardReportsByReporter(userId);
}

export async function findActiveReportCaseDetailMapForPostcards(
  postcardIds: string[]
): Promise<Map<string, ActiveReportCaseDetail>> {
  return reportRepo.findActiveReportCaseDetailMapForPostcards(postcardIds);
}

export async function listAdminReportCases(params: {
  status?: PostcardReportStatus;
  search?: string;
  limit: number;
  reportTake?: number;
}): Promise<AdminReportCaseRecord[]> {
  return reportRepo.listAdminReportCases(params);
}

export async function findAdminEditableReportCaseState(params: {
  tx: unknown;
  postcardId: string;
}): Promise<PostcardReportStatus | null> {
  void params.tx;
  return reportRepo.findAdminEditableReportCaseStateByPostcardId(params.postcardId);
}

export async function findAdminEditableReportCaseStateByPostcardId(
  postcardId: string
): Promise<PostcardReportStatus | null> {
  return reportRepo.findAdminEditableReportCaseStateByPostcardId(postcardId);
}

type UpdateReportCaseStatusParams = {
  caseId: string;
  nextStatus: PostcardReportStatus;
  adminNote?: string | null;
  resolverUserId: string;
};

export async function updateReportCaseStatus(
  params: UpdateReportCaseStatusParams
): Promise<ReportCaseStatusUpdateResult | null> {
  return reportRepo.updateReportCaseStatus(params);
}

export async function findAdminReportCaseById(caseId: string): Promise<AdminReportCaseRecord | null> {
  return reportRepo.findAdminReportCaseById(caseId);
}
