import { PostcardReportStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { listDashboardReportsByReporter } from '@/lib/postcards/report-workflow';
import { recordUserAction } from '@/lib/user-action-log';

export async function listDashboardReportsLocal(args: {
  request: Request;
  userId: string;
}): Promise<NextResponse> {
  const { request, userId } = args;

  await recordUserAction({
    request,
    userId,
    action: 'MY_POSTCARD_REPORTS_LIST'
  });

  const rows = await listDashboardReportsByReporter(userId);
  return NextResponse.json(
    rows.map((row) => ({
      ...row,
      postcardDeletedAt: row.postcardDeletedAt?.toISOString() ?? null,
      reportedAt: row.reportedAt.toISOString(),
      statusUpdatedAt: row.statusUpdatedAt.toISOString()
    })),
    { status: 200 }
  );
}

export async function cancelDashboardReportLocal(args: {
  request: Request;
  userId: string;
  reportId: string;
}): Promise<NextResponse> {
  const { request, userId, reportId } = args;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const report = await tx.postcardReport.findFirst({
        where: {
          id: reportId,
          reporterUserId: userId
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
        return { kind: 'not_found' as const };
      }

      if (
        report.reportCase.status === PostcardReportStatus.VERIFIED ||
        report.reportCase.status === PostcardReportStatus.REMOVED
      ) {
        return { kind: 'resolved' as const };
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
        kind: 'deleted' as const,
        postcardId: report.postcard.id
      };
    });

    if (result.kind === 'not_found') {
      return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
    }
    if (result.kind === 'resolved') {
      return NextResponse.json(
        { error: 'This report is already resolved and cannot be canceled.' },
        { status: 409 }
      );
    }

    await recordUserAction({
      request,
      userId,
      action: 'POSTCARD_REPORT_CANCEL',
      metadata: {
        reportId,
        postcardId: result.postcardId
      }
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to cancel report.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}
