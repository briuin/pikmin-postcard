import type { PostcardEditDraft, PostcardRecord } from '@/components/workbench/types';
import type { CropDraft } from '@/components/workbench/utils';

export const DEFAULT_CROP_DRAFT: CropDraft = {
  unit: '%',
  x: 8,
  y: 10,
  width: 84,
  height: 54
};

export function buildPostcardDraft(postcard: PostcardRecord): PostcardEditDraft {
  return {
    title: postcard.title ?? '',
    notes: postcard.notes ?? '',
    placeName: postcard.placeName ?? '',
    locationInput:
      typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number'
        ? `${postcard.latitude.toFixed(6)}, ${postcard.longitude.toFixed(6)}`
        : ''
  };
}
