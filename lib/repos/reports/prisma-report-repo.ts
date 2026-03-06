import { PostcardReportStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type {
  CancelDashboardReportResult,
  DashboardReportListItem,
  ReportRepo
} from '@/lib/repos/reports/types';

async function listDashboardReportsByReporter(userId: string): Promise<DashboardReportListItem[]> {
  const rows = await prisma.postcardReport.findMany({
    where: {
      reporterUserId: userId
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 300,
    include: {
      reportCase: {
        select: {
          id: true,
          status: true,
          adminNote: true,
          updatedAt: true
        }
      },
      postcard: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
          placeName: true,
          deletedAt: true
        }
      }
    }
  });

  return rows.map((row) => ({
    reportId: row.id,
    caseId: row.reportCase.id,
    postcardId: row.postcard.id,
    postcardTitle: row.postcard.title,
    postcardImageUrl: row.postcard.imageUrl,
    postcardPlaceName: row.postcard.placeName,
    postcardDeletedAt: row.postcard.deletedAt,
    reportReason: row.reason,
    reportDescription: row.description,
    reportVersion: row.version,
    status: row.reportCase.status,
    adminNote: row.reportCase.adminNote,
    reportedAt: row.createdAt,
    statusUpdatedAt: row.reportCase.updatedAt
  }));
}

async function cancelDashboardReport(params: {
  userId: string;
  reportId: string;
}): Promise<CancelDashboardReportResult> {
  return prisma.$transaction(async (tx) => {
    const report = await tx.postcardReport.findFirst({
      where: {
        id: params.reportId,
        reporterUserId: params.userId
      },
      include: {
        reportCase: {
          select: {
            id: true,
            status: true
          }
        },
        postcard: {
          select: {
            id: true,
            reportVersion: true,
            wrongLocationReports: true
          }
        }
      }
    });

    if (!report) {
      return { kind: 'not_found' };
    }

    if (
      report.reportCase.status === PostcardReportStatus.VERIFIED ||
      report.reportCase.status === PostcardReportStatus.REMOVED
    ) {
      return { kind: 'resolved' };
    }

    await tx.postcardReport.delete({
      where: {
        id: report.id
      }
    });

    if (
      report.version === report.postcard.reportVersion &&
      report.postcard.wrongLocationReports > 0
    ) {
      await tx.postcard.update({
        where: { id: report.postcard.id },
        data: {
          wrongLocationReports: {
            decrement: 1
          }
        }
      });
    }

    const remainingCount = await tx.postcardReport.count({
      where: {
        caseId: report.caseId
      }
    });

    if (remainingCount === 0) {
      await tx.postcardReportCase.delete({
        where: {
          id: report.caseId
        }
      });
    }

    return {
      kind: 'deleted',
      postcardId: report.postcard.id
    };
  });
}

export const prismaReportRepo: ReportRepo = {
  listDashboardReportsByReporter,
  cancelDashboardReport
};
