import { LocationStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAuthenticatedUserEmail,
  getAuthenticatedUserId,
  getUserIdByEmail
} from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import {
  attachViewerFeedback,
  findViewerFeedbackRowsForPostcards
} from '@/lib/postcards/feedback';
import { serializePostcards } from '@/lib/postcards/list';
import { buildPublicOrderBy, buildPublicWhere, parsePublicQuery } from '@/lib/postcards/query';
import { findPostcardsForList } from '@/lib/postcards/repository';
import { hasMissingOriginalImageColumnError } from '@/lib/postcards/shared';

const postcardCreateSchema = z.object({
  title: z.string().min(1),
  notes: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  originalImageUrl: z.string().url().optional(),
  city: z.string().max(120).optional(),
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mineOnly = url.searchParams.get('mine') === '1';
  const viewerUserId = await getAuthenticatedUserId();

  if (mineOnly) {
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const userId = await getUserIdByEmail(userEmail);

    if (!userId) {
      return NextResponse.json([], { status: 200 });
    }

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

    return NextResponse.json(attachViewerFeedback(serialized, feedbackRows), { status: 200 });
  }

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

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId({ createIfMissing: true });
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = postcardCreateSchema.parse(await request.json());

    const baseData = {
      userId,
      title: body.title,
      notes: body.notes,
      imageUrl: body.imageUrl,
      city: body.city,
      country: body.country,
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
