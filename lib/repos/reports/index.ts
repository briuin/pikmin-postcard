import type { ReportRepo } from '@/lib/repos/reports/types';
import { prismaReportRepo } from '@/lib/repos/reports/prisma-report-repo';

export const reportRepo: ReportRepo = prismaReportRepo;

export type {
  CancelDashboardReportResult,
  DashboardReportListItem,
  ReportRepo
} from '@/lib/repos/reports/types';
