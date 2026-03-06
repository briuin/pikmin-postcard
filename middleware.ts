import { NextRequest, NextResponse } from 'next/server';
import { mapInternalApiPathToServerless } from '@/lib/backend/api-path-map';
import {
  resolveServerlessApiBaseUrl,
  shouldProxyToServerless
} from '@/lib/backend/backend-mode';

const SERVERLESS_API_BASE_URL = resolveServerlessApiBaseUrl();
const SHOULD_PROXY_TO_SERVERLESS = shouldProxyToServerless();

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
