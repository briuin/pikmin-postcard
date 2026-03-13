import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withGuardedValue, requireAuthenticatedUserId } from '@/lib/api-guards';
import { redeemInviteCode } from '@/lib/invitations/service';
import { recordUserAction } from '@/lib/user-action-log';

const redeemInviteCodeSchema = z.object({
  code: z.string().trim().min(1).max(32)
});

export async function POST(request: Request) {
  return withGuardedValue(requireAuthenticatedUserId({ createIfMissing: true }), async (userId) => {
    try {
      const payload = redeemInviteCodeSchema.parse(await request.json());
      const invitationState = await redeemInviteCode({
        userId,
        code: payload.code
      });

      await recordUserAction({
        request,
        userId,
        action: 'INVITE_CODE_REDEEM',
        metadata: {
          code: payload.code.trim().toUpperCase()
        }
      });

      return NextResponse.json(invitationState, { status: 200 });
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Failed to redeem invite code.'
        },
        { status: 400 }
      );
    }
  });
}
