import { NextRequest, NextResponse } from 'next/server';
import { mapInternalApiPathToServerless } from '@/lib/backend/api-path-map';

const SERVERLESS_API_BASE_URL = (
  process.env.NEXT_PUBLIC_SERVERLESS_API_BASE_URL ?? ''
)
  .trim()
  .replace(/\/$/, '');

export function middleware(request: NextRequest) {
  if (!SERVERLESS_API_BASE_URL) {
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
