import { NextResponse } from 'next/server';
import { proxyExternalApiRequest } from '@/lib/external-api-proxy';

type ProxyArgs = {
  request: Request;
  path: string;
  method?: string;
};

export async function proxyOrServerError(args: ProxyArgs): Promise<Response> {
  const proxied = await proxyExternalApiRequest(args);
  if (proxied) {
    return proxied;
  }

  return NextResponse.json(
    { error: 'External serverless backend is not configured.' },
    { status: 500 }
  );
}
