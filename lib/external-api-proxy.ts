export function getExternalServerlessApiBase(): string | null {
  const raw =
    process.env.SERVERLESS_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SERVERLESS_API_BASE_URL?.trim() ||
    '';
  if (!raw) {
    return null;
  }

  return raw.replace(/\/$/, '');
}

export function isExternalServerlessApiEnabled(): boolean {
  const mode = (process.env.NEXT_PUBLIC_USE_EXTERNAL_SERVERLESS_API ?? '').trim().toLowerCase();
  if (mode === 'false') {
    return false;
  }

  return Boolean(getExternalServerlessApiBase());
}

export async function proxyExternalApiGet(path: string): Promise<Response | null> {
  if (!isExternalServerlessApiEnabled()) {
    return null;
  }

  const base = getExternalServerlessApiBase();
  if (!base) {
    return null;
  }

  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store'
  });
  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
      'cache-control': response.headers.get('cache-control') ?? 'no-store'
    }
  });
}
