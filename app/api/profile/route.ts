import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedIdentity, getAuthenticatedUserId } from '@/lib/api-auth';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import { userRepo } from '@/lib/repos/users';
import { recordUserAction } from '@/lib/user-action-log';

const profilePatchSchema = z.object({
  displayName: z.string().trim().min(1).max(60)
});

export async function GET(request: Request) {
  return withOptionalExternalApiProxy({
    request,
    path: '/profile',
    runLocal: async () => {
      const userId = await getAuthenticatedUserId({ createIfMissing: true });
      const identity = await getAuthenticatedIdentity();
      if (!userId || !identity?.email) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
      }

      await recordUserAction({
        request,
        userId,
        action: 'PROFILE_GET'
      });

      const user = await userRepo.findById(userId);

      return NextResponse.json(
        {
          email: user?.email ?? identity.email,
          displayName: user?.displayName ?? identity.name ?? null
        },
        { status: 200 }
      );
    }
  });
}

export async function PATCH(request: Request) {
  return withOptionalExternalApiProxy({
    request,
    path: '/profile',
    runLocal: async () => {
      const userId = await getAuthenticatedUserId({ createIfMissing: true });
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
      }

      try {
        const payload = profilePatchSchema.parse(await request.json());
        await recordUserAction({
          request,
          userId,
          action: 'PROFILE_UPDATE',
          metadata: {
            hasDisplayName: payload.displayName.length > 0
          }
        });

        const user = await userRepo.updateDisplayNameById(userId, payload.displayName);
        if (!user) {
          return NextResponse.json({ error: 'User not found.' }, { status: 404 });
        }

        return NextResponse.json(
          {
            email: user.email,
            displayName: user.displayName
          },
          { status: 200 }
        );
      } catch (error) {
        return NextResponse.json(
          {
            error: 'Failed to update profile.',
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          { status: 400 }
        );
      }
    }
  });
}
