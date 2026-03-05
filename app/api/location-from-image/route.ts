import { getAppBackend } from '@/lib/backend/app-backend';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return getAppBackend().detection.list(request);
}

export async function POST(request: Request) {
  return getAppBackend().detection.create(request);
}
