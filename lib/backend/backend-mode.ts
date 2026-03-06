export type AppBackendMode = 'local' | 'proxy';

type EnvLike = Record<string, string | undefined>;

function clean(value: string | undefined): string {
  return String(value ?? '').trim();
}

export function resolveServerlessApiBaseUrl(env: EnvLike = process.env): string {
  return clean(env.SERVERLESS_API_BASE_URL).replace(/\/$/, '');
}

export function parseAppBackendMode(rawValue: string | undefined): AppBackendMode | null {
  const mode = clean(rawValue).toLowerCase();
  if (!mode) {
    return null;
  }
  if (mode === 'local' || mode === 'internal') {
    return 'local';
  }
  if (mode === 'proxy' || mode === 'external' || mode === 'serverless') {
    return 'proxy';
  }
  return null;
}

export function resolveAppBackendMode(env: EnvLike = process.env): AppBackendMode {
  const explicit = parseAppBackendMode(env.APP_BACKEND_MODE);
  if (explicit) {
    return explicit;
  }
  return resolveServerlessApiBaseUrl(env) ? 'proxy' : 'local';
}

export function shouldProxyToServerless(env: EnvLike = process.env): boolean {
  return resolveAppBackendMode(env) === 'proxy' && Boolean(resolveServerlessApiBaseUrl(env));
}
