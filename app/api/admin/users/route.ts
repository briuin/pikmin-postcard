import { Prisma, UserApprovalStatus, UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, isAdminRole } from '@/lib/api-auth';
import { roleForEmail } from '@/lib/user-role';
import { prisma } from '@/lib/prisma';
import { recordUserAction } from '@/lib/user-action-log';

const listUsersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.nativeEnum(UserRole).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(300)
});

const updateUserAccessSchema = z
  .object({
    userId: z.string().min(1),
    role: z.nativeEnum(UserRole).optional(),
    approvalStatus: z.nativeEnum(UserApprovalStatus).optional(),
    canCreatePostcard: z.boolean().optional(),
    canSubmitDetection: z.boolean().optional(),
    canVote: z.boolean().optional()
  })
  .refine(
    (value) =>
      value.role !== undefined ||
      value.approvalStatus !== undefined ||
      value.canCreatePostcard !== undefined ||
      value.canSubmitDetection !== undefined ||
      value.canVote !== undefined,
    { message: 'No update fields provided.' }
  );

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  approvalStatus: true,
  canCreatePostcard: true,
  canSubmitDetection: true,
  canVote: true,
  createdAt: true,
  _count: {
    select: {
      postcards: true
    }
  }
} as const;

export async function GET(request: Request) {
  const actor = await getAuthenticatedUser({ createIfMissing: true });
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isAdminRole(actor.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  await recordUserAction({
    request,
    userId: actor.id,
    action: 'ADMIN_USERS_LIST'
  });

  const url = new URL(request.url);
  const parse = listUsersQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? undefined,
    role: url.searchParams.get('role') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined
  });

  if (!parse.success) {
    return NextResponse.json(
      {
        error: 'Invalid query.',
        details: parse.error.issues.map((issue) => issue.message).join('; ')
      },
      { status: 400 }
    );
  }

  const query = parse.data;
  const whereAnd: Prisma.UserWhereInput[] = [];
  if (query.role) {
    whereAnd.push({ role: query.role });
  }
  if (query.q && query.q.length > 0) {
    whereAnd.push({
      OR: [
        { email: { contains: query.q, mode: 'insensitive' as const } },
        { displayName: { contains: query.q, mode: 'insensitive' as const } }
      ]
    });
  }

  const users = await prisma.user.findMany({
    where: whereAnd.length > 0 ? { AND: whereAnd } : undefined,
    orderBy: [{ role: 'desc' }, { createdAt: 'desc' }],
    select: userSelect,
    take: query.limit
  });

  return NextResponse.json(
    users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      approvalStatus: user.approvalStatus,
      canCreatePostcard: user.canCreatePostcard,
      canSubmitDetection: user.canSubmitDetection,
      canVote: user.canVote,
      createdAt: user.createdAt,
      postcardCount: user._count.postcards
    })),
    { status: 200 }
  );
}

export async function PATCH(request: Request) {
  const actor = await getAuthenticatedUser({ createIfMissing: true });
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isAdminRole(actor.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  try {
    const payload = updateUserAccessSchema.parse(await request.json());
    await recordUserAction({
      request,
      userId: actor.id,
      action: 'ADMIN_USER_ACCESS_UPDATE',
      metadata: {
        targetUserId: payload.userId,
        targetRole: payload.role,
        approvalStatus: payload.approvalStatus,
        canCreatePostcard: payload.canCreatePostcard,
        canSubmitDetection: payload.canSubmitDetection,
        canVote: payload.canVote
      }
    });
    const target = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true }
    });

    if (!target) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    if (payload.role && roleForEmail(target.email) === UserRole.ADMIN && payload.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: 'Default bootstrap admin account must remain ADMIN.' },
        { status: 400 }
      );
    }
    if (
      payload.approvalStatus &&
      roleForEmail(target.email) === UserRole.ADMIN &&
      payload.approvalStatus !== UserApprovalStatus.APPROVED
    ) {
      return NextResponse.json(
        { error: 'Default bootstrap admin account must remain APPROVED.' },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: payload.userId },
      data: {
        ...(payload.role ? { role: payload.role } : {}),
        ...(payload.approvalStatus
          ? { approvalStatus: payload.approvalStatus }
          : {}),
        ...(payload.canCreatePostcard !== undefined
          ? { canCreatePostcard: payload.canCreatePostcard }
          : {}),
        ...(payload.canSubmitDetection !== undefined
          ? { canSubmitDetection: payload.canSubmitDetection }
          : {}),
        ...(payload.canVote !== undefined ? { canVote: payload.canVote } : {})
      },
      select: userSelect
    });

    const normalized = {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      approvalStatus: updated.approvalStatus,
      canCreatePostcard: updated.canCreatePostcard,
      canSubmitDetection: updated.canSubmitDetection,
      canVote: updated.canVote,
      createdAt: updated.createdAt,
      postcardCount: updated._count.postcards
    };

    return NextResponse.json(normalized, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update user access.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}
