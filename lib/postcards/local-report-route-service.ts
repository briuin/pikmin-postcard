import { NextResponse } from 'next/server';
import { reportRepo } from '@/lib/repos/reports';
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

  const rows = await reportRepo.listDashboardReportsByReporter(userId);
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
    const result = await reportRepo.cancelDashboardReport({ userId, reportId });

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
