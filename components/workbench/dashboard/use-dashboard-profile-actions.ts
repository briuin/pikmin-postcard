import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import { parseJsonResponseOrThrow } from '@/lib/http-response';
import { apiFetch } from '@/lib/client-api';
import type { InviteCodeRecord } from '@/lib/invitations/types';
import type { PremiumFeatureKey } from '@/lib/premium-features';

type ProfilePasswordStatusTone = 'neutral' | 'success' | 'error' | 'loading';

type UseDashboardProfileActionsArgs = {
  text: WorkbenchText;
  ensureAuthenticated: () => boolean;
  currentUserId: string | null;
  currentUserEmail: string | null;
  loadPublicPostcards: () => Promise<void>;
  refreshAuthSession?: () => Promise<void>;
  setDashboardStatus: (value: string) => void;
  profileDisplayName: string;
  setProfileDisplayName: Dispatch<SetStateAction<string>>;
  setProfileHasPassword: Dispatch<SetStateAction<boolean>>;
  loadProfileData: () => Promise<void>;
};

export function useDashboardProfileActions({
  text,
  ensureAuthenticated,
  currentUserId,
  currentUserEmail,
  loadPublicPostcards,
  refreshAuthSession,
  setDashboardStatus,
  profileDisplayName,
  setProfileDisplayName,
  setProfileHasPassword,
  loadProfileData
}: UseDashboardProfileActionsArgs) {
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profilePassword, setProfilePassword] = useState('');
  const [profilePasswordConfirm, setProfilePasswordConfirm] = useState('');
  const [profilePasswordStatus, setProfilePasswordStatus] = useState('');
  const [profilePasswordStatusTone, setProfilePasswordStatusTone] =
    useState<ProfilePasswordStatusTone>('neutral');
  const [profileInviteCode, setProfileInviteCodeState] = useState('');
  const [profileInviteCodeStatus, setProfileInviteCodeStatus] = useState('');
  const [profileInviteCodeStatusTone, setProfileInviteCodeStatusTone] =
    useState<ProfilePasswordStatusTone>('neutral');

  const clearProfilePasswordStatus = useCallback(() => {
    setProfilePasswordStatus('');
    setProfilePasswordStatusTone('neutral');
  }, []);

  const clearProfileInviteCodeStatus = useCallback(() => {
    setProfileInviteCodeStatus('');
    setProfileInviteCodeStatusTone('neutral');
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

  const updateProfileInviteCode = useCallback(
    (value: string) => {
      clearProfileInviteCodeStatus();
      setProfileInviteCodeState(value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 9));
    },
    [clearProfileInviteCodeStatus]
  );

  const publishProfilePasswordStatus = useCallback(
    (message: string, tone: ProfilePasswordStatusTone) => {
      setProfilePasswordStatus(message);
      setProfilePasswordStatusTone(tone);
      setDashboardStatus(message);
    },
    [setDashboardStatus]
  );

  const publishProfileInviteCodeStatus = useCallback(
    (message: string, tone: ProfilePasswordStatusTone) => {
      setProfileInviteCodeStatus(message);
      setProfileInviteCodeStatusTone(tone);
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

  const redeemProfileInviteCode = useCallback(async () => {
    if (!ensureAuthenticated()) {
      return;
    }

    if (!profileInviteCode) {
      publishProfileInviteCodeStatus(text.profileInviteCodeRequired, 'error');
      return;
    }

    if (!/^[A-Z]{9}$/.test(profileInviteCode)) {
      publishProfileInviteCodeStatus(text.profileInviteCodeInvalid, 'error');
      return;
    }

    setIsSavingProfile(true);
    publishProfileInviteCodeStatus(text.profileInviteCodeApplying, 'loading');
    try {
      const response = await apiFetch(
        '/api/profile/invite-code',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: profileInviteCode })
        },
        {
          userId: currentUserId,
          userEmail: currentUserEmail
        }
      );

      await parseJsonResponseOrThrow<{
        hasPremiumAccess?: boolean;
        redeemedInviteCode?: string | null;
        inviteCodes?: InviteCodeRecord[];
        premiumFeatureIds?: PremiumFeatureKey[];
      }>(response, text.profileInviteCodeApplyFailed);

      setProfileInviteCodeState('');
      await loadProfileData();
      if (refreshAuthSession) {
        await refreshAuthSession();
      }
      publishProfileInviteCodeStatus(text.profileInviteCodeApplied, 'success');
    } catch (error) {
      publishProfileInviteCodeStatus(
        error instanceof Error ? error.message : text.profileInviteCodeApplyFailed,
        'error'
      );
    } finally {
      setIsSavingProfile(false);
    }
  }, [
    currentUserEmail,
    currentUserId,
    ensureAuthenticated,
    loadProfileData,
    refreshAuthSession,
    profileInviteCode,
    publishProfileInviteCodeStatus,
    text.profileInviteCodeApplyFailed,
    text.profileInviteCodeApplied,
    text.profileInviteCodeApplying,
    text.profileInviteCodeInvalid,
    text.profileInviteCodeRequired
  ]);

  return {
    isSavingProfile,
    profilePassword,
    profilePasswordConfirm,
    profilePasswordStatus,
    profilePasswordStatusTone,
    profileInviteCode,
    profileInviteCodeStatus,
    profileInviteCodeStatusTone,
    setProfilePassword: updateProfilePassword,
    setProfilePasswordConfirm: updateProfilePasswordConfirm,
    setProfileInviteCode: updateProfileInviteCode,
    saveProfileDisplayName,
    saveProfilePassword,
    redeemProfileInviteCode
  };
}
