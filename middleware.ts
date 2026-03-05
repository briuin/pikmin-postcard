import { NextRequest, NextResponse } from 'next/server';

const SERVERLESS_API_BASE_URL = (
  process.env.NEXT_PUBLIC_SERVERLESS_API_BASE_URL ?? ''
)
  .trim()
  .replace(/\/$/, '');

const API_PROXY_PATTERNS: RegExp[] = [
  /^\/api\/postcards(?:\/.*)?$/,
  /^\/api\/upload-image$/,
  /^\/api\/location-from-image$/,
  /^\/api\/profile$/,
  /^\/api\/reports(?:\/.*)?$/,
  /^\/api\/admin\/users$/,
  /^\/api\/admin\/postcards$/,
  /^\/api\/admin\/feedback$/,
  /^\/api\/admin\/reports(?:\/.*)?$/,
  /^\/api\/feedback$/,
  /^\/api\/auth\/exchange$/,
  /^\/api\/auth\/session$/
];

function shouldProxy(pathname: string): boolean {
  return API_PROXY_PATTERNS.some((pattern) => pattern.test(pathname));
}

function mapInternalApiPathToServerless(pathname: string): string {
  return pathname.replace(/^\/api/, '');
}

export function middleware(request: NextRequest) {
  if (!SERVERLESS_API_BASE_URL) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (!shouldProxy(pathname)) {
    return NextResponse.next();
  }

  const mappedPath = mapInternalApiPathToServerless(pathname);
  const destination = new URL(`${SERVERLESS_API_BASE_URL}${mappedPath}${search}`);
  return NextResponse.rewrite(destination);
}

export const config = {
  matcher: ['/api/:path*']
};
