import type { PostcardRecord } from '@/components/workbench/types';

export function isAiDetected(postcard: PostcardRecord): boolean {
  return (
    postcard.locationStatus === 'AUTO' ||
    postcard.locationStatus === 'USER_CONFIRMED' ||
    typeof postcard.aiConfidence === 'number' ||
    Boolean(postcard.aiPlaceGuess)
  );
}
