import { getPostcardReportAdminBackend } from '@/lib/backend/postcard-report-admin-backend';

export async function GET(request: Request) {
  return getPostcardReportAdminBackend().admin.listUsers(request);
}

export async function PATCH(request: Request) {
  return getPostcardReportAdminBackend().admin.updateUser(request);
}
