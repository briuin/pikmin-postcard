import { NextResponse } from 'next/server';
import { requireApprovedActor } from '@/lib/api-guards';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import {
  type ApprovedPostcardActor,
  getPostcardByIdLocal,
  softDeletePostcardLocal,
  updatePostcardLocal
} from '@/lib/postcards/local-postcard-route-service';

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PostcardRouteContextResult =
  | { ok: true; actor: ApprovedPostcardActor; id: string }
  | { ok: false; response: NextResponse };

async function resolveApprovedPostcardRouteContext(
  context: RouteContext
): Promise<PostcardRouteContextResult> {
  const guard = await requireApprovedActor();
  if (!guard.ok) {
    return { ok: false, response: guard.response };
  }

  const { id } = await context.params;
  if (!id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 })
    };
  }

  return {
    ok: true,
    actor: {
      id: guard.value.id,
      role: guard.value.role
    },
    id
  };
}

async function withApprovedPostcardRouteContext(
  context: RouteContext,
  run: (routeContext: { actor: ApprovedPostcardActor; id: string }) => Promise<NextResponse>
): Promise<NextResponse> {
  const routeContext = await resolveApprovedPostcardRouteContext(context);
  if (!routeContext.ok) {
    return routeContext.response;
  }

  return run({
    actor: routeContext.actor,
    id: routeContext.id
  });
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  return withOptionalExternalApiProxy({
    request,
    path: `/postcards/${encodeURIComponent(id)}`,
    runLocal: async () => getPostcardByIdLocal(id)
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const routeParams = await context.params;
  if (!routeParams.id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  return withOptionalExternalApiProxy({
    request,
    path: `/postcards/${encodeURIComponent(routeParams.id)}`,
    runLocal: async () =>
      withApprovedPostcardRouteContext(context, async ({ actor, id }) =>
        updatePostcardLocal({
          request,
          postcardId: id,
          actor
        })
      )
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const routeParams = await context.params;
  if (!routeParams.id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  return withOptionalExternalApiProxy({
    request,
    path: `/postcards/${encodeURIComponent(routeParams.id)}`,
    runLocal: async () =>
      withApprovedPostcardRouteContext(context, async ({ actor, id }) =>
        softDeletePostcardLocal({
          request,
          postcardId: id,
          actorId: actor.id
        })
      )
  });
}
