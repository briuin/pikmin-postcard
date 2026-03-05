export type ApiFetchContext = {
  userId?: string | null;
  userEmail?: string | null;
  forceInternal?: boolean;
};

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
  if (/^\/api\/feedback$/.test(normalized)) {
    return '/feedback';
  }
  if (/^\/api\/location-from-image$/.test(normalized)) {
    return '/location-from-image';
  }
  if (/^\/api\/upload-image$/.test(normalized)) {
    return '/upload-image';
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

  if (isServerlessApiUrl(url)) {
    if (context.userId) {
      headers.set('x-user-id', context.userId);
    }
    if (context.userEmail) {
      headers.set('x-user-email', context.userEmail);
    }
  }

  return fetch(url, {
    ...init,
    headers
  });
}
