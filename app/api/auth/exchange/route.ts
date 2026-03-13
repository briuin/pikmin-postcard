import { NextResponse } from 'next/server';
import { UserRole } from '@/lib/domain/enums';
import { createAppJwt, toAuthResponseUser } from '@/lib/auth-server';
import { listPremiumFeatureIds } from '@/lib/premium-feature-settings';
import { userRepo } from '@/lib/repos/users';
import { roleForEmail } from '@/lib/user-role';

type GoogleTokenInfo = {
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  exp?: string | number;
  iss?: string;
  name?: string;
  sub?: string;
};

async function verifyGoogleIdToken(idToken: string): Promise<{
  email: string;
  name: string | null;
  sub: string;
}> {
  const runtimeEnv = process.env as Record<string, string | undefined>;
  const clientId = (
    runtimeEnv.GOOGLE_CLIENT_ID ??
    runtimeEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
    ''
  ).trim();
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured.');
  }

  const endpoint = new URL('https://oauth2.googleapis.com/tokeninfo');
  endpoint.searchParams.set('id_token', idToken);
  const response = await fetch(endpoint.toString(), {
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error('Google token verification failed.');
  }

  const payload = (await response.json()) as GoogleTokenInfo;
  if (String(payload.aud || '') !== clientId) {
    throw new Error('Google token audience is invalid.');
  }
  if (
    String(payload.iss || '').length > 0 &&
    payload.iss !== 'https://accounts.google.com' &&
    payload.iss !== 'accounts.google.com'
  ) {
    throw new Error('Google token issuer is invalid.');
  }
  const email = String(payload.email || '').trim().toLowerCase();
  const emailVerifiedValue = payload.email_verified;
  const isVerified =
    emailVerifiedValue === true || String(emailVerifiedValue || '').toLowerCase() === 'true';
  if (!email || !isVerified) {
    throw new Error('Google account email is not verified.');
  }

  const exp = Number(payload.exp || 0);
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) {
    throw new Error('Google token expired.');
  }

  const sub = String(payload.sub || '').trim();
  if (!sub) {
    throw new Error('Google token subject is missing.');
  }

  const name = typeof payload.name === 'string' && payload.name.trim().length > 0 ? payload.name.trim() : null;
  return { email, name, sub };
}

export async function POST(request: Request) {
  try {
    const runtimeEnv = process.env as Record<string, string | undefined>;
    const secret = (runtimeEnv.APP_JWT_SECRET ?? '').trim();
    if (!secret) {
      return NextResponse.json(
        { error: 'APP_JWT_SECRET is not configured.' },
        { status: 500 }
      );
    }

    const body = (await request.json()) as { idToken?: unknown };
    const idToken = typeof body?.idToken === 'string' ? body.idToken.trim() : '';
    if (!idToken) {
      return NextResponse.json({ error: 'idToken is required.' }, { status: 400 });
    }

    const googleIdentity = await verifyGoogleIdToken(idToken);
    const user = await userRepo.upsertByEmail({
      email: googleIdentity.email,
      displayName: googleIdentity.name,
      forceAdmin: roleForEmail(googleIdentity.email) === UserRole.ADMIN
    });

    const premiumFeatureIds = await listPremiumFeatureIds();
    const token = createAppJwt(
      {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        accountId: user.accountId,
        role: user.role,
        approvalStatus: user.approvalStatus,
        canUsePlantPaths: user.canUsePlantPaths,
        hasPremiumAccess: user.hasPremiumAccess,
        premiumFeatureIds
      },
      secret
    );

    return NextResponse.json(
      {
        token,
        user: toAuthResponseUser({
          ...user,
          premiumFeatureIds
        })
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to exchange Google token.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 401 }
    );
  }
}
