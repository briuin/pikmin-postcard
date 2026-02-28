import { NextResponse } from 'next/server';
import { invalidQueryResponse } from '@/lib/admin/route-helpers';
import {
  listAdminUsers,
  listUsersQuerySchema,
  updateAdminUserAccess,
  updateUserAccessSchema
} from '@/lib/admin/users';
import { requireAdminActor } from '@/lib/api-guards';
import { recordUserAction } from '@/lib/user-action-log';

export async function GET(request: Request) {
  const guard = await requireAdminActor();
  if (!guard.ok) {
    return guard.response;
  }
  const actor = guard.value;

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
    return invalidQueryResponse(parse.error);
  }

  const users = await listAdminUsers(parse.data);
  return NextResponse.json(users, { status: 200 });
}

export async function PATCH(request: Request) {
  const guard = await requireAdminActor();
  if (!guard.ok) {
    return guard.response;
  }
  const actor = guard.value;

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

    const result = await updateAdminUserAccess(payload);
    if (result.kind === 'not_found') {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    if (result.kind === 'bootstrap_role_locked') {
      return NextResponse.json(
        { error: 'Default bootstrap admin account must remain ADMIN.' },
        { status: 400 }
      );
    }
    if (result.kind === 'bootstrap_approval_locked') {
      return NextResponse.json(
        { error: 'Default bootstrap admin account must remain APPROVED.' },
        { status: 400 }
      );
    }

    return NextResponse.json(result.user, { status: 200 });
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
