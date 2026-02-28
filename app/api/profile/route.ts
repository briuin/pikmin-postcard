import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedIdentity, getAuthenticatedUserId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { recordUserAction } from '@/lib/user-action-log';

const profilePatchSchema = z.object({
  displayName: z.string().trim().min(1).max(60)
});

export async function GET(request: Request) {
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      displayName: true
    }
  });

  return NextResponse.json(
    {
      email: user?.email ?? identity.email,
      displayName: user?.displayName ?? identity.name ?? null
    },
    { status: 200 }
  );
}

export async function PATCH(request: Request) {
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

    const user = await prisma.user.update({
      where: { id: userId },
      data: { displayName: payload.displayName },
      select: {
        email: true,
        displayName: true
      }
    });

    return NextResponse.json(user, { status: 200 });
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
