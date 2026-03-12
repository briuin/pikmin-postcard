import { useCallback, useState } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import type {
  DashboardReportRecord,
  DetectionJobRecord,
  PostcardEditDraft,
  PostcardRecord
} from '@/components/workbench/types';
import { buildPostcardDraft } from '@/components/workbench/dashboard/shared';
import { apiFetch } from '@/lib/client-api';

type UseDashboardDataLoaderArgs = {
  text: WorkbenchText;
  currentUserId: string | null;
  currentUserEmail: string | null;
  setDashboardStatus: (value: string) => void;
};

export function useDashboardDataLoader({
  text,
  currentUserId,
  currentUserEmail,
  setDashboardStatus
}: UseDashboardDataLoaderArgs) {
  const [jobs, setJobs] = useState<DetectionJobRecord[]>([]);
  const [myPostcards, setMyPostcards] = useState<PostcardRecord[]>([]);
  const [savedPostcards, setSavedPostcards] = useState<PostcardRecord[]>([]);
  const [myReports, setMyReports] = useState<DashboardReportRecord[]>([]);
  const [postcardDrafts, setPostcardDrafts] = useState<Record<string, PostcardEditDraft>>({});

  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isLoadingMine, setIsLoadingMine] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const [profileEmail, setProfileEmail] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileAccountId, setProfileAccountId] = useState('');
  const [profileHasPassword, setProfileHasPassword] = useState(false);

  const loadDashboardData = useCallback(async () => {
    setDashboardStatus('');
    setIsLoadingJobs(true);
    setIsLoadingMine(true);
    setIsLoadingSaved(true);
    setIsLoadingReports(true);
    setIsLoadingProfile(true);

    try {
      const [jobsResponse, mineResponse, savedResponse, reportsResponse, profileResponse] = await Promise.all([
        apiFetch('/api/location-from-image', { cache: 'no-store' }, {
          userId: currentUserId,
          userEmail: currentUserEmail
        }),
        apiFetch('/api/postcards?mine=1', { cache: 'no-store' }, {
          userId: currentUserId,
          userEmail: currentUserEmail
        }),
        apiFetch('/api/postcards?saved=1', { cache: 'no-store' }, {
          userId: currentUserId,
          userEmail: currentUserEmail
        }),
        apiFetch('/api/reports', { cache: 'no-store' }, {
          userId: currentUserId,
          userEmail: currentUserEmail
        }),
        apiFetch('/api/profile', { cache: 'no-store' }, {
          userId: currentUserId,
          userEmail: currentUserEmail
        })
      ]);

      if (!jobsResponse.ok) {
        throw new Error(text.dashboardLoadJobsFailed);
      }

      if (!mineResponse.ok) {
        throw new Error(text.dashboardLoadMineFailed);
      }

      if (!savedResponse.ok) {
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
      const savedData = (await savedResponse.json()) as PostcardRecord[];
      const reportsData = (await reportsResponse.json()) as DashboardReportRecord[];
      const profileData = (await profileResponse.json()) as {
        email?: string;
        displayName?: string | null;
        accountId?: string | null;
        hasPassword?: boolean;
      };

      setJobs(jobsData);
      setMyPostcards(mineData);
      setSavedPostcards(savedData);
      setMyReports(reportsData);
      setProfileEmail(profileData.email ?? '');
      setProfileDisplayName(profileData.displayName ?? '');
      setProfileAccountId(profileData.accountId ?? '');
      setProfileHasPassword(Boolean(profileData.hasPassword));
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
      setIsLoadingSaved(false);
      setIsLoadingReports(false);
      setIsLoadingProfile(false);
    }
  }, [
    currentUserEmail,
    currentUserId,
    setDashboardStatus,
    text.dashboardLoadJobsFailed,
    text.dashboardLoadMineFailed,
    text.dashboardUnknownError
  ]);

  return {
    jobs,
    myPostcards,
    savedPostcards,
    myReports,
    postcardDrafts,
    setPostcardDrafts,
    isLoadingJobs,
    isLoadingMine,
    isLoadingSaved,
    isLoadingReports,
    isLoadingProfile,
    profileEmail,
    profileDisplayName,
    profileAccountId,
    profileHasPassword,
    setProfileDisplayName,
    setProfileHasPassword,
    loadDashboardData
  };
}
