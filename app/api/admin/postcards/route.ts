import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getAuthenticatedUser, isManagerOrAboveRole } from '@/lib/api-auth';
import { serializePostcards } from '@/lib/postcards/list';
import { findPostcardsForList } from '@/lib/postcards/repository';

const adminPostcardQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  reportedOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(500).default(240)
});

export async function GET(request: Request) {
  const actor = await getAuthenticatedUser({ createIfMissing: true });
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isManagerOrAboveRole(actor.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const parse = adminPostcardQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? undefined,
    reportedOnly: url.searchParams.get('reportedOnly') === '1',
    limit: url.searchParams.get('limit') ?? undefined
  });

  if (!parse.success) {
    return NextResponse.json(
      {
        error: 'Invalid query.',
        details: parse.error.issues.map((item) => item.message).join('; ')
      },
      { status: 400 }
    );
  }

  const query = parse.data;
  const whereAnd: Prisma.PostcardWhereInput[] = [{ deletedAt: null }];
  if (query.reportedOnly) {
    whereAnd.push({
      wrongLocationReports: {
        gt: 0
      }
    });
  }
  if (query.q && query.q.length > 0) {
    whereAnd.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { notes: { contains: query.q, mode: 'insensitive' } },
        { placeName: { contains: query.q, mode: 'insensitive' } },
        { aiPlaceGuess: { contains: query.q, mode: 'insensitive' } },
        { user: { email: { contains: query.q, mode: 'insensitive' } } },
        { user: { displayName: { contains: query.q, mode: 'insensitive' } } }
      ]
    });
  }

  const items = await findPostcardsForList({
    where: { AND: whereAnd },
    orderBy: [{ wrongLocationReports: 'desc' }, { createdAt: 'desc' }],
    take: query.limit
  });

  const serialized = serializePostcards(items, { includeOriginalImageUrl: true });
  return NextResponse.json(serialized, { status: 200 });
}
