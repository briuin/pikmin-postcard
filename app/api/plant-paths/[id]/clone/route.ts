import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/api-auth';
import { clonePlantPath } from '@/lib/plant-paths/service';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId({ createIfMissing: true });
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id } = await context.params;
  const cloned = await clonePlantPath({ userId, pathId: id });
  if (!cloned) {
    return NextResponse.json({ error: 'Plant path is not available to clone.' }, { status: 404 });
  }
  return NextResponse.json(cloned, { status: 201 });
}
