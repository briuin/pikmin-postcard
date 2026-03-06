import { NextRequest, NextResponse } from 'next/server';
import { mapInternalApiPathToServerless } from '@/lib/backend/api-path-map';

const APP_BACKEND_MODE = (process.env.APP_BACKEND_MODE ?? '')
  .trim()
  .toLowerCase();
const SERVERLESS_API_BASE_URL = (
  process.env.SERVERLESS_API_BASE_URL ?? ''
)
  .trim()
  .replace(/\/$/, '');
const SHOULD_PROXY_TO_SERVERLESS =
  APP_BACKEND_MODE === 'proxy' ||
  APP_BACKEND_MODE === 'external' ||
  APP_BACKEND_MODE === 'serverless' ||
  (!APP_BACKEND_MODE && Boolean(SERVERLESS_API_BASE_URL));

export function middleware(request: NextRequest) {
  if (!SHOULD_PROXY_TO_SERVERLESS || !SERVERLESS_API_BASE_URL) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  const mappedPath = mapInternalApiPathToServerless(`${pathname}${search}`);
  if (!mappedPath) {
    return NextResponse.next();
  }

  const destination = new URL(`${SERVERLESS_API_BASE_URL}${mappedPath}`);
  return NextResponse.rewrite(destination);
}

export const config = {
  matcher: ['/api/:path*']
};
