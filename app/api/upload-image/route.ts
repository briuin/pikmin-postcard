import { getAppBackend } from '@/lib/backend/app-backend';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return getAppBackend().upload.create(request);
}
