import { Prisma } from '@prisma/client';
import { deriveOriginalImageUrl, maskEmail } from '@/lib/postcards/shared';

const postcardListSelectBase = {
  id: true,
  userId: true,
  title: true,
  postcardType: true,
  notes: true,
  imageUrl: true,
  capturedAt: true,
  city: true,
  state: true,
  country: true,
  placeName: true,
  latitude: true,
  longitude: true,
  aiLatitude: true,
  aiLongitude: true,
  aiConfidence: true,
  aiPlaceGuess: true,
  likeCount: true,
  dislikeCount: true,
  wrongLocationReports: true,
  reportVersion: true,
  locationStatus: true,
  locationModelVersion: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: { email: true, displayName: true }
  },
  tags: {
    include: {
      tag: true
    }
  }
} as const;

export const postcardListSelectWithOriginalImageUrl = {
  ...postcardListSelectBase,
  originalImageUrl: true
} satisfies Prisma.PostcardSelect;

export const postcardListSelectWithoutOriginalImageUrl = postcardListSelectBase satisfies Prisma.PostcardSelect;

type SerializablePostcard = {
  id: string;
  user?: { email: string; displayName?: string | null } | null;
  imageUrl?: string | null;
  originalImageUrl?: string | null;
  [key: string]: unknown;
};

export function serializePostcards(
  postcards: SerializablePostcard[],
  options: { includeOriginalImageUrl?: boolean } = {}
) {
  const includeOriginalImageUrl = options.includeOriginalImageUrl ?? false;

  return postcards.map((postcard) => {
    const { user, originalImageUrl, ...rest } = postcard;
    return {
      ...rest,
      ...(includeOriginalImageUrl
        ? {
            originalImageUrl:
              originalImageUrl ?? deriveOriginalImageUrl(postcard.imageUrl)
          }
        : {}),
      uploaderName: user?.displayName?.trim() || maskEmail(user?.email)
    };
  });
}
