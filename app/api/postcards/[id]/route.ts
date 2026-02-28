import { NextResponse } from 'next/server';
import {
  getAuthenticatedUser,
  isApprovedUser,
  isManagerOrAboveRole
} from '@/lib/api-auth';
import {
  applyPostcardCropUpdate,
  applyPostcardDetailsUpdate,
  cropUpdateSchema,
  postcardUpdateSchema,
  softDeletePostcard
} from '@/lib/postcards/manage';
import { recordUserAction } from '@/lib/user-action-log';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const actor = await getAuthenticatedUser();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isApprovedUser(actor)) {
    return NextResponse.json({ error: 'Account pending approval.' }, { status: 403 });
  }
  const canEditAny = isManagerOrAboveRole(actor.role);

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
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
}

export async function DELETE(request: Request, context: RouteContext) {
  const actor = await getAuthenticatedUser();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isApprovedUser(actor)) {
    return NextResponse.json({ error: 'Account pending approval.' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

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
}
