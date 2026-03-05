import { NextResponse } from 'next/server';
import { getAppBackend } from '@/lib/backend/app-backend';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id: postcardId } = await context.params;
  if (!postcardId) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  return getAppBackend().postcards.submitFeedbackById(request, postcardId);
}
