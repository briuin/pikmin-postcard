import { PostcardReportStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManagerActor, withGuardedValue } from '@/lib/api-guards';
import {
  findAdminReportCaseById,
  updateReportCaseStatus
} from '@/lib/postcards/report-workflow';
import { recordUserAction } from '@/lib/user-action-log';

const adminReportCasePatchSchema = z.object({
  status: z.nativeEnum(PostcardReportStatus),
  adminNote: z.string().trim().max(1200).optional()
});

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return withGuardedValue(requireManagerActor(), async (actor) => {
    const { caseId } = await context.params;
    if (!caseId) {
      return NextResponse.json({ error: 'Missing report case id.' }, { status: 400 });
    }

    await recordUserAction({
      request,
      userId: actor.id,
      action: 'ADMIN_POSTCARD_REPORT_DETAIL',
      metadata: {
        caseId
      }
    });

    const row = await findAdminReportCaseById(caseId);
    if (!row) {
      return NextResponse.json({ error: 'Report case not found.' }, { status: 404 });
    }

    return NextResponse.json(
      {
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        postcard: {
          ...row.postcard,
          deletedAt: row.postcard.deletedAt?.toISOString() ?? null
        },
        reports: row.reports.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString()
        }))
      },
      { status: 200 }
    );
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return withGuardedValue(requireManagerActor(), async (actor) => {
    const { caseId } = await context.params;
    if (!caseId) {
      return NextResponse.json({ error: 'Missing report case id.' }, { status: 400 });
    }

    try {
      const body = adminReportCasePatchSchema.parse(await request.json());

      await recordUserAction({
        request,
        userId: actor.id,
        action: 'ADMIN_POSTCARD_REPORT_STATUS_UPDATE',
        metadata: {
          caseId,
          status: body.status
        }
      });

      const updated = await updateReportCaseStatus({
        caseId,
        nextStatus: body.status,
        adminNote: body.adminNote ?? null,
        resolverUserId: actor.id
      });

      if (!updated) {
        return NextResponse.json({ error: 'Report case not found.' }, { status: 404 });
      }

      return NextResponse.json(
        {
          caseId: updated.caseId,
          postcardId: updated.postcardId,
          status: updated.status,
          reportVersion: updated.reportVersion,
          wrongLocationReports: updated.wrongLocationReports,
          postcardDeletedAt: updated.postcardDeletedAt?.toISOString() ?? null
        },
        { status: 200 }
      );
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Failed to update report status.',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 400 }
      );
    }
  });
}
