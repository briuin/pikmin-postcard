import { NextResponse } from 'next/server';
import { requireApprovedPlantPathUser, withGuardedValue } from '@/lib/api-guards';
import {
  getPlantPathStorageUnavailableMessage,
  isPlantPathStorageMissingError,
  savePublicPlantPath,
  unsavePublicPlantPath
} from '@/lib/plant-paths/service';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withGuardedValue(requireApprovedPlantPathUser(), async (actor) => {
    try {
      const { id } = await context.params;
      const saved = await savePublicPlantPath({ userId: actor.id, pathId: id });
      if (!saved) {
        return NextResponse.json({ error: 'Plant path is not available to save.' }, { status: 404 });
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    } catch (error) {
      const storageMissing = isPlantPathStorageMissingError(error);
      return NextResponse.json(
        {
          error: storageMissing ? getPlantPathStorageUnavailableMessage() : 'Failed to save public plant path.',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: storageMissing ? 503 : 400 }
      );
    }
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withGuardedValue(requireApprovedPlantPathUser(), async (actor) => {
    try {
      const { id } = await context.params;
      await unsavePublicPlantPath({ userId: actor.id, pathId: id });
      return NextResponse.json({ ok: true }, { status: 200 });
    } catch (error) {
      const storageMissing = isPlantPathStorageMissingError(error);
      return NextResponse.json(
        {
          error: storageMissing ? getPlantPathStorageUnavailableMessage() : 'Failed to unsave public plant path.',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: storageMissing ? 503 : 400 }
      );
    }
  });
}
