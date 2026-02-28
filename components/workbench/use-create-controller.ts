'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import { parseLocationInput } from '@/components/workbench/utils';

type UseCreateControllerArgs = {
  text: WorkbenchText;
  isAuthenticated: boolean;
  loadPublicPostcards: () => Promise<void>;
};

export function useCreateController({ text, isAuthenticated, loadPublicPostcards }: UseCreateControllerArgs) {
  const router = useRouter();

  const [aiFile, setAiFile] = useState<File | null>(null);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualTitle, setManualTitle] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualLocationInput, setManualLocationInput] = useState('');
  const [isSubmittingAi, setIsSubmittingAi] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [createStatus, setCreateStatus] = useState('');
  const [queuedAiJobId, setQueuedAiJobId] = useState<string | null>(null);
  const [queuedAiImageUrl, setQueuedAiImageUrl] = useState<string | null>(null);
  const [aiInputVersion, setAiInputVersion] = useState(0);
  const aiRedirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ensureCreateAuthenticated = useCallback((): boolean => {
    if (!isAuthenticated) {
      setCreateStatus(text.authRequiredCreate);
      return false;
    }

    return true;
  }, [isAuthenticated, text.authRequiredCreate]);

  const submitAiDetectJob = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      if (!ensureCreateAuthenticated()) {
        return;
      }

      if (!aiFile) {
        setCreateStatus(text.aiNeedImage);
        return;
      }

      if (aiRedirectTimerRef.current) {
        clearTimeout(aiRedirectTimerRef.current);
      }

      setQueuedAiJobId(null);
      setQueuedAiImageUrl(null);
      setIsSubmittingAi(true);
      setCreateStatus(text.aiSubmitting);

      try {
        const formData = new FormData();
        formData.append('image', aiFile);

        const response = await fetch('/api/location-from-image', {
          method: 'POST',
          body: formData
        });

        if (response.status === 401) {
          throw new Error(text.aiUnauthorized);
        }

        const payload = (await response.json()) as {
          id?: string;
          imageUrl?: string;
          error?: string;
          message?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? text.aiSubmitFailed);
        }

        setAiFile(null);
        setAiInputVersion((current) => current + 1);
        setQueuedAiJobId(payload.id ?? null);
        setQueuedAiImageUrl(payload.imageUrl ?? null);
        setCreateStatus(text.aiDetectionSubmitted(payload.id ?? 'unknown'));
        aiRedirectTimerRef.current = setTimeout(() => {
          router.push('/dashboard');
        }, 1400);
      } catch (error) {
        setCreateStatus(error instanceof Error ? error.message : text.aiUnknownError);
      } finally {
        setIsSubmittingAi(false);
      }
    },
    [aiFile, ensureCreateAuthenticated, router, text]
  );

  const saveManualPostcard = useCallback(async () => {
    if (!ensureCreateAuthenticated()) {
      return;
    }

    if (!manualTitle.trim()) {
      setCreateStatus(text.manualNameRequired);
      return;
    }

    if (!manualFile) {
      setCreateStatus(text.manualImageRequired);
      return;
    }

    let coords: { latitude: number; longitude: number };
    try {
      coords = parseLocationInput(manualLocationInput, text);
    } catch (error) {
      setCreateStatus(error instanceof Error ? error.message : text.manualInvalidLocation);
      return;
    }

    setIsSavingManual(true);
    setCreateStatus(text.manualUploadingImage);

    try {
      const uploadForm = new FormData();
      uploadForm.append('image', manualFile);

      const uploadResponse = await fetch('/api/upload-image', {
        method: 'POST',
        body: uploadForm
      });

      if (uploadResponse.status === 401) {
        throw new Error(text.aiUnauthorized);
      }

      const uploadPayload = (await uploadResponse.json()) as { imageUrl?: string; error?: string };
      if (!uploadResponse.ok || !uploadPayload.imageUrl) {
        throw new Error(uploadPayload.error ?? text.manualImageUploadFailed);
      }

      setCreateStatus(text.manualSaving);

      const createResponse = await fetch('/api/postcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: manualTitle,
          notes: manualNotes,
          imageUrl: uploadPayload.imageUrl,
          latitude: coords.latitude,
          longitude: coords.longitude,
          locationStatus: 'MANUAL'
        })
      });

      const createPayload = (await createResponse.json()) as { error?: string };

      if (createResponse.status === 401) {
        throw new Error(text.aiUnauthorized);
      }

      if (!createResponse.ok) {
        throw new Error(createPayload.error ?? text.manualCreateFailed);
      }

      setManualTitle('');
      setManualNotes('');
      setManualLocationInput('');
      setManualFile(null);
      setCreateStatus(text.manualCreated);
      await loadPublicPostcards();
    } catch (error) {
      setCreateStatus(error instanceof Error ? error.message : text.manualUnknownError);
    } finally {
      setIsSavingManual(false);
    }
  }, [ensureCreateAuthenticated, loadPublicPostcards, manualFile, manualLocationInput, manualNotes, manualTitle, text]);

  const openDashboard = useCallback(() => {
    router.push('/dashboard');
  }, [router]);

  useEffect(() => {
    return () => {
      if (aiRedirectTimerRef.current) {
        clearTimeout(aiRedirectTimerRef.current);
      }
    };
  }, []);

  return {
    aiFile,
    manualFile,
    manualTitle,
    manualNotes,
    manualLocationInput,
    isSubmittingAi,
    isSavingManual,
    createStatus,
    queuedAiJobId,
    queuedAiImageUrl,
    aiInputVersion,
    setAiFile,
    setManualFile,
    setManualTitle,
    setManualNotes,
    setManualLocationInput,
    submitAiDetectJob,
    saveManualPostcard,
    openDashboard
  };
}
