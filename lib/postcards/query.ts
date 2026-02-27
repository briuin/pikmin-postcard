import { Prisma } from '@prisma/client';
import { z } from 'zod';

export const publicQuerySchema = z
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

export type PublicQuery = z.infer<typeof publicQuerySchema>;

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

export function parsePublicQuery(url: URL) {
  return publicQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    sort: url.searchParams.get('sort') ?? undefined,
    north: url.searchParams.get('north') ?? undefined,
    south: url.searchParams.get('south') ?? undefined,
    east: url.searchParams.get('east') ?? undefined,
    west: url.searchParams.get('west') ?? undefined
  });
}

export function buildPublicWhere(query: PublicQuery): Prisma.PostcardWhereInput {
  const whereAnd: Prisma.PostcardWhereInput[] = [{ deletedAt: null }];

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
    const latitudeFilter: Prisma.PostcardWhereInput = {
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

  return { AND: whereAnd };
}

export function buildPublicOrderBy(sort: PublicQuery['sort']): Prisma.PostcardOrderByWithRelationInput[] {
  if (sort === 'newest') {
    return [{ createdAt: 'desc' }];
  }

  if (sort === 'likes') {
    return [{ likeCount: 'desc' }, { createdAt: 'desc' }];
  }

  if (sort === 'reports') {
    return [{ wrongLocationReports: 'desc' }, { createdAt: 'desc' }];
  }

  return [
    { likeCount: 'desc' },
    { dislikeCount: 'asc' },
    { wrongLocationReports: 'asc' },
    { createdAt: 'desc' }
  ];
}
