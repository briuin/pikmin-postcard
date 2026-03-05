import { getPostcardReportAdminBackend } from '@/lib/backend/postcard-report-admin-backend';

export async function GET(request: Request) {
  return getPostcardReportAdminBackend().admin.listFeedback(request);
}
