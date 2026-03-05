import { NextResponse } from 'next/server';
import { requireAuthenticatedUserId, withGuardedValue } from '@/lib/api-guards';
import { proxyExternalApiRequest } from '@/lib/external-api-proxy';
import { listDashboardReportsByReporter } from '@/lib/postcards/report-workflow';
import { recordUserAction } from '@/lib/user-action-log';

export async function GET(request: Request) {
  const proxied = await proxyExternalApiRequest({
    request,
    path: '/reports'
  });
  if (proxied) {
    return proxied;
  }

  return withGuardedValue(
    requireAuthenticatedUserId({ createIfMissing: true }),
    async (userId) => {
      await recordUserAction({
        request,
        userId,
        action: 'MY_POSTCARD_REPORTS_LIST'
      });

      const rows = await listDashboardReportsByReporter(userId);
      return NextResponse.json(
        rows.map((row) => ({
          ...row,
          postcardDeletedAt: row.postcardDeletedAt?.toISOString() ?? null,
          reportedAt: row.reportedAt.toISOString(),
          statusUpdatedAt: row.statusUpdatedAt.toISOString()
        })),
        { status: 200 }
      );
    }
  );
}
