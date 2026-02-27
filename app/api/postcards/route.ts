import { LocationStatus, Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

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

function maskEmail(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    return 'hidden';
  }

  const [local, domain] = parts;
  const maskedLocal = local.length <= 2 ? `${local[0] ?? '*'}*` : `${local.slice(0, 2)}***`;

  const domainParts = domain.split('.');
  const root = domainParts[0] ?? '';
  const tld = domainParts.slice(1).join('.') || '***';
  const maskedRoot = root.length <= 1 ? '*' : `${root[0]}***`;

  return `${maskedLocal}@${maskedRoot}.${tld}`;
}

function serializePostcards(
  postcards: Array<{
    user?: { email: string } | null;
    [key: string]: unknown;
  }>,
  options: { includeOriginalImageUrl?: boolean } = {}
) {
  const includeOriginalImageUrl = options.includeOriginalImageUrl ?? false;
  return postcards.map((postcard) => {
    const { user, originalImageUrl, ...rest } = postcard;
    return {
      ...rest,
      ...(includeOriginalImageUrl ? { originalImageUrl } : {}),
      uploaderMasked: maskEmail(user?.email)
    };
  });
}

function clampLatitude(value: number): number {
  if (value > 90) {
    return 90;
  }
  if (value < -90) {
    return -90;
  }
  return value;
}

function normalizeLongitude(value: number): number {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

const publicQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(300).default(120),
    sort: z.enum(['ranking', 'newest', 'likes', 'reports']).default('ranking'),
    north: z.coerce.number().optional(),
    south: z.coerce.number().optional(),
    east: z.coerce.number().optional(),
    west: z.coerce.number().optional()
  })
  .superRefine((value, ctx) => {
    const hasAnyBounds =
      typeof value.north === 'number' ||
      typeof value.south === 'number' ||
      typeof value.east === 'number' ||
      typeof value.west === 'number';

    if (!hasAnyBounds) {
      return;
    }

    if (
      typeof value.north !== 'number' ||
      typeof value.south !== 'number' ||
      typeof value.east !== 'number' ||
      typeof value.west !== 'number'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Bounds must include north, south, east, and west.'
      });
      return;
    }

    if (value.north < value.south) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid bounds: north must be greater than south.'
      });
    }
  });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mineOnly = url.searchParams.get('mine') === '1';

  if (mineOnly) {
    const session = await auth();
    const userEmail = session?.user?.email;
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json([], { status: 200 });
    }

    const postcards = await prisma.postcard.findMany({
      where: {
        userId: user.id,
        deletedAt: null
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { email: true }
        },
        tags: {
          include: { tag: true }
        }
      },
      take: 200
    });

    return NextResponse.json(serializePostcards(postcards, { includeOriginalImageUrl: true }), { status: 200 });
  }

  const queryParse = publicQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    sort: url.searchParams.get('sort') ?? undefined,
    north: url.searchParams.get('north') ?? undefined,
    south: url.searchParams.get('south') ?? undefined,
    east: url.searchParams.get('east') ?? undefined,
    west: url.searchParams.get('west') ?? undefined
  });

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
  const whereAnd: Array<Record<string, unknown>> = [{ deletedAt: null }];

  if (query.q && query.q.length > 0) {
    whereAnd.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { notes: { contains: query.q, mode: 'insensitive' } },
        { placeName: { contains: query.q, mode: 'insensitive' } },
        { aiPlaceGuess: { contains: query.q, mode: 'insensitive' } }
      ]
    });
  }

  if (
    typeof query.north === 'number' &&
    typeof query.south === 'number' &&
    typeof query.east === 'number' &&
    typeof query.west === 'number'
  ) {
    const north = clampLatitude(query.north);
    const south = clampLatitude(query.south);
    const maxLat = Math.max(north, south);
    const minLat = Math.min(north, south);
    const latitudeFilter = {
      latitude: {
        not: null,
        gte: minLat,
        lte: maxLat
      }
    };

    const lonSpan = Math.abs(query.east - query.west);
    if (lonSpan >= 360) {
      whereAnd.push(latitudeFilter);
    } else {
      const west = normalizeLongitude(query.west);
      const east = normalizeLongitude(query.east);

      if (west <= east) {
        whereAnd.push({
          ...latitudeFilter,
          longitude: {
            not: null,
            gte: west,
            lte: east
          }
        });
      } else {
        whereAnd.push({
          ...latitudeFilter,
          OR: [
            {
              longitude: {
                not: null,
                gte: west,
                lte: 180
              }
            },
            {
              longitude: {
                not: null,
                gte: -180,
                lte: east
              }
            }
          ]
        });
      }
    }
  }

  const orderBy: Prisma.PostcardOrderByWithRelationInput[] =
    query.sort === 'newest'
      ? [{ createdAt: 'desc' as const }]
      : query.sort === 'likes'
        ? [{ likeCount: 'desc' as const }, { createdAt: 'desc' as const }]
        : query.sort === 'reports'
          ? [{ wrongLocationReports: 'desc' as const }, { createdAt: 'desc' as const }]
          : [
              { likeCount: 'desc' as const },
              { dislikeCount: 'asc' as const },
              { wrongLocationReports: 'asc' as const },
              { createdAt: 'desc' as const }
            ];

  const where = { AND: whereAnd };
  const [postcards, total] = await Promise.all([
    prisma.postcard.findMany({
      where,
      orderBy,
      include: {
        user: {
          select: { email: true }
        },
        tags: {
          include: {
            tag: true
          }
        }
      },
      take: query.limit + 1
    }),
    prisma.postcard.count({ where })
  ]);

  const hasMore = postcards.length > query.limit;
  const items = hasMore ? postcards.slice(0, query.limit) : postcards;

  return NextResponse.json(
    {
      items: serializePostcards(items),
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
    const session = await auth();
    const userEmail = session?.user?.email;
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = postcardCreateSchema.parse(await request.json());

    const user = await prisma.user.upsert({
      where: { email: userEmail },
      update: {},
      create: { email: userEmail }
    });

    const postcard = await prisma.postcard.create({
      data: {
        userId: user.id,
        title: body.title,
        notes: body.notes,
        imageUrl: body.imageUrl,
        originalImageUrl: body.originalImageUrl,
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
      }
    });

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
