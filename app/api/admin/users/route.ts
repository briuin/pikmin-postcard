import { NextResponse } from 'next/server';
import { invalidQueryResponse, safeParseRequestQuery } from '@/lib/admin/route-helpers';
import {
  listAdminUsers,
  listUsersQuerySchema,
  updateAdminUserAccess,
  updateUserAccessSchema
} from '@/lib/admin/users';
import { requireAdminActor, withGuardedValue } from '@/lib/api-guards';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import { recordUserAction } from '@/lib/user-action-log';

export async function GET(request: Request) {
  const url = new URL(request.url);
  return withOptionalExternalApiProxy({
    request,
    path: `/admin/users${url.search}`,
    runLocal: async () =>
      withGuardedValue(requireAdminActor(), async (actor) => {
        await recordUserAction({
          request,
          userId: actor.id,
          action: 'ADMIN_USERS_LIST'
        });

        const parse = safeParseRequestQuery(request, (searchParams) =>
          listUsersQuerySchema.safeParse({
            q: searchParams.get('q') ?? undefined,
            role: searchParams.get('role') ?? undefined,
            limit: searchParams.get('limit') ?? undefined
          })
        );

        if (!parse.success) {
          return invalidQueryResponse(parse.error);
        }

        const users = await listAdminUsers(parse.data);
        return NextResponse.json(users, { status: 200 });
      })
  });
}

export async function PATCH(request: Request) {
  return withOptionalExternalApiProxy({
    request,
    path: '/admin/users',
    runLocal: async () =>
      withGuardedValue(requireAdminActor(), async (actor) => {
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
      })
  });
}
