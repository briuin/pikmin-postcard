import { NextResponse } from 'next/server';
import { verifyAppJwt, toAuthResponseUser } from '@/lib/auth-server';
import { userRepo } from '@/lib/repos/users';

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return null;
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function GET(request: Request) {
  const runtimeEnv = process.env as Record<string, string | undefined>;
  const secret = (runtimeEnv.APP_JWT_SECRET ?? '').trim();
  const token = getBearerToken(request);
  if (!secret || !token) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const payload = verifyAppJwt(token, secret);
  if (!payload?.sub) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const user = await userRepo.findById(payload.sub);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json({ user: toAuthResponseUser(user) }, { status: 200 });
}
