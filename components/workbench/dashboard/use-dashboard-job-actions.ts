import { useCallback, useState } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import type { DetectionJobRecord, PostcardRecord } from '@/components/workbench/types';
import { deriveOriginalImageUrl } from '@/components/workbench/utils';
import { parseJsonResponseOrThrow } from '@/lib/http-response';

type UseDashboardJobActionsArgs = {
  text: WorkbenchText;
  ensureAuthenticated: () => boolean;
  loadPublicPostcards: () => Promise<void>;
  loadDashboardData: () => Promise<void>;
  setDashboardStatus: (value: string) => void;
  myPostcards: PostcardRecord[];
};

export function useDashboardJobActions({
  text,
  ensureAuthenticated,
  loadPublicPostcards,
  loadDashboardData,
  setDashboardStatus,
  myPostcards
}: UseDashboardJobActionsArgs) {
  const [savingJobId, setSavingJobId] = useState<string | null>(null);

  const isJobAlreadySaved = useCallback(
    (job: DetectionJobRecord): boolean => {
      return myPostcards.some((postcard) => postcard.imageUrl === job.imageUrl);
    },
    [myPostcards]
  );

  const saveDetectedJobAsPostcard = useCallback(
    async (job: DetectionJobRecord) => {
      if (!ensureAuthenticated()) {
        return;
      }

      if (job.status !== 'SUCCEEDED' || job.latitude === null || job.longitude === null) {
        setDashboardStatus(text.aiSaveOnlySuccess);
        return;
      }

      if (isJobAlreadySaved(job)) {
        setDashboardStatus(text.aiSaveAlreadySaved);
        return;
      }

      const title = job.placeGuess?.trim() ? `AI: ${job.placeGuess}` : text.aiDetectedPostcardTitle;

      setSavingJobId(job.id);
      setDashboardStatus(text.aiSaveSaving);

      try {
        const response = await fetch('/api/postcards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            postcardType: 'UNKNOWN',
            imageUrl: job.imageUrl,
            originalImageUrl: deriveOriginalImageUrl(job.imageUrl) ?? undefined,
            placeName: job.placeGuess ?? undefined,
            latitude: job.latitude,
            longitude: job.longitude,
            aiLatitude: job.latitude,
            aiLongitude: job.longitude,
            aiConfidence: job.confidence ?? undefined,
            aiPlaceGuess: job.placeGuess ?? undefined,
            locationStatus: 'USER_CONFIRMED',
            locationModelVersion: job.modelVersion ?? undefined
          })
        });
        await parseJsonResponseOrThrow(response, text.aiSaveFailed);

        await Promise.all([loadDashboardData(), loadPublicPostcards()]);
        setDashboardStatus(text.aiSaveDone);
      } catch (error) {
        setDashboardStatus(error instanceof Error ? error.message : text.aiSaveUnknownError);
      } finally {
        setSavingJobId(null);
      }
    },
    [
      ensureAuthenticated,
      isJobAlreadySaved,
      loadDashboardData,
      loadPublicPostcards,
      setDashboardStatus,
      text.aiDetectedPostcardTitle,
      text.aiSaveAlreadySaved,
      text.aiSaveDone,
      text.aiSaveFailed,
      text.aiSaveOnlySuccess,
      text.aiSaveSaving,
      text.aiSaveUnknownError
    ]
  );

  return {
    savingJobId,
    isJobAlreadySaved,
    saveDetectedJobAsPostcard
  };
}
