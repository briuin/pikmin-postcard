import type { WorkbenchText } from '@/lib/i18n';

type PostcardTypeLabelText = Pick<
  WorkbenchText,
  'postcardTypeMushroom' | 'postcardTypeFlower' | 'postcardTypeExploration' | 'postcardTypeUnknown'
>;

const defaultPostcardTypeLabelText: PostcardTypeLabelText = {
  postcardTypeMushroom: 'Mushroom',
  postcardTypeFlower: 'Flower',
  postcardTypeExploration: 'Exploration',
  postcardTypeUnknown: 'Unknown'
};

export function getPostcardTypeLabel(
  postcardType: string | null | undefined,
  text: PostcardTypeLabelText = defaultPostcardTypeLabelText
): string {
  if (postcardType === 'MUSHROOM') {
    return text.postcardTypeMushroom;
  }
  if (postcardType === 'FLOWER') {
    return text.postcardTypeFlower;
  }
  if (postcardType === 'EXPLORATION') {
    return text.postcardTypeExploration;
  }
  return text.postcardTypeUnknown;
}
