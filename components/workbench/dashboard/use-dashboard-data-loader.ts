import { useCallback, useState } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import type {
  DashboardReportRecord,
  DetectionJobRecord,
  PostcardEditDraft,
  PostcardRecord
} from '@/components/workbench/types';
import { buildPostcardDraft } from '@/components/workbench/dashboard/shared';

type UseDashboardDataLoaderArgs = {
  text: WorkbenchText;
  setDashboardStatus: (value: string) => void;
};

export function useDashboardDataLoader({ text, setDashboardStatus }: UseDashboardDataLoaderArgs) {
  const [jobs, setJobs] = useState<DetectionJobRecord[]>([]);
  const [myPostcards, setMyPostcards] = useState<PostcardRecord[]>([]);
  const [myReports, setMyReports] = useState<DashboardReportRecord[]>([]);
  const [postcardDrafts, setPostcardDrafts] = useState<Record<string, PostcardEditDraft>>({});

  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isLoadingMine, setIsLoadingMine] = useState(false);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const [profileEmail, setProfileEmail] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');

  const loadDashboardData = useCallback(async () => {
    setDashboardStatus('');
    setIsLoadingJobs(true);
    setIsLoadingMine(true);
    setIsLoadingReports(true);
    setIsLoadingProfile(true);

    try {
      const [jobsResponse, mineResponse, reportsResponse, profileResponse] = await Promise.all([
        fetch('/api/location-from-image', { cache: 'no-store' }),
        fetch('/api/postcards?mine=1', { cache: 'no-store' }),
        fetch('/api/reports', { cache: 'no-store' }),
        fetch('/api/profile', { cache: 'no-store' })
      ]);

      if (!jobsResponse.ok) {
        throw new Error(text.dashboardLoadJobsFailed);
      }

      if (!mineResponse.ok) {
        throw new Error(text.dashboardLoadMineFailed);
      }

      if (!reportsResponse.ok) {
        throw new Error(text.dashboardUnknownError);
      }

      if (!profileResponse.ok) {
        throw new Error(text.dashboardUnknownError);
      }

      const jobsData = (await jobsResponse.json()) as DetectionJobRecord[];
      const mineData = (await mineResponse.json()) as PostcardRecord[];
      const reportsData = (await reportsResponse.json()) as DashboardReportRecord[];
      const profileData = (await profileResponse.json()) as { email?: string; displayName?: string | null };

      setJobs(jobsData);
      setMyPostcards(mineData);
      setMyReports(reportsData);
      setProfileEmail(profileData.email ?? '');
      setProfileDisplayName(profileData.displayName ?? '');
      setPostcardDrafts((current) => {
        const next: Record<string, PostcardEditDraft> = { ...current };
        for (const postcard of mineData) {
          next[postcard.id] = buildPostcardDraft(postcard);
        }
        return next;
      });
    } catch (error) {
      setDashboardStatus(error instanceof Error ? error.message : text.dashboardUnknownError);
    } finally {
      setIsLoadingJobs(false);
      setIsLoadingMine(false);
      setIsLoadingReports(false);
      setIsLoadingProfile(false);
    }
  }, [setDashboardStatus, text.dashboardLoadJobsFailed, text.dashboardLoadMineFailed, text.dashboardUnknownError]);

  return {
    jobs,
    myPostcards,
    myReports,
    postcardDrafts,
    setPostcardDrafts,
    isLoadingJobs,
    isLoadingMine,
    isLoadingReports,
    isLoadingProfile,
    profileEmail,
    profileDisplayName,
    setProfileDisplayName,
    loadDashboardData
  };
}
