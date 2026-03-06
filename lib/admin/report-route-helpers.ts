import { NextResponse } from 'next/server';
import type { PostcardReportStatus } from '@/lib/domain/enums';
import {
  serializeReportCaseStatusUpdate,
  updateReportCaseStatus
} from '@/lib/postcards/report-workflow';
import { recordUserAction } from '@/lib/user-action-log';

export async function saveAdminReportCaseStatus(params: {
  request: Request;
  actorId: string;
  caseId: string;
  status: PostcardReportStatus;
  adminNote?: string | null;
}): Promise<NextResponse> {
  await recordUserAction({
    request: params.request,
    userId: params.actorId,
    action: 'ADMIN_POSTCARD_REPORT_STATUS_UPDATE',
    metadata: {
      caseId: params.caseId,
      status: params.status
    }
  });

  const updated = await updateReportCaseStatus({
    caseId: params.caseId,
    nextStatus: params.status,
    adminNote: params.adminNote ?? null,
    resolverUserId: params.actorId
  });

  if (!updated) {
    return NextResponse.json({ error: 'Report case not found.' }, { status: 404 });
  }

  return NextResponse.json(serializeReportCaseStatusUpdate(updated), { status: 200 });
}

export async function withAdminReportStatusPatch<T>(
  parseBody: () => Promise<T>,
  run: (body: T) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const body = await parseBody();
    return run(body);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update report status.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}
