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

export function getPostcardTypeBadgeClassName(postcardType: string | null | undefined): string {
  if (postcardType === 'MUSHROOM') {
    return 'border-[#d8c6a5] bg-[#fff3de] text-[#7d5221]';
  }
  if (postcardType === 'FLOWER') {
    return 'border-[#efc4d8] bg-[#fff1f7] text-[#a1466a]';
  }
  if (postcardType === 'EXPLORATION') {
    return 'border-[#c8d8ff] bg-[#edf4ff] text-[#365ea8]';
  }
  return 'border-[#d8e1d8] bg-[#f5f8f5] text-[#5a6d60]';
}
