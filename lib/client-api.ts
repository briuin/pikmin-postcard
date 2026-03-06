export type ApiFetchContext = {
  userId?: string | null;
  userEmail?: string | null;
  bearerToken?: string | null;
  forceInternal?: boolean;
};

const AUTH_TOKEN_STORAGE_KEY = 'pikmin_auth_token';
let inMemoryAuthToken: string | null = null;

export function setClientAuthToken(token: string | null): void {
  const normalized = token?.trim() || null;
  inMemoryAuthToken = normalized;
  if (typeof window === 'undefined') {
    return;
  }
  if (!normalized) {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, normalized);
}

export function getClientAuthToken(): string | null {
  if (inMemoryAuthToken) {
    return inMemoryAuthToken;
  }
  if (typeof window === 'undefined') {
    return null;
  }
  const fromStorage = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  inMemoryAuthToken = fromStorage?.trim() || null;
  return inMemoryAuthToken;
}

export function clearClientAuthToken(): void {
  setClientAuthToken(null);
}

export function buildApiUrl(path: string, context: ApiFetchContext = {}): string {
  if (context.forceInternal) {
    return path;
  }
  return path;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  context: ApiFetchContext = {}
): Promise<Response> {
  const url = buildApiUrl(path, context);
  const headers = new Headers(init.headers ?? undefined);
  const bearerToken = context.bearerToken ?? getClientAuthToken();

  if (bearerToken) {
    headers.set('Authorization', `Bearer ${bearerToken}`);
  }

  return fetch(url, {
    ...init,
    headers
  });
}
