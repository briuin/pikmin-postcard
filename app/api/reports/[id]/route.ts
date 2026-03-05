import { NextResponse } from 'next/server';
import { getPostcardReportAdminBackend } from '@/lib/backend/postcard-report-admin-backend';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const { id: reportId } = await context.params;
  if (!reportId) {
    return NextResponse.json({ error: 'Missing report id.' }, { status: 400 });
  }

  return getPostcardReportAdminBackend().reports.cancelById(request, reportId);
}
