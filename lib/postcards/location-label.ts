type LocationParts = {
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

export function buildLocationLabel(parts: LocationParts, unknownLabel: string): string {
  const values = [parts.city, parts.state, parts.country]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);

  if (values.length > 0) {
    return values.join(', ');
  }

  return unknownLabel;
}
