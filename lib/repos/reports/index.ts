import type { ReportRepo } from '@/lib/repos/reports/types';
import { resolveDataStoreProvider } from '@/lib/repos/data-store-provider';
import { dynamoReportRepo } from '@/lib/repos/reports/dynamo-report-repo';
import { prismaReportRepo } from '@/lib/repos/reports/prisma-report-repo';

export const reportRepo: ReportRepo =
  resolveDataStoreProvider() === 'dynamodb' ? dynamoReportRepo : prismaReportRepo;

export type {
  CancelDashboardReportResult,
  DashboardReportListItem,
  ReportRepo
} from '@/lib/repos/reports/types';
