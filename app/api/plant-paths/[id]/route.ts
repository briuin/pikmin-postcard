import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApprovedPlantPathUser, withGuardedValue } from '@/lib/api-guards';
import { PlantPathVisibility } from '@/lib/plant-paths/types';
import {
  deletePlantPath,
  getPlantPathStorageUnavailableMessage,
  isPlantPathStorageMissingError,
  updatePlantPath
} from '@/lib/plant-paths/service';

const coordinateSchema = z.object({
  id: z.string().trim().min(1).max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180)
});

const updatePlantPathSchema = z.object({
  name: z.string().trim().min(1).max(80),
  visibility: z.nativeEnum(PlantPathVisibility),
  coordinates: z.array(coordinateSchema).max(500)
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return withGuardedValue(requireApprovedPlantPathUser(), async (actor) => {
    try {
      const { id } = await context.params;
      const payload = updatePlantPathSchema.parse(await request.json());
      const updated = await updatePlantPath({
        userId: actor.id,
        pathId: id,
        name: payload.name,
        visibility: payload.visibility,
        coordinates: payload.coordinates
      });
      if (!updated) {
        return NextResponse.json({ error: 'Plant path not found.' }, { status: 404 });
      }
      return NextResponse.json(updated, { status: 200 });
    } catch (error) {
      const storageMissing = isPlantPathStorageMissingError(error);
      return NextResponse.json(
        {
          error: storageMissing ? getPlantPathStorageUnavailableMessage() : 'Failed to update plant path.',
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
      const deleted = await deletePlantPath({ userId: actor.id, pathId: id });
      if (!deleted) {
        return NextResponse.json({ error: 'Plant path not found.' }, { status: 404 });
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    } catch (error) {
      const storageMissing = isPlantPathStorageMissingError(error);
      return NextResponse.json(
        {
          error: storageMissing ? getPlantPathStorageUnavailableMessage() : 'Failed to delete plant path.',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: storageMissing ? 503 : 400 }
      );
    }
  });
}
