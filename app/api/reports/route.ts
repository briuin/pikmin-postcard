import { requireAuthenticatedUserId, withGuardedValue } from '@/lib/api-guards';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import { listDashboardReportsLocal } from '@/lib/postcards/local-report-route-service';

export async function GET(request: Request) {
  return withOptionalExternalApiProxy({
    request,
    path: '/reports',
    runLocal: async () =>
      withGuardedValue(
        requireAuthenticatedUserId({ createIfMissing: true }),
        async (userId) => listDashboardReportsLocal({ request, userId })
      )
  });
}
