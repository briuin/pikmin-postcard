import { getAppBackend } from '@/lib/backend/app-backend';

export async function GET(request: Request) {
  return getAppBackend().profile.get(request);
}

export async function PATCH(request: Request) {
  return getAppBackend().profile.update(request);
}
