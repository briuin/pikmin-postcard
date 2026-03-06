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
import { parseJsonResponseOrThrow } from '@/lib/http-response';
import { apiFetch } from '@/lib/client-api';

type UseDashboardPostcardActionsArgs = {
  text: WorkbenchText;
  ensureAuthenticated: () => boolean;
  currentUserId: string | null;
  currentUserEmail: string | null;
  loadPublicPostcards: () => Promise<void>;
  loadDashboardData: () => Promise<void>;
  setDashboardStatus: (value: string) => void;
  postcardDrafts: Record<string, PostcardEditDraft>;
  setPostcardDrafts: Dispatch<SetStateAction<Record<string, PostcardEditDraft>>>;
};

export function useDashboardPostcardActions({
  text,
  ensureAuthenticated,
  currentUserId,
  currentUserEmail,
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

  const renderCroppedBlob = useCallback(
    async (sourceUrl: string, postcardId: string) => {
      const imageResponse = await fetch(sourceUrl, { cache: 'no-store' });
      if (!imageResponse.ok) {
        throw new Error(text.cropSaveFailed);
      }

      const sourceBlob = await imageResponse.blob();
      const objectUrl = URL.createObjectURL(sourceBlob);

      try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const element = new Image();
          element.onload = () => resolve(element);
          element.onerror = () => reject(new Error(text.cropSaveFailed));
          element.src = objectUrl;
        });

        const imageWidth = image.naturalWidth || image.width;
        const imageHeight = image.naturalHeight || image.height;
        if (imageWidth <= 0 || imageHeight <= 0) {
          throw new Error(text.cropSaveFailed);
        }

        const normalized = toNormalizedCrop(cropDraft);
        const left = Math.max(0, Math.round(normalized.x * imageWidth));
        const top = Math.max(0, Math.round(normalized.y * imageHeight));
        const width = Math.max(1, Math.round(normalized.width * imageWidth));
        const height = Math.max(1, Math.round(normalized.height * imageHeight));
        const boundedWidth = Math.min(width, imageWidth - left);
        const boundedHeight = Math.min(height, imageHeight - top);

        const canvas = document.createElement('canvas');
        canvas.width = boundedWidth;
        canvas.height = boundedHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error(text.cropSaveFailed);
        }

        context.drawImage(
          image,
          left,
          top,
          boundedWidth,
          boundedHeight,
          0,
          0,
          boundedWidth,
          boundedHeight
        );

        const resultBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', 0.92)
        );
        if (!resultBlob) {
          throw new Error(text.cropSaveFailed);
        }

        return new File([resultBlob], `recrop-${postcardId}.jpg`, {
          type: 'image/jpeg'
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    },
    [cropDraft, text.cropSaveFailed]
  );

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
        const response = await apiFetch(
          `/api/postcards/${postcard.id}`,
          {
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
          },
          {
            userId: currentUserId,
            userEmail: currentUserEmail
          }
        );
        await parseJsonResponseOrThrow(response, text.editPostcardFailed);

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
      currentUserEmail,
      currentUserId,
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
      if (!editingCropOriginalUrl) {
        setDashboardStatus(text.cropNoImage);
        return;
      }

      setSavingCropPostcardId(postcardId);
      setDashboardStatus(text.cropSaving);

      try {
        const croppedFile = await renderCroppedBlob(editingCropOriginalUrl, postcardId);

        const formData = new FormData();
        formData.append('image', croppedFile);

        const uploadResponse = await apiFetch(
          '/api/upload-image',
          {
            method: 'POST',
            body: formData
          },
          {
            userId: currentUserId,
            userEmail: currentUserEmail
          }
        );
        const uploadPayload = await parseJsonResponseOrThrow<{ imageUrl?: string }>(
          uploadResponse,
          text.cropSaveFailed
        );
        if (!uploadPayload.imageUrl) {
          throw new Error(text.cropSaveFailed);
        }

        const response = await apiFetch(
          `/api/postcards/${postcardId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl: uploadPayload.imageUrl,
              originalImageUrl: editingCropOriginalUrl
            })
          },
          {
            userId: currentUserId,
            userEmail: currentUserEmail
          }
        );
        await parseJsonResponseOrThrow(response, text.cropSaveFailed);

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
      editingCropOriginalUrl,
      ensureAuthenticated,
      currentUserEmail,
      currentUserId,
      loadDashboardData,
      loadPublicPostcards,
      renderCroppedBlob,
      setDashboardStatus,
      text.cropNoImage,
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

      setDeletingPostcardId(postcard.id);
      setDashboardStatus(text.removeRunning);

      try {
        const response = await apiFetch(
          `/api/postcards/${postcard.id}`,
          {
            method: 'DELETE'
          },
          {
            userId: currentUserId,
            userEmail: currentUserEmail
          }
        );
        await parseJsonResponseOrThrow(response, text.removeFailed);

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
      currentUserEmail,
      currentUserId,
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
