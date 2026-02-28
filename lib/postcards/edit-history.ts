import { type Prisma } from '@prisma/client';

export const postcardEditSelect = {
  id: true,
  title: true,
  notes: true,
  placeName: true,
  city: true,
  country: true,
  imageUrl: true,
  originalImageUrl: true,
  latitude: true,
  longitude: true,
  locationStatus: true,
  deletedAt: true
} as const satisfies Prisma.PostcardSelect;

export type EditablePostcard = Prisma.PostcardGetPayload<{ select: typeof postcardEditSelect }>;

export function toNullableText(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toEditSnapshot(postcard: EditablePostcard): Prisma.JsonObject {
  return {
    title: postcard.title,
    notes: postcard.notes,
    placeName: postcard.placeName,
    city: postcard.city,
    country: postcard.country,
    imageUrl: postcard.imageUrl,
    originalImageUrl: postcard.originalImageUrl,
    latitude: postcard.latitude,
    longitude: postcard.longitude,
    locationStatus: postcard.locationStatus,
    deletedAt: postcard.deletedAt?.toISOString() ?? null
  };
}
