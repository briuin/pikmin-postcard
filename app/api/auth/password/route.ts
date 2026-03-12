import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  hashPassword
} from '@/lib/auth-server';
import { getAuthenticatedIdentity, getAuthenticatedUserId } from '@/lib/api-auth';
import { userRepo } from '@/lib/repos/users';
import { recordUserAction } from '@/lib/user-action-log';

const passwordSchema = z.object({
  password: z.string().min(AUTH_PASSWORD_MIN_LENGTH).max(AUTH_PASSWORD_MAX_LENGTH)
});

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId({ createIfMissing: true });
    const identity = await getAuthenticatedIdentity();
    if (!userId || !identity?.email) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const payload = passwordSchema.parse(await request.json());
    const password = payload.password;

    const hashed = hashPassword(password);
    const user = await userRepo.updatePasswordById(userId, hashed.hash, hashed.salt);
    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    await recordUserAction({
      request,
      userId,
      action: 'PASSWORD_UPDATE',
      metadata: {
        accountId: user.accountId,
        via: 'website'
      }
    });

    return NextResponse.json(
      {
        accountId: user.accountId,
        hasPassword: user.hasPassword
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update password.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}
