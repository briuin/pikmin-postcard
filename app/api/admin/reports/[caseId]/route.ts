import { NextResponse } from 'next/server';
import { requireManagerActor, withGuardedValue } from '@/lib/api-guards';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import {
  getAdminReportCaseDetailLocal,
  updateAdminReportCaseStatusLocal
} from '@/lib/admin/local-admin-route-service';

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

type RouteCaseIdResult =
  | { ok: true; caseId: string }
  | { ok: false; response: NextResponse };

async function resolveCaseId(context: RouteContext): Promise<RouteCaseIdResult> {
  const { caseId } = await context.params;
  if (!caseId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Missing report case id.' }, { status: 400 })
    };
  }

  return { ok: true, caseId };
}

async function withResolvedCaseId(
  context: RouteContext,
  run: (caseId: string) => Promise<Response>
): Promise<Response> {
  const routeCaseId = await resolveCaseId(context);
  if (!routeCaseId.ok) {
    return routeCaseId.response;
  }

  return run(routeCaseId.caseId);
}

export async function GET(request: Request, context: RouteContext) {
  return withResolvedCaseId(context, async (caseId) =>
    withOptionalExternalApiProxy({
      request,
      path: `/admin/reports/${encodeURIComponent(caseId)}`,
      runLocal: async () =>
        withGuardedValue(requireManagerActor(), async (actor) =>
          getAdminReportCaseDetailLocal({ request, actorId: actor.id, caseId })
        )
    })
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  return withResolvedCaseId(context, async (caseId) =>
    withOptionalExternalApiProxy({
      request,
      path: `/admin/reports/${encodeURIComponent(caseId)}`,
      runLocal: async () =>
        withGuardedValue(requireManagerActor(), async (actor) =>
          updateAdminReportCaseStatusLocal({ request, actorId: actor.id, caseId })
        )
    })
  );
}
