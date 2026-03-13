import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, isApprovedUser } from '@/lib/api-auth';
import { requireApprovedPlantPathUser, withGuardedValue } from '@/lib/api-guards';
import { createPlantPath, listPlantPaths } from '@/lib/plant-paths/service';

const createPlantPathSchema = z.object({
  name: z.string().trim().min(1).max(80)
});

export async function GET() {
  const actor = await getAuthenticatedUser({ createIfMissing: true });
  const viewerUserId =
    actor && isApprovedUser(actor) && actor.canUsePlantPaths ? actor.id : null;
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
      return NextResponse.json(
        {
          error: 'Failed to create plant path.',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 400 }
      );
    }
  });
}
