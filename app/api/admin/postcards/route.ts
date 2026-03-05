import { getAppBackend } from '@/lib/backend/app-backend';

export async function GET(request: Request) {
  return getAppBackend().admin.listPostcards(request);
}
