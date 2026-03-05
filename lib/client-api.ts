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

export function getServerlessApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SERVERLESS_API_BASE_URL ?? '').trim().replace(/\/$/, '');
}

function mapInternalApiPathToServerless(path: string): string | null {
  const normalized = path.trim();

  if (/^\/api\/postcards(?:\/.*)?$/.test(normalized)) {
    return normalized.replace(/^\/api/, '');
  }
  if (/^\/api\/profile$/.test(normalized)) {
    return '/profile';
  }
  if (/^\/api\/reports(?:\/.*)?$/.test(normalized)) {
    return normalized.replace(/^\/api/, '');
  }
  if (/^\/api\/admin\/users$/.test(normalized)) {
    return '/admin/users';
  }
  if (/^\/api\/admin\/postcards$/.test(normalized)) {
    return '/admin/postcards';
  }
  if (/^\/api\/admin\/feedback$/.test(normalized)) {
    return '/admin/feedback';
  }
  if (/^\/api\/admin\/reports(?:\/.*)?$/.test(normalized)) {
    return normalized.replace(/^\/api/, '');
  }
  if (/^\/api\/feedback$/.test(normalized)) {
    return '/feedback';
  }
  if (/^\/api\/location-from-image$/.test(normalized)) {
    return '/location-from-image';
  }
  if (/^\/api\/upload-image$/.test(normalized)) {
    return '/upload-image';
  }
  if (/^\/api\/auth\/exchange$/.test(normalized)) {
    return '/auth/exchange';
  }
  if (/^\/api\/auth\/session$/.test(normalized)) {
    return '/auth/session';
  }

  return null;
}

export function buildApiUrl(path: string, context: ApiFetchContext = {}): string {
  const base = getServerlessApiBaseUrl();
  if (!base || context.forceInternal) {
    return path;
  }

  const mappedPath = mapInternalApiPathToServerless(path);
  if (!mappedPath) {
    return path;
  }

  return `${base}${mappedPath}`;
}

export function isServerlessApiUrl(url: string): boolean {
  const base = getServerlessApiBaseUrl();
  return Boolean(base) && url.startsWith(base);
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

  if (isServerlessApiUrl(url)) {
    if (!bearerToken) {
      if (context.userId) {
        headers.set('x-user-id', context.userId);
      }
      if (context.userEmail) {
        headers.set('x-user-email', context.userEmail);
      }
    }
  }

  return fetch(url, {
    ...init,
    headers
  });
}
