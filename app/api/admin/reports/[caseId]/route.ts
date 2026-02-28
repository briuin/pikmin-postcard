import { PostcardReportStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManagerActor, withGuardedValue } from '@/lib/api-guards';
import {
  saveAdminReportCaseStatus,
  withAdminReportStatusPatch
} from '@/lib/admin/report-route-helpers';
import {
  findAdminReportCaseById,
  serializeAdminReportCaseRecord
} from '@/lib/postcards/report-workflow';
import { recordUserAction } from '@/lib/user-action-log';

const adminReportCasePatchSchema = z.object({
  status: z.nativeEnum(PostcardReportStatus),
  adminNote: z.string().trim().max(1200).optional()
});

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

type RouteCaseIdResult =
  | { ok: true; caseId: string }
  | { ok: false; response: NextResponse };

async function resolveCaseId(context: RouteContext): Promise<RouteCaseIdResult> {
  const { caseId } = await context.params;
  if (!caseId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Missing report case id.' }, { status: 400 })
    };
  }

  return { ok: true, caseId };
}

async function withResolvedCaseId(
  context: RouteContext,
  run: (caseId: string) => Promise<NextResponse>
): Promise<NextResponse> {
  const routeCaseId = await resolveCaseId(context);
  if (!routeCaseId.ok) {
    return routeCaseId.response;
  }

  return run(routeCaseId.caseId);
}

export async function GET(request: Request, context: RouteContext) {
  return withGuardedValue(requireManagerActor(), async (actor) => {
    return withResolvedCaseId(context, async (caseId) => {
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

      return NextResponse.json(serializeAdminReportCaseRecord(row), { status: 200 });
    });
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return withGuardedValue(requireManagerActor(), async (actor) => {
    return withResolvedCaseId(context, async (caseId) => {
      return withAdminReportStatusPatch(
        () => request.json().then((payload) => adminReportCasePatchSchema.parse(payload)),
        async (body) =>
          saveAdminReportCaseStatus({
            request,
            actorId: actor.id,
            caseId,
            status: body.status,
            adminNote: body.adminNote ?? null
          })
      );
    });
  });
}
