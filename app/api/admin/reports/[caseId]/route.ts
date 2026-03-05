import { NextResponse } from 'next/server';
import { getPostcardReportAdminBackend } from '@/lib/backend/postcard-report-admin-backend';

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { caseId } = await context.params;
  if (!caseId) {
    return NextResponse.json({ error: 'Missing report case id.' }, { status: 400 });
  }

  return getPostcardReportAdminBackend().admin.getReportCase(request, caseId);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { caseId } = await context.params;
  if (!caseId) {
    return NextResponse.json({ error: 'Missing report case id.' }, { status: 400 });
  }

  return getPostcardReportAdminBackend().admin.updateReportCase(request, caseId);
}
