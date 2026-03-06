import { z } from 'zod';
import type {
  PostcardOrderByInput,
  PostcardWhereInput
} from '@/lib/repos/postcards/types';

export const publicQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(300).default(120),
    sort: z.enum(['ranking', 'newest', 'likes', 'reports']).default('ranking'),
    north: z.coerce.number(),
    south: z.coerce.number(),
    east: z.coerce.number(),
    west: z.coerce.number()
  })
  .superRefine((value, ctx) => {
    if (value.north < value.south) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid bounds: north must be greater than south.'
      });
    }
  });

export type PublicQuery = z.infer<typeof publicQuerySchema>;

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

export function buildPostcardSearchFilter(
  searchText: string,
  options: { includeUploaderFields?: boolean } = {}
): PostcardWhereInput {
  const orConditions: PostcardWhereInput[] = [
    { title: { contains: searchText, mode: 'insensitive' } },
    { notes: { contains: searchText, mode: 'insensitive' } },
    { placeName: { contains: searchText, mode: 'insensitive' } },
    { city: { contains: searchText, mode: 'insensitive' } },
    { state: { contains: searchText, mode: 'insensitive' } },
    { country: { contains: searchText, mode: 'insensitive' } },
    { aiPlaceGuess: { contains: searchText, mode: 'insensitive' } }
  ];

  if (options.includeUploaderFields) {
    orConditions.push(
      { user: { email: { contains: searchText, mode: 'insensitive' } } },
      { user: { displayName: { contains: searchText, mode: 'insensitive' } } }
    );
  }

  return { OR: orConditions };
}

export function buildPublicOrderBy(sort: PublicQuery['sort']): PostcardOrderByInput[] {
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
