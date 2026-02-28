import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { withManagerParsedQuery } from '@/lib/admin/route-helpers';
import { serializePostcards } from '@/lib/postcards/list';
import { buildPostcardSearchFilter } from '@/lib/postcards/query';
import { findPostcardsForList } from '@/lib/postcards/repository';
import { recordUserAction } from '@/lib/user-action-log';

const adminPostcardQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  reportedOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(500).default(240)
});

export async function GET(request: Request) {
  return withManagerParsedQuery(
    request,
    () => {
      const url = new URL(request.url);
      return adminPostcardQuerySchema.safeParse({
        q: url.searchParams.get('q') ?? undefined,
        reportedOnly: url.searchParams.get('reportedOnly') === '1',
        limit: url.searchParams.get('limit') ?? undefined
      });
    },
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

      const whereAnd: Prisma.PostcardWhereInput[] = [{ deletedAt: null }];
      if (query.reportedOnly) {
        whereAnd.push({
          wrongLocationReports: {
            gt: 0
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
      return NextResponse.json(serialized, { status: 200 });
    }
  );
}
