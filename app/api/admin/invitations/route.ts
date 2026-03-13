import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminActor, withGuardedValue } from '@/lib/api-guards';
import {
  DEFAULT_ADMIN_INVITE_PAGE_SIZE,
  generateAdminInviteCodes,
  getAdminInvitationState
} from '@/lib/invitations/service';
import { updatePremiumFeatureIds } from '@/lib/premium-feature-settings';
import { normalizePremiumFeatureIds } from '@/lib/premium-features';
import { recordUserAction } from '@/lib/user-action-log';

const generateInviteCodesSchema = z.object({
  count: z.coerce.number().int().min(1).max(200)
});

const updatePremiumFeaturesSchema = z.object({
  premiumFeatureIds: z.array(z.string()).default([])
});

const listInvitationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(DEFAULT_ADMIN_INVITE_PAGE_SIZE)
});

export async function GET(request: Request) {
  return withGuardedValue(requireAdminActor(), async (actor) => {
    try {
      const { searchParams } = new URL(request.url);
      const query = listInvitationsSchema.parse({
        page: searchParams.get('page') ?? undefined,
        pageSize: searchParams.get('pageSize') ?? undefined
      });

      await recordUserAction({
        request,
        userId: actor.id,
        action: 'ADMIN_INVITATIONS_GET'
      });

      const payload = await getAdminInvitationState(query);
      return NextResponse.json(payload, { status: 200 });
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Failed to load invite settings.'
        },
        { status: 400 }
      );
    }
  });
}

export async function POST(request: Request) {
  return withGuardedValue(requireAdminActor(), async (actor) => {
    try {
      const payload = generateInviteCodesSchema.parse(await request.json());
      const inviteCodes = await generateAdminInviteCodes({
        count: payload.count,
        actorId: actor.id
      });

      await recordUserAction({
        request,
        userId: actor.id,
        action: 'ADMIN_INVITATIONS_GENERATE',
        metadata: {
          count: payload.count
        }
      });

      return NextResponse.json({ inviteCodes }, { status: 201 });
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Failed to generate invite codes.'
        },
        { status: 400 }
      );
    }
  });
}

export async function PATCH(request: Request) {
  return withGuardedValue(requireAdminActor(), async (actor) => {
    try {
      const payload = updatePremiumFeaturesSchema.parse(await request.json());
      const premiumFeatureIds = normalizePremiumFeatureIds(payload.premiumFeatureIds);
      const settings = await updatePremiumFeatureIds(premiumFeatureIds);

      await recordUserAction({
        request,
        userId: actor.id,
        action: 'ADMIN_PREMIUM_FEATURES_UPDATE',
        metadata: {
          premiumFeatureIds
        }
      });

      return NextResponse.json(settings, { status: 200 });
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Failed to update premium features.'
        },
        { status: 400 }
      );
    }
  });
}
