import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedIdentity, getAuthenticatedUserId } from '@/lib/api-auth';
import { apiError, getUnknownErrorDetails } from '@/lib/backend/contracts';
import { getProfileInvitationState } from '@/lib/invitations/service';
import { userRepo } from '@/lib/repos/users';
import { recordUserAction } from '@/lib/user-action-log';

const profilePatchSchema = z.object({
  displayName: z.string().trim().min(1).max(60)
});

export async function getProfileLocal(args: { request: Request }): Promise<NextResponse> {
  const { request } = args;
  const userId = await getAuthenticatedUserId({ createIfMissing: true });
  const identity = await getAuthenticatedIdentity();
  if (!userId || !identity?.email) {
    return apiError(401, 'Unauthorized.');
  }

  await recordUserAction({
    request,
    userId,
    action: 'PROFILE_GET'
  });

  const user = await userRepo.findById(userId);
  const invitationState = await getProfileInvitationState(userId);

  return NextResponse.json(
    {
      email: user?.email ?? identity.email,
      displayName: user?.displayName ?? identity.name ?? null,
      accountId: user?.accountId ?? null,
      hasPassword: user?.hasPassword ?? false,
      hasPremiumAccess: invitationState.hasPremiumAccess,
      redeemedInviteCode: invitationState.redeemedInviteCode,
      premiumFeatureIds: invitationState.premiumFeatureIds,
      inviteCodes: invitationState.inviteCodes
    },
    { status: 200 }
  );
}

export async function updateProfileLocal(args: { request: Request }): Promise<NextResponse> {
  const { request } = args;
  const userId = await getAuthenticatedUserId({ createIfMissing: true });
  if (!userId) {
    return apiError(401, 'Unauthorized.');
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
      return apiError(404, 'User not found.');
    }

    return NextResponse.json(
      {
        email: user.email,
        displayName: user.displayName
      },
      { status: 200 }
    );
  } catch (error) {
    return apiError(400, 'Failed to update profile.', getUnknownErrorDetails(error));
  }
}
