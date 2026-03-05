import { requireAdminActor, withGuardedValue } from '@/lib/api-guards';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import {
  listAdminUsersLocal,
  updateAdminUserAccessLocal
} from '@/lib/admin/local-admin-route-service';

export async function GET(request: Request) {
  const url = new URL(request.url);
  return withOptionalExternalApiProxy({
    request,
    path: `/admin/users${url.search}`,
    runLocal: async () =>
      withGuardedValue(requireAdminActor(), async (actor) =>
        listAdminUsersLocal({ request, actorId: actor.id })
      )
  });
}

export async function PATCH(request: Request) {
  return withOptionalExternalApiProxy({
    request,
    path: '/admin/users',
    runLocal: async () =>
      withGuardedValue(requireAdminActor(), async (actor) =>
        updateAdminUserAccessLocal({ request, actorId: actor.id })
      )
  });
}
