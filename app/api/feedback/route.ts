import { getAppBackend } from '@/lib/backend/app-backend';

export async function POST(request: Request) {
  return getAppBackend().feedback.create(request);
}
