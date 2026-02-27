import { Prisma } from '@prisma/client';

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

export function deriveOriginalImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) {
    return null;
  }

  if (imageUrl.includes('/uploads/original/')) {
    return imageUrl;
  }

  if (imageUrl.includes('/uploads/postcard/')) {
    const fileName = imageUrl.split('/').pop()?.toLowerCase() ?? '';
    if (fileName.includes('recrop-')) {
      return null;
    }
    return imageUrl.replace('/uploads/postcard/', '/uploads/original/');
  }

  return null;
}

export function hasMissingOriginalImageColumnError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  if (error.code !== 'P2022') {
    return false;
  }

  const column = String((error.meta as { column?: string } | undefined)?.column ?? '');
  return column.includes('originalImageUrl');
}
