import { getPostcardReportAdminBackend } from '@/lib/backend/postcard-report-admin-backend';

export async function GET(request: Request) {
  return getPostcardReportAdminBackend().postcards.list(request);
}

export async function POST(request: Request) {
  return getPostcardReportAdminBackend().postcards.create(request);
}
