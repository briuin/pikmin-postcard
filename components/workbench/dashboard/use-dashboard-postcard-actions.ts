import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { PercentCrop } from 'react-image-crop';
import type { WorkbenchText } from '@/lib/i18n';
import type { PostcardEditDraft, PostcardRecord } from '@/components/workbench/types';
import {
  deriveOriginalImageUrl,
  parseLocationInput,
  sanitizePercentCrop,
  toNormalizedCrop,
  type CropDraft
} from '@/components/workbench/utils';
import { buildPostcardDraft, DEFAULT_CROP_DRAFT } from '@/components/workbench/dashboard/shared';

type UseDashboardPostcardActionsArgs = {
  text: WorkbenchText;
  ensureAuthenticated: () => boolean;
  loadPublicPostcards: () => Promise<void>;
  loadDashboardData: () => Promise<void>;
  setDashboardStatus: (value: string) => void;
  postcardDrafts: Record<string, PostcardEditDraft>;
  setPostcardDrafts: Dispatch<SetStateAction<Record<string, PostcardEditDraft>>>;
};

export function useDashboardPostcardActions({
  text,
  ensureAuthenticated,
  loadPublicPostcards,
  loadDashboardData,
  setDashboardStatus,
  postcardDrafts,
  setPostcardDrafts
}: UseDashboardPostcardActionsArgs) {
  const [savingPostcardId, setSavingPostcardId] = useState<string | null>(null);
  const [deletingPostcardId, setDeletingPostcardId] = useState<string | null>(null);
  const [editingCropPostcardId, setEditingCropPostcardId] = useState<string | null>(null);
  const [editingCropOriginalUrl, setEditingCropOriginalUrl] = useState<string | null>(null);
  const [cropDraft, setCropDraft] = useState<CropDraft>({ ...DEFAULT_CROP_DRAFT });
  const [savingCropPostcardId, setSavingCropPostcardId] = useState<string | null>(null);

  const updatePostcardDraft = useCallback(
    (postcardId: string, patch: Partial<PostcardEditDraft>) => {
      setPostcardDrafts((current) => ({
        ...current,
        [postcardId]: {
          ...(current[postcardId] ?? {
            title: '',
            postcardType: 'UNKNOWN',
            notes: '',
            placeName: '',
            locationInput: ''
          }),
          ...patch
        }
      }));
    },
    [setPostcardDrafts]
  );

  const savePostcardEdits = useCallback(
    async (postcard: PostcardRecord) => {
      if (!ensureAuthenticated()) {
        return;
      }

      const draft = postcardDrafts[postcard.id] ?? buildPostcardDraft(postcard);
      const title = draft.title.trim();
      if (!title) {
        setDashboardStatus(text.manualNameRequired);
        return;
      }

      let latitude: number | null = null;
      let longitude: number | null = null;
      const locationInput = draft.locationInput.trim();
      if (locationInput.length > 0) {
        try {
          const parsed = parseLocationInput(locationInput, text);
          latitude = parsed.latitude;
          longitude = parsed.longitude;
        } catch (error) {
          setDashboardStatus(error instanceof Error ? error.message : text.manualInvalidLocation);
          return;
        }
      }

      const normalizedOriginal = buildPostcardDraft(postcard);
      const normalizedCurrent: PostcardEditDraft = {
        title,
        postcardType: draft.postcardType,
        notes: draft.notes.trim(),
        placeName: draft.placeName.trim(),
        locationInput:
          latitude !== null && longitude !== null
            ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
            : ''
      };
      const hasChanges =
        normalizedOriginal.title !== normalizedCurrent.title ||
        normalizedOriginal.postcardType !== normalizedCurrent.postcardType ||
        normalizedOriginal.notes !== normalizedCurrent.notes ||
        normalizedOriginal.placeName !== normalizedCurrent.placeName ||
        normalizedOriginal.locationInput !== normalizedCurrent.locationInput;

      if (!hasChanges) {
        setDashboardStatus(text.editPostcardNoChanges);
        return;
      }

      setSavingPostcardId(postcard.id);
      setDashboardStatus(text.editPostcardSaving);

      try {
        const response = await fetch(`/api/postcards/${postcard.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            postcardType: draft.postcardType,
            notes: draft.notes.trim() ? draft.notes : null,
            placeName: draft.placeName.trim() ? draft.placeName : null,
            latitude,
            longitude
          })
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? text.editPostcardFailed);
        }

        await Promise.all([loadDashboardData(), loadPublicPostcards()]);
        setDashboardStatus(text.editPostcardSaved);
      } catch (error) {
        setDashboardStatus(error instanceof Error ? error.message : text.editPostcardUnknownError);
      } finally {
        setSavingPostcardId(null);
      }
    },
    [
      ensureAuthenticated,
      loadDashboardData,
      loadPublicPostcards,
      postcardDrafts,
      setDashboardStatus,
      text
    ]
  );

  const openCropEditor = useCallback(
    (postcard: PostcardRecord) => {
      const derivedOriginalUrl = deriveOriginalImageUrl(postcard.imageUrl);
      const sourceUrl = postcard.originalImageUrl ?? derivedOriginalUrl ?? postcard.imageUrl;
      if (!sourceUrl) {
        setDashboardStatus(text.cropNoImage);
        return;
      }

      setEditingCropPostcardId(postcard.id);
      setEditingCropOriginalUrl(sourceUrl);
      setCropDraft({ ...DEFAULT_CROP_DRAFT });
      if (!postcard.originalImageUrl && !derivedOriginalUrl) {
        setDashboardStatus(text.cropFallbackNotice);
      } else {
        setDashboardStatus('');
      }
    },
    [setDashboardStatus, text.cropFallbackNotice, text.cropNoImage]
  );

  const closeCropEditor = useCallback(() => {
    setEditingCropPostcardId(null);
    setEditingCropOriginalUrl(null);
  }, []);

  const saveCropEdit = useCallback(
    async (postcardId: string) => {
      if (!ensureAuthenticated()) {
        return;
      }

      setSavingCropPostcardId(postcardId);
      setDashboardStatus(text.cropSaving);

      try {
        const response = await fetch(`/api/postcards/${postcardId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ crop: toNormalizedCrop(cropDraft) })
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? text.cropSaveFailed);
        }

        await Promise.all([loadDashboardData(), loadPublicPostcards()]);
        closeCropEditor();
        setDashboardStatus(text.cropSaved);
      } catch (error) {
        setDashboardStatus(error instanceof Error ? error.message : text.cropUnknownError);
      } finally {
        setSavingCropPostcardId(null);
      }
    },
    [
      closeCropEditor,
      cropDraft,
      ensureAuthenticated,
      loadDashboardData,
      loadPublicPostcards,
      setDashboardStatus,
      text.cropSaveFailed,
      text.cropSaved,
      text.cropSaving,
      text.cropUnknownError
    ]
  );

  const softDeletePostcard = useCallback(
    async (postcard: PostcardRecord) => {
      if (!ensureAuthenticated()) {
        return;
      }

      const confirmed = window.confirm(text.removeConfirm(postcard.title));
      if (!confirmed) {
        return;
      }

      setDeletingPostcardId(postcard.id);
      setDashboardStatus(text.removeRunning);

      try {
        const response = await fetch(`/api/postcards/${postcard.id}`, {
          method: 'DELETE'
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? text.removeFailed);
        }

        if (editingCropPostcardId === postcard.id) {
          closeCropEditor();
        }

        setDashboardStatus(text.removeDone);
        await Promise.all([loadDashboardData(), loadPublicPostcards()]);
      } catch (error) {
        setDashboardStatus(error instanceof Error ? error.message : text.removeUnknownError);
      } finally {
        setDeletingPostcardId(null);
      }
    },
    [
      closeCropEditor,
      editingCropPostcardId,
      ensureAuthenticated,
      loadDashboardData,
      loadPublicPostcards,
      setDashboardStatus,
      text
    ]
  );

  const updateCropDraft = useCallback((crop: PercentCrop) => {
    setCropDraft((current) => sanitizePercentCrop(crop, current));
  }, []);

  return {
    savingPostcardId,
    deletingPostcardId,
    editingCropPostcardId,
    editingCropOriginalUrl,
    cropDraft,
    savingCropPostcardId,
    updatePostcardDraft,
    savePostcardEdits,
    openCropEditor,
    closeCropEditor,
    saveCropEdit,
    softDeletePostcard,
    updateCropDraft
  };
}
