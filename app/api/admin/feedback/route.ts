import { FeedbackMessageStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidQueryResponse, requireManagerActor } from '@/lib/admin/route-helpers';
import { prisma } from '@/lib/prisma';
import { recordUserAction } from '@/lib/user-action-log';

const adminFeedbackQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.nativeEnum(FeedbackMessageStatus).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(300)
});

export async function GET(request: Request) {
  const guard = await requireManagerActor();
  if (!guard.ok) {
    return guard.response;
  }
  const { actor } = guard;

  const url = new URL(request.url);
  const parse = adminFeedbackQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined
  });
  if (!parse.success) {
    return invalidQueryResponse(parse.error);
  }

  const query = parse.data;
  await recordUserAction({
    request,
    userId: actor.id,
    action: 'ADMIN_FEEDBACK_LIST',
    metadata: {
      status: query.status ?? null,
      search: query.q ?? ''
    }
  });

  const whereAnd: Array<Record<string, unknown>> = [];
  if (query.status) {
    whereAnd.push({ status: query.status });
  }
  if (query.q && query.q.length > 0) {
    whereAnd.push({
      OR: [
        { subject: { contains: query.q, mode: 'insensitive' } },
        { message: { contains: query.q, mode: 'insensitive' } },
        { user: { email: { contains: query.q, mode: 'insensitive' } } },
        { user: { displayName: { contains: query.q, mode: 'insensitive' } } }
      ]
    });
  }

  const rows = await prisma.feedbackMessage.findMany({
    where: whereAnd.length > 0 ? { AND: whereAnd } : undefined,
    orderBy: { createdAt: 'desc' },
    take: query.limit,
    select: {
      id: true,
      subject: true,
      message: true,
      status: true,
      createdAt: true,
      user: {
        select: {
          email: true,
          displayName: true
        }
      }
    }
  });

  return NextResponse.json(
    rows.map((item) => ({
      id: item.id,
      subject: item.subject,
      message: item.message,
      status: item.status,
      createdAt: item.createdAt,
      userEmail: item.user.email,
      userDisplayName: item.user.displayName
    })),
    { status: 200 }
  );
}
