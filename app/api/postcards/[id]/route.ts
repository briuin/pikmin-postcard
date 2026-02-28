import { NextResponse } from 'next/server';
import { PostcardReportStatus } from '@prisma/client';
import { isManagerOrAboveRole } from '@/lib/api-auth';
import { requireApprovedActor } from '@/lib/api-guards';
import {
  applyPostcardCropUpdate,
  applyPostcardDetailsUpdate,
  cropUpdateSchema,
  postcardUpdateSchema,
  softDeletePostcard
} from '@/lib/postcards/manage';
import { findAdminEditableReportCaseStateByPostcardId } from '@/lib/postcards/report-workflow';
import { recordUserAction } from '@/lib/user-action-log';

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ApprovedActor = {
  id: string;
  role: Parameters<typeof isManagerOrAboveRole>[0];
};

type PostcardRouteContextResult =
  | { ok: true; actor: ApprovedActor; id: string }
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
    actor: guard.value,
    id
  };
}

async function withApprovedPostcardRouteContext(
  context: RouteContext,
  run: (routeContext: { actor: ApprovedActor; id: string }) => Promise<NextResponse>
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

export async function PATCH(request: Request, context: RouteContext) {
  return withApprovedPostcardRouteContext(context, async ({ actor, id }) => {
    const canEditAny = isManagerOrAboveRole(actor.role);
    if (canEditAny) {
      const reportCaseStatus = await findAdminEditableReportCaseStateByPostcardId(id);
      if (reportCaseStatus && reportCaseStatus !== PostcardReportStatus.IN_PROGRESS) {
        return NextResponse.json(
          { error: 'Admin can edit reported postcards only when report status is IN_PROGRESS.' },
          { status: 403 }
        );
      }
    }

    try {
      const body = await request.json();
      await recordUserAction({
        request,
        userId: actor.id,
        action: body && typeof body === 'object' && 'crop' in body ? 'POSTCARD_CROP_EDIT' : 'POSTCARD_EDIT',
        metadata: {
          postcardId: id
        }
      });

      if (body && typeof body === 'object' && 'crop' in body) {
        const payload = cropUpdateSchema.parse(body);
        const result = await applyPostcardCropUpdate({
          postcardId: id,
          actorId: actor.id,
          canEditAny,
          crop: payload.crop
        });

        if (result.kind === 'not_found') {
          return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
        }
        if (result.kind === 'missing_source') {
          return NextResponse.json(
            { error: 'No image source is available for crop edit.' },
            { status: 400 }
          );
        }

        return NextResponse.json(
          {
            ok: true,
            imageUrl: result.imageUrl,
            originalImageUrl: result.originalImageUrl
          },
          { status: 200 }
        );
      }

      const payload = postcardUpdateSchema.parse(body);
      const updated = await applyPostcardDetailsUpdate({
        postcardId: id,
        actorId: actor.id,
        canEditAny,
        payload
      });

      if (!updated) {
        return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
      }

      return NextResponse.json(updated, { status: 200 });
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Failed to update postcard.',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 400 }
      );
    }
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  return withApprovedPostcardRouteContext(context, async ({ actor, id }) => {
    await recordUserAction({
      request,
      userId: actor.id,
      action: 'POSTCARD_SOFT_DELETE',
      metadata: {
        postcardId: id
      }
    });

    const deleted = await softDeletePostcard({
      postcardId: id,
      actorId: actor.id
    });

    if (!deleted) {
      return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  });
}
