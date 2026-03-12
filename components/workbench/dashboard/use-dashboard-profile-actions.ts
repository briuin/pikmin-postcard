import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import { parseJsonResponseOrThrow } from '@/lib/http-response';
import { apiFetch } from '@/lib/client-api';

type ProfilePasswordStatusTone = 'neutral' | 'success' | 'error' | 'loading';

type UseDashboardProfileActionsArgs = {
  text: WorkbenchText;
  ensureAuthenticated: () => boolean;
  currentUserId: string | null;
  currentUserEmail: string | null;
  loadPublicPostcards: () => Promise<void>;
  setDashboardStatus: (value: string) => void;
  profileDisplayName: string;
  setProfileDisplayName: Dispatch<SetStateAction<string>>;
  setProfileHasPassword: Dispatch<SetStateAction<boolean>>;
};

export function useDashboardProfileActions({
  text,
  ensureAuthenticated,
  currentUserId,
  currentUserEmail,
  loadPublicPostcards,
  setDashboardStatus,
  profileDisplayName,
  setProfileDisplayName,
  setProfileHasPassword
}: UseDashboardProfileActionsArgs) {
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profilePassword, setProfilePassword] = useState('');
  const [profilePasswordConfirm, setProfilePasswordConfirm] = useState('');
  const [profilePasswordStatus, setProfilePasswordStatus] = useState('');
  const [profilePasswordStatusTone, setProfilePasswordStatusTone] =
    useState<ProfilePasswordStatusTone>('neutral');

  const clearProfilePasswordStatus = useCallback(() => {
    setProfilePasswordStatus('');
    setProfilePasswordStatusTone('neutral');
  }, []);

  const updateProfilePassword = useCallback(
    (value: string) => {
      clearProfilePasswordStatus();
      setProfilePassword(value);
    },
    [clearProfilePasswordStatus]
  );

  const updateProfilePasswordConfirm = useCallback(
    (value: string) => {
      clearProfilePasswordStatus();
      setProfilePasswordConfirm(value);
    },
    [clearProfilePasswordStatus]
  );

  const publishProfilePasswordStatus = useCallback(
    (message: string, tone: ProfilePasswordStatusTone) => {
      setProfilePasswordStatus(message);
      setProfilePasswordStatusTone(tone);
      setDashboardStatus(message);
    },
    [setDashboardStatus]
  );

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

  const saveProfilePassword = useCallback(async () => {
    if (!ensureAuthenticated()) {
      return;
    }

    if (!profilePassword) {
      publishProfilePasswordStatus(text.profilePasswordRequired, 'error');
      return;
    }

    if (profilePassword.length < 8) {
      publishProfilePasswordStatus(text.profilePasswordTooShort, 'error');
      return;
    }

    if (profilePassword !== profilePasswordConfirm) {
      publishProfilePasswordStatus(text.profilePasswordMismatch, 'error');
      return;
    }

    setIsSavingProfile(true);
    publishProfilePasswordStatus(text.profilePasswordSaving, 'loading');
    try {
      const response = await apiFetch(
        '/api/auth/password',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: profilePassword })
        },
        {
          userId: currentUserId,
          userEmail: currentUserEmail
        }
      );

      await parseJsonResponseOrThrow(response, text.profilePasswordSaveFailed);

      setProfileHasPassword(true);
      setProfilePassword('');
      setProfilePasswordConfirm('');
      publishProfilePasswordStatus(text.profilePasswordSaved, 'success');
    } catch (error) {
      publishProfilePasswordStatus(error instanceof Error ? error.message : text.profileUnknownError, 'error');
    } finally {
      setIsSavingProfile(false);
    }
  }, [
    currentUserEmail,
    currentUserId,
    ensureAuthenticated,
    publishProfilePasswordStatus,
    profilePassword,
    profilePasswordConfirm,
    setProfileHasPassword,
    text.profilePasswordMismatch,
    text.profilePasswordRequired,
    text.profilePasswordSaveFailed,
    text.profilePasswordSaved,
    text.profilePasswordSaving,
    text.profilePasswordTooShort,
    text.profileUnknownError
  ]);

  return {
    isSavingProfile,
    profilePassword,
    profilePasswordConfirm,
    profilePasswordStatus,
    profilePasswordStatusTone,
    setProfilePassword: updateProfilePassword,
    setProfilePasswordConfirm: updateProfilePasswordConfirm,
    saveProfileDisplayName,
    saveProfilePassword
  };
}
