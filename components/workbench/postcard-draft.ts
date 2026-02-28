import type { PostcardEditDraft, PostcardRecord } from '@/components/workbench/types';

type PostcardDraftSource = Pick<
  PostcardRecord,
  'title' | 'postcardType' | 'notes' | 'placeName' | 'latitude' | 'longitude'
>;

export function buildPostcardDraftValues(postcard: PostcardDraftSource): PostcardEditDraft {
  return {
    title: postcard.title ?? '',
    postcardType: postcard.postcardType ?? 'UNKNOWN',
    notes: postcard.notes ?? '',
    placeName: postcard.placeName ?? '',
    locationInput:
      typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number'
        ? `${postcard.latitude.toFixed(6)}, ${postcard.longitude.toFixed(6)}`
        : ''
  };
}
