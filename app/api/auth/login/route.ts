import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  createAppJwt,
  toAuthResponseUser,
  verifyPassword
} from '@/lib/auth-server';
import { listPremiumFeatureIds } from '@/lib/premium-feature-settings';
import { userRepo } from '@/lib/repos/users';

const loginSchema = z.object({
  accountId: z.string().trim().min(1).max(60),
  password: z.string().min(AUTH_PASSWORD_MIN_LENGTH).max(AUTH_PASSWORD_MAX_LENGTH)
});

const INVALID_CREDENTIALS_MESSAGE = 'Invalid account ID or password.';

export async function POST(request: Request) {
  try {
    const runtimeEnv = process.env as Record<string, string | undefined>;
    const secret = (runtimeEnv.APP_JWT_SECRET ?? '').trim();
    if (!secret) {
      return NextResponse.json({ error: 'APP_JWT_SECRET is not configured.' }, { status: 500 });
    }

    const payload = loginSchema.parse(await request.json());
    const user = await userRepo.findAuthByAccountId(payload.accountId);
    if (!user?.passwordHash || !user.passwordSalt) {
      return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
    }

    const valid = verifyPassword(payload.password, user.passwordHash, user.passwordSalt);
    if (!valid) {
      return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
    }

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
        error: 'Failed to sign in.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}
