import type { LocationStatus, PostcardType } from '@/lib/domain/enums';

export type EditablePostcard = {
  id: string;
  title: string;
  postcardType: PostcardType;
  notes: string | null;
  placeName: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  imageUrl: string | null;
  originalImageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  locationStatus: LocationStatus;
  deletedAt: Date | null;
};

export function toNullableText(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toEditSnapshot(postcard: EditablePostcard): Record<string, unknown> {
  return {
    title: postcard.title,
    postcardType: postcard.postcardType,
    notes: postcard.notes,
    placeName: postcard.placeName,
    city: postcard.city,
    state: postcard.state,
    country: postcard.country,
    imageUrl: postcard.imageUrl,
    originalImageUrl: postcard.originalImageUrl,
    latitude: postcard.latitude,
    longitude: postcard.longitude,
    locationStatus: postcard.locationStatus,
    deletedAt: postcard.deletedAt?.toISOString() ?? null
  };
}
