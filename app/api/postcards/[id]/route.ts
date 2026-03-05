import { NextResponse } from 'next/server';
import { getAppBackend } from '@/lib/backend/app-backend';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  return getAppBackend().postcards.getById(request, id);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  return getAppBackend().postcards.updateById(request, id);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  return getAppBackend().postcards.deleteById(request, id);
}
