import {
  FeedbackAction,
  LocationStatus,
  PostcardType,
  PostcardReportStatus,
  UserRole
} from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isManagerOrAboveRole } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import {
  attachViewerFeedback,
  findViewerFeedbackRowsForPostcards
} from '@/lib/postcards/feedback';
import {
  type FeedbackReportReasonInput,
  submitPostcardFeedback,
  type FeedbackInputAction
} from '@/lib/postcards/feedback-mutations';
import { serializePostcards } from '@/lib/postcards/list';
import { buildPublicOrderBy, buildPublicWhere, parsePublicQuery } from '@/lib/postcards/query';
import { findPostcardsForList } from '@/lib/postcards/repository';
import { findAdminEditableReportCaseStateByPostcardId } from '@/lib/postcards/report-workflow';
import { hasMissingOriginalImageColumnError } from '@/lib/postcards/shared';
import { reverseGeocodeCoordinates } from '@/lib/reverse-geocode';
import { recordUserAction } from '@/lib/user-action-log';

const postcardCreateSchema = z.object({
  title: z.string().min(1),
  postcardType: z.nativeEnum(PostcardType),
  notes: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  originalImageUrl: z.string().url().optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  placeName: z.string().max(180).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  aiLatitude: z.number().min(-90).max(90).optional(),
  aiLongitude: z.number().min(-180).max(180).optional(),
  aiConfidence: z.number().min(0).max(1).optional(),
  aiPlaceGuess: z.string().max(180).optional(),
  locationStatus: z.nativeEnum(LocationStatus).optional(),
  locationModelVersion: z.string().max(100).optional()
});

const postcardFeedbackSchema = z.object({
  action: z.enum(['like', 'dislike', 'favorite', 'collected', 'report', 'report_wrong_location']),
  reason: z.enum(['wrong_location', 'spam', 'illegal_image', 'other']).optional(),
  description: z.string().trim().max(1200).optional()
}).superRefine((payload, ctx) => {
  if (
    (payload.action === 'report' || payload.action === 'report_wrong_location') &&
    !payload.reason
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reason'],
      message: 'Reason is required when reporting.'
    });
  }
});

export type ApprovedPostcardActor = {
  id: string;
  role: UserRole;
};

export async function listMinePostcardsLocal(args: {
  request: Request;
  userId: string;
  viewerUserId: string | null;
}): Promise<NextResponse> {
  const { request, userId, viewerUserId } = args;

  await recordUserAction({
    request,
    userId,
    action: 'MY_POSTCARD_LIST'
  });

  const postcards = await findPostcardsForList({
    where: {
      userId,
      deletedAt: null
    },
    orderBy: { createdAt: 'desc' },
    take: 200
  });

  const serialized = serializePostcards(postcards, { includeOriginalImageUrl: true });
  const feedbackRows = await findViewerFeedbackRowsForPostcards(
    viewerUserId,
    serialized.map((item) => item.id)
  );

  return NextResponse.json(attachViewerFeedback(serialized, feedbackRows), {
    status: 200
  });
}

