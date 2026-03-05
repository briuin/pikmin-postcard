import { NextResponse } from 'next/server';
import { requireAuthenticatedUserId, withGuardedValue } from '@/lib/api-guards';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import { cancelDashboardReportLocal } from '@/lib/postcards/local-report-route-service';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const { id: reportId } = await context.params;
  if (!reportId) {
    return NextResponse.json({ error: 'Missing report id.' }, { status: 400 });
  }

  return withOptionalExternalApiProxy({
    request,
    path: `/reports/${encodeURIComponent(reportId)}`,
    runLocal: async () =>
      withGuardedValue(
        requireAuthenticatedUserId({ createIfMissing: true }),
        async (userId) => cancelDashboardReportLocal({ request, userId, reportId })
      )
  });
}
