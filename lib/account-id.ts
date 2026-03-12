const ACCOUNT_ID_ALLOWED_CHARACTERS = /[^a-z0-9._+-]+/g;
const ACCOUNT_ID_EDGE_PUNCTUATION = /^[._+-]+|[._+-]+$/g;

export function normalizeAccountId(value: string | null | undefined): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(ACCOUNT_ID_ALLOWED_CHARACTERS, '-')
    .replace(/-{2,}/g, '-')
    .replace(ACCOUNT_ID_EDGE_PUNCTUATION, '')
    .slice(0, 60);

  return normalized;
}

export function deriveAccountIdFromEmail(email: string | null | undefined): string {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const localPart = normalizedEmail.split('@')[0] || normalizedEmail;
  return normalizeAccountId(localPart) || 'user';
}

export function resolveAccountId(
  value: string | null | undefined,
  fallbackEmail: string | null | undefined
): string {
  return normalizeAccountId(value) || deriveAccountIdFromEmail(fallbackEmail);
}
