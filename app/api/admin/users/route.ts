import { getAppBackend } from '@/lib/backend/app-backend';

export async function GET(request: Request) {
  return getAppBackend().admin.listUsers(request);
}

export async function PATCH(request: Request) {
  return getAppBackend().admin.updateUser(request);
}
