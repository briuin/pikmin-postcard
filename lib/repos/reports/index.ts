import type { ReportRepo } from '@/lib/repos/reports/types';
import { dynamoReportRepo } from '@/lib/repos/reports/dynamo-report-repo';

export const reportRepo: ReportRepo = dynamoReportRepo;

export type {
  CancelDashboardReportResult,
  DashboardReportListItem,
  ReportRepo
} from '@/lib/repos/reports/types';
