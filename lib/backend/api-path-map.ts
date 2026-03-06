type InternalApiProxyRule = {
  pattern: RegExp;
  toServerless: (pathname: string) => string;
};

const API_PREFIX_PATTERN = /^\/api/;
const API_PROXY_RULES: InternalApiProxyRule[] = [
  {
    pattern: /^\/api\/postcards(?:\/.*)?$/,
    toServerless: (pathname) => pathname.replace(API_PREFIX_PATTERN, '')
  },
  {
    pattern: /^\/api\/reports(?:\/.*)?$/,
    toServerless: (pathname) => pathname.replace(API_PREFIX_PATTERN, '')
  },
  {
    pattern: /^\/api\/admin\/reports(?:\/.*)?$/,
    toServerless: (pathname) => pathname.replace(API_PREFIX_PATTERN, '')
  },
  {
    pattern: /^\/api\/upload-image$/,
    toServerless: () => '/upload-image'
  },
  {
    pattern: /^\/api\/location-from-image$/,
    toServerless: () => '/location-from-image'
  },
  {
    pattern: /^\/api\/profile$/,
    toServerless: () => '/profile'
  },
  {
    pattern: /^\/api\/admin\/users$/,
    toServerless: () => '/admin/users'
  },
  {
    pattern: /^\/api\/admin\/postcards$/,
    toServerless: () => '/admin/postcards'
  },
  {
    pattern: /^\/api\/admin\/feedback$/,
    toServerless: () => '/admin/feedback'
  },
  {
    pattern: /^\/api\/feedback$/,
    toServerless: () => '/feedback'
  },
  {
    pattern: /^\/api\/auth\/exchange$/,
    toServerless: () => '/auth/exchange'
  },
  {
    pattern: /^\/api\/auth\/session$/,
    toServerless: () => '/auth/session'
  }
];

function parsePathAndQuery(value: string): { pathname: string; search: string } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('/')) {
    const [pathname = '', search = ''] = trimmed.split('?', 2);
    return {
      pathname,
      search: search ? `?${search}` : ''
    };
  }

  try {
    const parsed = new URL(trimmed);
    return {
      pathname: parsed.pathname,
      search: parsed.search
    };
  } catch {
    return null;
  }
}

export function isProxyableInternalApiPath(pathname: string): boolean {
  const normalized = pathname.trim();
  if (!normalized) {
    return false;
  }
  return API_PROXY_RULES.some((rule) => rule.pattern.test(normalized));
}

export function mapInternalApiPathToServerless(path: string): string | null {
  const parsed = parsePathAndQuery(path);
  if (!parsed) {
    return null;
  }
  const rule = API_PROXY_RULES.find((item) => item.pattern.test(parsed.pathname));
  if (!rule) {
    return null;
  }
  const mappedPath = rule.toServerless(parsed.pathname);
  return `${mappedPath}${parsed.search}`;
}
