import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/api-auth';
import { createPlantPath, listPlantPaths } from '@/lib/plant-paths/service';

const createPlantPathSchema = z.object({
  name: z.string().trim().min(1).max(80)
});

export async function GET() {
  const userId = await getAuthenticatedUserId({ createIfMissing: true });
  const payload = await listPlantPaths(userId);
  return NextResponse.json(payload, { status: 200 });
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId({ createIfMissing: true });
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const payload = createPlantPathSchema.parse(await request.json());
    const created = await createPlantPath({
      userId,
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
}
