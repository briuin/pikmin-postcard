import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/api-auth';
import { savePublicPlantPath, unsavePublicPlantPath } from '@/lib/plant-paths/service';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId({ createIfMissing: true });
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id } = await context.params;
  const saved = await savePublicPlantPath({ userId, pathId: id });
  if (!saved) {
    return NextResponse.json({ error: 'Plant path is not available to save.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId({ createIfMissing: true });
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id } = await context.params;
  await unsavePublicPlantPath({ userId, pathId: id });
  return NextResponse.json({ ok: true }, { status: 200 });
}
