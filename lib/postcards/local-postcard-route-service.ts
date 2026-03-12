import {
  LocationStatus,
  PostcardType,
  PostcardReportStatus,
  UserRole
} from '@/lib/domain/enums';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isManagerOrAboveRole } from '@/lib/api-auth';
import {
  attachViewerFeedback,
  findViewerFeedbackRowsForPostcards
} from '@/lib/postcards/feedback';
import { postcardRepo, type CreatePostcardInput } from '@/lib/repos/postcards';
import {
  type FeedbackReportReasonInput,
  submitPostcardFeedback,
  type FeedbackInputAction
} from '@/lib/postcards/feedback-mutations';
import { serializePostcards } from '@/lib/postcards/list';
import type { GeoBounds } from '@/lib/postcards/geo';
import {
  isRandomPublicSort,
  parsePublicQuery,
  type PublicQuery
} from '@/lib/postcards/query';
import {
  findPostcardById,
  findPublicPostcards,
  findPostcardsForList
} from '@/lib/postcards/repository';
import { findAdminEditableReportCaseStateByPostcardId } from '@/lib/postcards/report-workflow';
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

type PublicPostcardsCacheEntry = {
  expiresAt: number;
  payload: {
    items: Array<Record<string, unknown>>;
    total: number;
    hasMore: boolean;
    limit: number;
    sort: PublicQuery['sort'];
  };
};

const PUBLIC_POSTCARDS_CACHE = new Map<string, PublicPostcardsCacheEntry>();
const PUBLIC_POSTCARDS_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.POSTCARD_PUBLIC_CACHE_TTL_SECONDS || 15) * 1000
);
const PUBLIC_POSTCARDS_CACHE_MAX_ENTRIES = Math.max(
  40,
  Number(process.env.POSTCARD_PUBLIC_CACHE_MAX_ENTRIES || 200)
);

function normalizeCacheNumber(value: number): string {
  return Number(value.toFixed(6)).toFixed(6);
}

function buildPublicPostcardsCacheKey(query: PublicQuery): string {
  return [
    `q=${query.q || ''}`,
    `sort=${query.sort}`,
    `limit=${query.limit}`,
    `north=${normalizeCacheNumber(query.north)}`,
    `south=${normalizeCacheNumber(query.south)}`,
    `east=${normalizeCacheNumber(query.east)}`,
    `west=${normalizeCacheNumber(query.west)}`
  ].join('&');
}

function getPublicPostcardsCache(
  key: string
): PublicPostcardsCacheEntry['payload'] | null {
  if (PUBLIC_POSTCARDS_CACHE_TTL_MS <= 0) {
    return null;
  }
  const now = Date.now();
  const cached = PUBLIC_POSTCARDS_CACHE.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= now) {
    PUBLIC_POSTCARDS_CACHE.delete(key);
    return null;
  }
  return cached.payload;
}

function setPublicPostcardsCache(
  key: string,
  payload: PublicPostcardsCacheEntry['payload']
): void {
  if (PUBLIC_POSTCARDS_CACHE_TTL_MS <= 0) {
    return;
  }
  const now = Date.now();
  PUBLIC_POSTCARDS_CACHE.set(key, {
    expiresAt: now + PUBLIC_POSTCARDS_CACHE_TTL_MS,
    payload
  });

  if (PUBLIC_POSTCARDS_CACHE.size <= PUBLIC_POSTCARDS_CACHE_MAX_ENTRIES) {
    return;
  }

  const entries = Array.from(PUBLIC_POSTCARDS_CACHE.entries()).sort(
    (left, right) => left[1].expiresAt - right[1].expiresAt
  );
  for (
    let index = 0;
    index < entries.length - PUBLIC_POSTCARDS_CACHE_MAX_ENTRIES;
    index += 1
  ) {
    PUBLIC_POSTCARDS_CACHE.delete(entries[index][0]);
  }
}

function clearPublicPostcardsCache(): void {
  PUBLIC_POSTCARDS_CACHE.clear();
}

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
    orderBy: { createdAt: 'desc' }
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

  const orderedPostcardIds = await postcardRepo.findSavedPostcardIdsByUser({
    userId
  });

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
    }
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
  const isPublicViewer = !viewerUserId;
  const cacheKey =
    isPublicViewer && !isRandomPublicSort(query.sort)
      ? buildPublicPostcardsCacheKey(query)
      : null;
  if (cacheKey) {
    const cached = getPublicPostcardsCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        status: 200,
        headers: {
          'X-Postcards-Cache': 'HIT'
        }
      });
    }
  }

  const bounds: GeoBounds = {
    north: query.north,
    south: query.south,
    east: query.east,
    west: query.west
  };

  let postcards: Awaited<ReturnType<typeof findPublicPostcards>>['rows'] = [];
  let total = 0;
  try {
    const result = await findPublicPostcards({
      q: query.q,
      sort: query.sort,
      limit: query.limit + 1,
      bounds
    });
    postcards = result.rows;
    total = result.total;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Geo index unavailable for postcard list query.')
    ) {
      const prefix = String(process.env.DDB_TABLE_PREFIX || 'pikmin-postcard-dev');
      return NextResponse.json(
        {
          error: 'Geo index is not ready for postcard map query.',
          details: `Run: npm run ddb:provision -- --region us-east-1 --prefix ${prefix}`
        },
        { status: 503 }
      );
    }
    throw error;
  }

  const hasMore = postcards.length > query.limit;
  const items = hasMore ? postcards.slice(0, query.limit) : postcards;
  const serialized = serializePostcards(items);
  const feedbackRows = await findViewerFeedbackRowsForPostcards(
    viewerUserId,
    serialized.map((item) => item.id)
  );
  const payload = {
    items: attachViewerFeedback(serialized, feedbackRows),
    total,
    hasMore,
    limit: query.limit,
    sort: query.sort
  };
  if (cacheKey) {
    setPublicPostcardsCache(cacheKey, payload);
  }

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'X-Postcards-Cache': cacheKey ? 'MISS' : 'BYPASS'
    }
  });
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

    const createData: CreatePostcardInput = {
      userId: actorId,
      title: body.title,
      postcardType: body.postcardType,
      notes: body.notes,
      imageUrl: body.imageUrl,
      originalImageUrl: body.originalImageUrl,
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

    const postcard = await postcardRepo.create(createData);
    clearPublicPostcardsCache();

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
  const postcard = await findPostcardById(postcardId);
  if (!postcard) {
    return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
  }

  const serialized = serializePostcards([postcard]);
  return NextResponse.json(serialized[0], { status: 200 });
}

export async function updatePostcardLocal(args: {
  request: Request;
  postcardId: string;
  actor: ApprovedPostcardActor;
}): Promise<NextResponse> {
  const { request, postcardId, actor } = args;
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
    const {
      applyPostcardCropUpdate,
      applyPostcardDetailsUpdate,
      cropUpdateSchema,
      postcardUpdateSchema
    } = await import('@/lib/postcards/manage');

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
      clearPublicPostcardsCache();

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
    clearPublicPostcardsCache();

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json(
      {
        error: 'Failed to update postcard.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status }
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
  clearPublicPostcardsCache();

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
    clearPublicPostcardsCache();

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
