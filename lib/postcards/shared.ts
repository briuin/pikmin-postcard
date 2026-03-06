import { deriveOriginalImageUrl } from '@/lib/postcards/image-url';

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    return 'hidden';
  }

  const [local, domain] = parts;
  const maskedLocal = local.length <= 2 ? `${local[0] ?? '*'}*` : `${local.slice(0, 2)}***`;

  const domainParts = domain.split('.');
  const root = domainParts[0] ?? '';
  const tld = domainParts.slice(1).join('.') || '***';
  const maskedRoot = root.length <= 1 ? '*' : `${root[0]}***`;

  return `${maskedLocal}@${maskedRoot}.${tld}`;
}

export { deriveOriginalImageUrl };

export function hasMissingOriginalImageColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const errorCode = String((error as { code?: unknown }).code ?? '');
  if (errorCode !== 'P2022') {
    return false;
  }

  const meta = (error as { meta?: { column?: string } }).meta;
  const column = String(meta?.column ?? '');
  return column.includes('originalImageUrl');
}
