import { getAppBackend } from '@/lib/backend/app-backend';

export async function GET(request: Request) {
  return getAppBackend().postcards.list(request);
}

export async function POST(request: Request) {
  return getAppBackend().postcards.create(request);
}
