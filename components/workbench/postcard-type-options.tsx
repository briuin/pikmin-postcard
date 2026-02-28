import type { WorkbenchText } from '@/lib/i18n';

type PostcardTypeOptionsProps = {
  text: Pick<
    WorkbenchText,
    | 'postcardTypeMushroom'
    | 'postcardTypeFlower'
    | 'postcardTypeExploration'
    | 'postcardTypeUnknown'
  >;
  includePlaceholder?: boolean;
  placeholderLabel?: string;
};

export function PostcardTypeOptions({
  text,
  includePlaceholder = false,
  placeholderLabel
}: PostcardTypeOptionsProps) {
  return (
    <>
      {includePlaceholder ? <option value="">{placeholderLabel ?? 'Select type'}</option> : null}
      <option value="MUSHROOM">{text.postcardTypeMushroom}</option>
      <option value="FLOWER">{text.postcardTypeFlower}</option>
      <option value="EXPLORATION">{text.postcardTypeExploration}</option>
      <option value="UNKNOWN">{text.postcardTypeUnknown}</option>
    </>
  );
}
