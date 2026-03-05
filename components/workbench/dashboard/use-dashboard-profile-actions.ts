import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import { parseJsonResponseOrThrow } from '@/lib/http-response';
import { apiFetch } from '@/lib/client-api';

type UseDashboardProfileActionsArgs = {
  text: WorkbenchText;
  ensureAuthenticated: () => boolean;
  currentUserId: string | null;
  currentUserEmail: string | null;
  loadPublicPostcards: () => Promise<void>;
  setDashboardStatus: (value: string) => void;
  profileDisplayName: string;
  setProfileDisplayName: Dispatch<SetStateAction<string>>;
};

export function useDashboardProfileActions({
  text,
  ensureAuthenticated,
  currentUserId,
  currentUserEmail,
  loadPublicPostcards,
  setDashboardStatus,
  profileDisplayName,
  setProfileDisplayName
}: UseDashboardProfileActionsArgs) {
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const saveProfileDisplayName = useCallback(async () => {
    if (!ensureAuthenticated()) {
      return;
    }

    const displayName = profileDisplayName.trim();
    if (!displayName) {
      setDashboardStatus(text.profileDisplayNameRequired);
      return;
    }

    setIsSavingProfile(true);
    setDashboardStatus(text.profileSaving);
    try {
      const response = await apiFetch(
        '/api/profile',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName })
        },
        {
          userId: currentUserId,
          userEmail: currentUserEmail
        }
      );

      const payload = await parseJsonResponseOrThrow<{ displayName?: string }>(
        response,
        text.profileSaveFailed
      );

      setProfileDisplayName(payload.displayName ?? displayName);
      setDashboardStatus(text.profileSaved);
      await loadPublicPostcards();
    } catch (error) {
      setDashboardStatus(error instanceof Error ? error.message : text.profileUnknownError);
    } finally {
      setIsSavingProfile(false);
    }
  }, [
    ensureAuthenticated,
    currentUserEmail,
    currentUserId,
    loadPublicPostcards,
    profileDisplayName,
    setDashboardStatus,
    setProfileDisplayName,
    text.profileDisplayNameRequired,
    text.profileSaveFailed,
    text.profileSaved,
    text.profileSaving,
    text.profileUnknownError
  ]);

  return {
    isSavingProfile,
    saveProfileDisplayName
  };
}
