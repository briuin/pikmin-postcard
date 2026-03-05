import { requireManagerActor, withGuardedValue } from '@/lib/api-guards';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import { listAdminPostcardsLocal } from '@/lib/admin/local-admin-route-service';

export async function GET(request: Request) {
  const url = new URL(request.url);
  return withOptionalExternalApiProxy({
    request,
    path: `/admin/postcards${url.search}`,
    runLocal: async () =>
      withGuardedValue(requireManagerActor(), async (actor) =>
        listAdminPostcardsLocal({ request, actorId: actor.id })
      )
  });
}
