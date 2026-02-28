import type { PercentCrop } from 'react-image-crop';
import { deriveOriginalImageUrl } from '@/lib/postcards/image-url';

export type LocationParseText = {
  parseLocationTwoNumbers: string;
  parseLocationNumeric: string;
  parseLocationRange: string;
};

export type CropDraft = PercentCrop;

export function parseLocationInput(input: string, text: LocationParseText): { latitude: number; longitude: number } {
  const parts = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length !== 2) {
    throw new Error(text.parseLocationTwoNumbers);
  }

  const first = Number(parts[0]);
  const second = Number(parts[1]);

  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    throw new Error(text.parseLocationNumeric);
  }

  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
    return { latitude: first, longitude: second };
  }

  if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
    return { latitude: second, longitude: first };
  }

  throw new Error(text.parseLocationRange);
}

export { deriveOriginalImageUrl };

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizePercentCrop(crop: Partial<PercentCrop>, fallback: CropDraft): CropDraft {
  const x = clampNumber(crop.x ?? fallback.x ?? 0, 0, 99);
  const y = clampNumber(crop.y ?? fallback.y ?? 0, 0, 99);

  let width = clampNumber(crop.width ?? fallback.width ?? 50, 1, 100);
  let height = clampNumber(crop.height ?? fallback.height ?? 50, 1, 100);

  if (x + width > 100) {
    width = Math.max(1, 100 - x);
  }
  if (y + height > 100) {
    height = Math.max(1, 100 - y);
  }

  return {
    unit: '%',
    x,
    y,
    width,
    height
  };
}

export function toNormalizedCrop(crop: CropDraft): { x: number; y: number; width: number; height: number } {
  const sanitized = sanitizePercentCrop(crop, crop);
  const x = clampNumber(sanitized.x ?? 0, 0, 95);
  const y = clampNumber(sanitized.y ?? 0, 0, 95);
  const maxWidth = Math.max(5, 100 - x);
  const maxHeight = Math.max(5, 100 - y);
  const width = clampNumber(sanitized.width ?? 84, 5, maxWidth);
  const height = clampNumber(sanitized.height ?? 54, 5, maxHeight);

  return {
    x: Number((x / 100).toFixed(6)),
    y: Number((y / 100).toFixed(6)),
    width: Number((width / 100).toFixed(6)),
    height: Number((height / 100).toFixed(6))
  };
}