export async function listSavedPostcardsLocal(args: {
  request: Request;
  userId: string;
  viewerUserId: string | null;
}): Promise<NextResponse> {
  const { request, userId, viewerUserId } = args;

  await recordUserAction({
    request,
    userId,
    action: 'SAVED_POSTCARD_LIST'
  });

  const savedRows = await prisma.postcardFeedback.findMany({
    where: {
      userId,
      action: {
        in: [FeedbackAction.FAVORITE, FeedbackAction.COLLECTED]
      },
      postcard: {
        deletedAt: null
      }
    },
    select: {
      postcardId: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 400
  });

  const orderedPostcardIds = Array.from(new Set(savedRows.map((row) => row.postcardId)));
  if (orderedPostcardIds.length === 0) {
    return NextResponse.json([], { status: 200 });
  }

  const postcards = await findPostcardsForList({
    where: {
      id: {
        in: orderedPostcardIds
      },
      deletedAt: null
    },
    orderBy: {
      updatedAt: 'desc'
    },
    take: 400
  });

  const postcardById = new Map(postcards.map((postcard) => [postcard.id, postcard]));
  const orderedPostcards = orderedPostcardIds
    .map((id) => postcardById.get(id))
    .filter((row): row is (typeof postcards)[number] => Boolean(row));
  const serialized = serializePostcards(orderedPostcards, { includeOriginalImageUrl: true });
  const feedbackRows = await findViewerFeedbackRowsForPostcards(
    viewerUserId,
    serialized.map((item) => item.id)
  );

  return NextResponse.json(attachViewerFeedback(serialized, feedbackRows), {
    status: 200
  });
}

export async function listPublicPostcardsLocal(args: {
  url: URL;
  viewerUserId: string | null;
}): Promise<NextResponse> {
  const { url, viewerUserId } = args;
  const queryParse = parsePublicQuery(url);
  if (!queryParse.success) {
    return NextResponse.json(
      {
        error: 'Invalid query.',
        details: queryParse.error.issues.map((issue) => issue.message).join('; ')
      },
      { status: 400 }
    );
  }

  const query = queryParse.data;
  const where = buildPublicWhere(query);
  const orderBy = buildPublicOrderBy(query.sort);

  const [postcards, total] = await Promise.all([
    findPostcardsForList({
      where,
      orderBy,
      take: query.limit + 1
    }),
    prisma.postcard.count({ where })
  ]);

  const hasMore = postcards.length > query.limit;
  const items = hasMore ? postcards.slice(0, query.limit) : postcards;
  const serialized = serializePostcards(items);
  const feedbackRows = await findViewerFeedbackRowsForPostcards(
    viewerUserId,
    serialized.map((item) => item.id)
  );

  return NextResponse.json(
    {
      items: attachViewerFeedback(serialized, feedbackRows),
      total,
      hasMore,
      limit: query.limit,
      sort: query.sort
    },
    { status: 200 }
  );
}

export async function createPostcardLocal(args: {
  request: Request;
  actorId: string;
}): Promise<NextResponse> {
  const { request, actorId } = args;
  try {
    const body = postcardCreateSchema.parse(await request.json());
    const reverseLocation =
      typeof body.latitude === 'number' && typeof body.longitude === 'number'
        ? await reverseGeocodeCoordinates(body.latitude, body.longitude)
        : null;

    await recordUserAction({
      request,
      userId: actorId,
      action: 'POSTCARD_CREATE',
      metadata: {
        postcardType: body.postcardType,
        locationStatus: body.locationStatus ?? LocationStatus.AUTO
      }
    });

    const baseData = {
      userId: actorId,
      title: body.title,
      postcardType: body.postcardType,
      notes: body.notes,
      imageUrl: body.imageUrl,
      city: reverseLocation?.city ?? body.city,
      state: reverseLocation?.state ?? body.state,
      country: reverseLocation?.country ?? body.country,
      placeName: body.placeName,
      latitude: body.latitude,
      longitude: body.longitude,
      aiLatitude: body.aiLatitude,
      aiLongitude: body.aiLongitude,
      aiConfidence: body.aiConfidence,
      aiPlaceGuess: body.aiPlaceGuess,
      locationStatus: body.locationStatus ?? LocationStatus.AUTO,
      locationModelVersion: body.locationModelVersion ?? process.env.GEMINI_MODEL ?? 'unknown'
    };

    let postcard;
    try {
      postcard = await prisma.postcard.create({
        data: {
          ...baseData,
          originalImageUrl: body.originalImageUrl
        }
      });
    } catch (error) {
      if (!hasMissingOriginalImageColumnError(error)) {
        throw error;
      }

      postcard = await prisma.postcard.create({
        data: baseData
      });
    }

    return NextResponse.json(postcard, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Invalid postcard payload.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}

export async function getPostcardByIdLocal(postcardId: string): Promise<NextResponse> {
  const rows = await findPostcardsForList({
    where: {
      id: postcardId,
      deletedAt: null
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 1
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
  }

  const serialized = serializePostcards(rows);
  return NextResponse.json(serialized[0], { status: 200 });
}

export async function updatePostcardLocal(args: {
  request: Request;
  postcardId: string;
  actor: ApprovedPostcardActor;
}): Promise<NextResponse> {
  const { request, postcardId, actor } = args;
  const {
    applyPostcardCropUpdate,
    applyPostcardDetailsUpdate,
    cropUpdateSchema,
    postcardUpdateSchema
  } = await import('@/lib/postcards/manage');

  const canEditAny = isManagerOrAboveRole(actor.role);
  if (canEditAny) {
    const reportCaseStatus = await findAdminEditableReportCaseStateByPostcardId(postcardId);
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
      action:
        body && typeof body === 'object' && 'crop' in body ? 'POSTCARD_CROP_EDIT' : 'POSTCARD_EDIT',
      metadata: {
        postcardId
      }
    });

    if (body && typeof body === 'object' && 'crop' in body) {
      const payload = cropUpdateSchema.parse(body);
      const result = await applyPostcardCropUpdate({
        postcardId,
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
      postcardId,
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

export async function softDeletePostcardLocal(args: {
  request: Request;
  postcardId: string;
  actorId: string;
}): Promise<NextResponse> {
  const { request, postcardId, actorId } = args;
  const { softDeletePostcard } = await import('@/lib/postcards/manage');

  await recordUserAction({
    request,
    userId: actorId,
    action: 'POSTCARD_SOFT_DELETE',
    metadata: {
      postcardId
    }
  });

  const deleted = await softDeletePostcard({
    postcardId,
    actorId
  });

  if (!deleted) {
    return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function submitPostcardFeedbackLocal(args: {
  request: Request;
  postcardId: string;
  actorId: string;
}): Promise<NextResponse> {
  const { request, postcardId, actorId } = args;

  try {
    const body = postcardFeedbackSchema.parse(await request.json()) as {
      action: FeedbackInputAction;
      reason?: FeedbackReportReasonInput;
      description?: string;
    };
    await recordUserAction({
      request,
      userId: actorId,
      action: 'POSTCARD_FEEDBACK',
      metadata: {
        postcardId,
        feedbackAction: body.action,
        reportReason: body.reason ?? null
      }
    });

    const postcard = await submitPostcardFeedback({
      postcardId,
      userId: actorId,
      action: body.action,
      reportReason: body.reason,
      reportDescription: body.description ?? null
    });

    if (!postcard) {
      return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
    }

    return NextResponse.json(postcard, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to submit feedback.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}
