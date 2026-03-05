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

type ProxyExternalApiRequestArgs = {
  request: Request;
  path: string;
  method?: string;
};

function buildForwardHeaders(request: Request): Headers {
  const headers = new Headers();
  const incoming = request.headers;
  const forwardKeys = ['authorization', 'content-type', 'x-user-id', 'x-user-email'] as const;

  for (const key of forwardKeys) {
    const value = incoming.get(key);
    if (value) {
      headers.set(key, value);
    }
  }

  return headers;
}

export async function proxyExternalApiRequest(
  args: ProxyExternalApiRequestArgs
): Promise<Response | null> {
  if (!isExternalServerlessApiEnabled()) {
    return null;
  }

  const base = getExternalServerlessApiBase();
  if (!base) {
    return null;
  }

  const method = (args.method ?? args.request.method ?? 'GET').toUpperCase();
  const path = args.path.startsWith('/') ? args.path : `/${args.path}`;
  const url = `${base}${path}`;
  const headers = buildForwardHeaders(args.request);
  const requestBody =
    method === 'GET' || method === 'HEAD' ? undefined : await args.request.text();

  const response = await fetch(url, {
    method,
    headers,
    body: requestBody && requestBody.length > 0 ? requestBody : undefined,
    cache: 'no-store'
  });
  const responseBody = await response.text();

  return new Response(responseBody, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
      'cache-control': response.headers.get('cache-control') ?? 'no-store'
    }
  });
}
