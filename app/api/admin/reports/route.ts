import { requireManagerActor, withGuardedValue } from '@/lib/api-guards';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import {
  listAdminReportCasesLocal,
  updateAdminReportStatusByBodyLocal
} from '@/lib/admin/local-admin-route-service';

export async function GET(request: Request) {
  const url = new URL(request.url);
  return withOptionalExternalApiProxy({
    request,
    path: `/admin/reports${url.search}`,
    runLocal: async () =>
      withGuardedValue(requireManagerActor(), async (actor) =>
        listAdminReportCasesLocal({ request, actorId: actor.id })
      )
  });
}

export async function PATCH(request: Request) {
  return withOptionalExternalApiProxy({
    request,
    path: '/admin/reports',
    runLocal: async () =>
      withGuardedValue(requireManagerActor(), async (actor) =>
        updateAdminReportStatusByBodyLocal({ request, actorId: actor.id })
      )
  });
}
