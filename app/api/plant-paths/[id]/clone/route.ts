import { NextResponse } from 'next/server';
import { requireApprovedPlantPathUser, withGuardedValue } from '@/lib/api-guards';
import {
  clonePlantPath,
  getPlantPathStorageUnavailableMessage,
  isPlantPathStorageMissingError
} from '@/lib/plant-paths/service';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withGuardedValue(requireApprovedPlantPathUser(), async (actor) => {
    try {
      const { id } = await context.params;
      const cloned = await clonePlantPath({ userId: actor.id, pathId: id });
      if (!cloned) {
        return NextResponse.json({ error: 'Plant path is not available to clone.' }, { status: 404 });
      }
      return NextResponse.json(cloned, { status: 201 });
    } catch (error) {
      const storageMissing = isPlantPathStorageMissingError(error);
      return NextResponse.json(
        {
          error: storageMissing ? getPlantPathStorageUnavailableMessage() : 'Failed to clone plant path.',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: storageMissing ? 503 : 400 }
      );
    }
  });
}
