import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, isApprovedUser } from '@/lib/api-auth';
import { requireApprovedPlantPathUser, withGuardedValue } from '@/lib/api-guards';
import { listPremiumFeatureIds } from '@/lib/premium-feature-settings';
import { hasPremiumFeatureAccess, PremiumFeatureKey } from '@/lib/premium-features';
import {
  createPlantPath,
  getPlantPathStorageUnavailableMessage,
  isPlantPathStorageMissingError,
  listPlantPaths
} from '@/lib/plant-paths/service';

const createPlantPathSchema = z.object({
  name: z.string().trim().min(1).max(80)
});

export async function GET() {
  const actor = await getAuthenticatedUser({ createIfMissing: true });
  const premiumFeatureIds = await listPremiumFeatureIds();
  const viewerUserId =
    actor &&
    isApprovedUser(actor) &&
    actor.canUsePlantPaths &&
    hasPremiumFeatureAccess({
      role: actor.role,
      hasPremiumAccess: actor.hasPremiumAccess,
      premiumFeatureIds,
      featureId: PremiumFeatureKey.PLANT_PATHS
    })
      ? actor.id
      : null;
  const payload = await listPlantPaths(viewerUserId);
  return NextResponse.json(payload, { status: 200 });
}

export async function POST(request: Request) {
  return withGuardedValue(requireApprovedPlantPathUser(), async (actor) => {
    try {
      const payload = createPlantPathSchema.parse(await request.json());
      const created = await createPlantPath({
        userId: actor.id,
        name: payload.name
      });
      return NextResponse.json(created, { status: 201 });
    } catch (error) {
      const storageMissing = isPlantPathStorageMissingError(error);
      return NextResponse.json(
        {
          error: storageMissing ? getPlantPathStorageUnavailableMessage() : 'Failed to create plant path.',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: storageMissing ? 503 : 400 }
      );
    }
  });
}
