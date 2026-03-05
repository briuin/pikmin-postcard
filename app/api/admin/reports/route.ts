import { PostcardReportStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManagerActor, withGuardedValue } from '@/lib/api-guards';
import {
  saveAdminReportCaseStatus,
  withAdminReportStatusPatch
} from '@/lib/admin/report-route-helpers';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import {
  requireManagerAndParseQuery,
  safeParseRequestQuery
} from '@/lib/admin/route-helpers';
import {
  listAdminReportCases,
  serializeAdminReportCaseRecord
} from '@/lib/postcards/report-workflow';
import { recordUserAction } from '@/lib/user-action-log';

const adminReportsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.nativeEnum(PostcardReportStatus).optional(),
  limit: z.coerce.number().int().min(1).max(400).default(200)
});

const adminReportStatusPatchSchema = z.object({
  caseId: z.string().trim().min(1),
  status: z.nativeEnum(PostcardReportStatus),
  adminNote: z.string().trim().max(1200).optional()
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  return withOptionalExternalApiProxy({
    request,
    path: `/admin/reports${url.search}`,
    runLocal: async () => {
      const context = await requireManagerAndParseQuery(request, () =>
        safeParseRequestQuery(request, (searchParams) =>
          adminReportsQuerySchema.safeParse({
            q: searchParams.get('q') ?? undefined,
            status: searchParams.get('status') ?? undefined,
            limit: searchParams.get('limit') ?? undefined
          })
        )
      );

      if (!context.ok) {
        return context.response;
      }

      const { actor, query } = context;
      await recordUserAction({
        request,
        userId: actor.id,
        action: 'ADMIN_POSTCARD_REPORTS_LIST',
        metadata: {
          search: query.q ?? '',
          status: query.status ?? null
        }
      });

      const rows = await listAdminReportCases({
        status: query.status,
        search: query.q,
        limit: query.limit
      });
      const payload = rows.map((row) => serializeAdminReportCaseRecord(row));

      return NextResponse.json(payload, { status: 200 });
    }
  });
}

export async function PATCH(request: Request) {
  return withOptionalExternalApiProxy({
    request,
    path: '/admin/reports',
    runLocal: async () =>
      withGuardedValue(requireManagerActor(), async (actor) => {
        return withAdminReportStatusPatch(
          () => request.json().then((payload) => adminReportStatusPatchSchema.parse(payload)),
          async (body) =>
            saveAdminReportCaseStatus({
              request,
              actorId: actor.id,
              caseId: body.caseId,
              status: body.status,
              adminNote: body.adminNote ?? null
            })
        );
      })
  });
}
