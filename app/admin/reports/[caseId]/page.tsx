import { HomeShell } from '@/components/home-shell';

type PageProps = {
  params: Promise<{ caseId: string }>;
};

export default async function AdminReportCasePage({ params }: PageProps) {
  const { caseId } = await params;

  return (
    <main>
      <HomeShell page="admin-report" reportCaseId={caseId} />
    </main>
  );
}
