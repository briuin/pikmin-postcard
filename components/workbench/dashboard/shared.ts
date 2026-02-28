import { buildPostcardDraftValues } from '@/components/workbench/postcard-draft';
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
  return buildPostcardDraftValues(postcard);
}
