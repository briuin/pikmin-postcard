import { requireManagerActor, withGuardedValue } from '@/lib/api-guards';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import { listAdminFeedbackLocal } from '@/lib/admin/local-admin-route-service';

export async function GET(request: Request) {
  const url = new URL(request.url);
  return withOptionalExternalApiProxy({
    request,
    path: `/admin/feedback${url.search}`,
    runLocal: async () =>
      withGuardedValue(requireManagerActor(), async (actor) =>
        listAdminFeedbackLocal({ request, actorId: actor.id })
      )
  });
}
