import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { safeParseRequestQuery, withManagerParsedQuery } from '@/lib/admin/route-helpers';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import { serializePostcards } from '@/lib/postcards/list';
import { findActiveReportCaseDetailMapForPostcards } from '@/lib/postcards/report-workflow';
import { buildPostcardSearchFilter } from '@/lib/postcards/query';
import { findPostcardsForList } from '@/lib/postcards/repository';
import { recordUserAction } from '@/lib/user-action-log';

const adminPostcardQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  reportedOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(500).default(240)
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  return withOptionalExternalApiProxy({
    request,
    path: `/admin/postcards${url.search}`,
    runLocal: async () =>
      withManagerParsedQuery(
        request,
        () =>
          safeParseRequestQuery(request, (searchParams) =>
            adminPostcardQuerySchema.safeParse({
              q: searchParams.get('q') ?? undefined,
              reportedOnly: searchParams.get('reportedOnly') === '1',
              limit: searchParams.get('limit') ?? undefined
            })
          ),
        async ({ actor, query }) => {
          await recordUserAction({
            request,
            userId: actor.id,
            action: query.reportedOnly ? 'ADMIN_POSTCARDS_LIST_REPORTED' : 'ADMIN_POSTCARDS_LIST',
            metadata: {
              reportedOnly: query.reportedOnly,
              search: query.q ?? ''
            }
          });

          const whereAnd: Prisma.PostcardWhereInput[] = query.reportedOnly
            ? []
            : [{ deletedAt: null }];
          if (query.reportedOnly) {
            whereAnd.push({
              reportCases: {
                some: {}
              }
            });
          }
          if (query.q && query.q.length > 0) {
            whereAnd.push(buildPostcardSearchFilter(query.q, { includeUploaderFields: true }));
          }

          const items = await findPostcardsForList({
            where: { AND: whereAnd },
            orderBy: [{ wrongLocationReports: 'desc' }, { createdAt: 'desc' }],
            take: query.limit
          });

          const serialized = serializePostcards(items, { includeOriginalImageUrl: true });
          const activeCaseMap = await findActiveReportCaseDetailMapForPostcards(
            serialized.map((item) => String(item.id))
          );

          const withActiveCase = serialized
            .map((item) => {
              const activeCase = activeCaseMap.get(String(item.id));
              return {
                ...item,
                activeReportCaseId: activeCase?.caseId ?? null,
                activeReportCaseStatus: activeCase?.status ?? null,
                activeReportCaseUpdatedAt: activeCase?.updatedAt.toISOString() ?? null,
                activeReportAdminNote: activeCase?.adminNote ?? null,
                activeReportCount: activeCase?.reportCount ?? 0,
                activeReportReasonCounts: activeCase?.reasonCounts ?? {},
                activeReportReports:
                  activeCase?.reports.map((report) => ({
                    ...report,
                    createdAt: report.createdAt.toISOString()
                  })) ?? []
              };
            })
            .filter((item) => {
              if (!query.reportedOnly) {
                return true;
              }
              const reportCount =
                typeof (item as { wrongLocationReports?: unknown }).wrongLocationReports === 'number'
                  ? ((item as { wrongLocationReports?: number }).wrongLocationReports ?? 0)
                  : 0;
              return item.activeReportCaseId !== null || reportCount > 0;
            });

          return NextResponse.json(withActiveCase, { status: 200 });
        }
      )
  });
}
