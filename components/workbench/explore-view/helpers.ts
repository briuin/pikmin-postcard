import type { PostcardRecord } from '@/components/workbench/types';
import { buildLocationLabel } from '@/lib/postcards/location-label';

export function isAiDetected(postcard: PostcardRecord): boolean {
  return (
    postcard.locationStatus === 'AUTO' ||
    postcard.locationStatus === 'USER_CONFIRMED' ||
    typeof postcard.aiConfidence === 'number' ||
    Boolean(postcard.aiPlaceGuess)
  );
}

export function getPostcardPlaceLabel(
  postcard: Pick<PostcardRecord, 'city' | 'state' | 'country'>,
  unknownPlaceLabel: string
): string {
  return buildLocationLabel(postcard, unknownPlaceLabel);
}
