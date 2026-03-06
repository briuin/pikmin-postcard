import { deriveOriginalImageUrl, maskEmail } from '@/lib/postcards/shared';

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
