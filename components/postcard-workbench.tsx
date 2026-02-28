'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import 'react-image-crop/dist/ReactCrop.css';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapViewportBounds, SavedMapMarker } from '@/components/open-map';
import { messages, type Locale } from '@/lib/i18n';
import { ExploreSection } from '@/components/workbench/explore-section';
import { CreateSection } from '@/components/workbench/create-section';
import { DashboardSection } from '@/components/workbench/dashboard-section';
import type {
  DashboardViewMode,
  DetectionDraft,
  DetectionJobRecord,
  DeviceLocation,
  ExploreSort,
  GeoPermissionState,
  PostcardEditDraft,
  PostcardRecord,
  PublicPostcardsPayload
} from '@/components/workbench/types';
import {
  type CropDraft,
  deriveOriginalImageUrl,
  parseLocationInput,
  sanitizePercentCrop,
  toNormalizedCrop
} from '@/components/workbench/utils';

type PostcardWorkbenchProps = {
  mode?: 'explore' | 'create' | 'dashboard' | 'full';
  locale?: Locale;
};

const DEFAULT_CROP_DRAFT: CropDraft = {
  unit: '%',
  x: 8,
  y: 10,
  width: 84,
  height: 54
};

function buildPostcardDraft(postcard: PostcardRecord): PostcardEditDraft {
  return {
    title: postcard.title ?? '',
    notes: postcard.notes ?? '',
    placeName: postcard.placeName ?? '',
    locationInput:
      typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number'
        ? `${postcard.latitude.toFixed(6)}, ${postcard.longitude.toFixed(6)}`
        : ''
  };
}

const OpenMap = dynamic(
  async () => {
    const mod = await import('@/components/open-map');
    return mod.OpenMap;
  },
  { ssr: false }
);

export function PostcardWorkbench({ mode = 'full', locale = 'en' }: PostcardWorkbenchProps) {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === 'authenticated';
  const text = messages[locale].workbench;

  const showExplore = mode === 'explore' || mode === 'full';
  const showCreate = mode === 'create' || mode === 'full';
  const showDashboard = mode === 'dashboard';

  const [searchText, setSearchText] = useState('');
  const [focusedMarkerId, setFocusedMarkerId] = useState<string | null>(null);
  const [postcards, setPostcards] = useState<PostcardRecord[]>([]);
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [exploreStatus, setExploreStatus] = useState('');
  const [exploreSort, setExploreSort] = useState<ExploreSort>('ranking');
  const [exploreLimit, setExploreLimit] = useState(120);
  const [visibleTotal, setVisibleTotal] = useState(0);
  const [visibleHasMore, setVisibleHasMore] = useState(false);
  const [mapBounds, setMapBounds] = useState<MapViewportBounds | null>(null);
  const [feedbackPendingKey, setFeedbackPendingKey] = useState<string | null>(null);

  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(null);
  const [viewerFocusSignal, setViewerFocusSignal] = useState(0);
  const [, setGeoPermission] = useState<GeoPermissionState>('prompt');
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);

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

  const [jobs, setJobs] = useState<DetectionJobRecord[]>([]);
  const [myPostcards, setMyPostcards] = useState<PostcardRecord[]>([]);
  const [jobDrafts, setJobDrafts] = useState<Record<string, DetectionDraft>>({});
  const [postcardDrafts, setPostcardDrafts] = useState<Record<string, PostcardEditDraft>>({});
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [savingPostcardId, setSavingPostcardId] = useState<string | null>(null);
  const [deletingPostcardId, setDeletingPostcardId] = useState<string | null>(null);
  const [editingCropPostcardId, setEditingCropPostcardId] = useState<string | null>(null);
  const [editingCropOriginalUrl, setEditingCropOriginalUrl] = useState<string | null>(null);
  const [cropDraft, setCropDraft] = useState<CropDraft>({ ...DEFAULT_CROP_DRAFT });
  const [savingCropPostcardId, setSavingCropPostcardId] = useState<string | null>(null);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isLoadingMine, setIsLoadingMine] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileEmail, setProfileEmail] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [dashboardStatus, setDashboardStatus] = useState('');
  const [dashboardViewMode, setDashboardViewMode] = useState<DashboardViewMode>('grid');

  const visiblePostcards = postcards;

  const publicMarkers = useMemo<SavedMapMarker[]>(() => {
    return visiblePostcards
      .filter((postcard) => typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number')
      .map((postcard) => ({
        id: postcard.id,
        title: postcard.title,
        latitude: postcard.latitude as number,
        longitude: postcard.longitude as number,
        placeName: postcard.placeName,
        imageUrl: postcard.imageUrl,
        notes: postcard.notes,
        createdAt: postcard.createdAt,
        locationStatus: postcard.locationStatus,
        aiConfidence: postcard.aiConfidence,
        aiPlaceGuess: postcard.aiPlaceGuess,
        locationModelVersion: postcard.locationModelVersion,
        uploaderName: postcard.uploaderName ?? null,
        likeCount: postcard.likeCount ?? 0,
        dislikeCount: postcard.dislikeCount ?? 0,
        wrongLocationReports: postcard.wrongLocationReports ?? 0
      }));
  }, [visiblePostcards]);

  const ensureAuthenticated = useCallback((): boolean => {
    if (!isAuthenticated) {
      setCreateStatus(text.authRequiredCreate);
      return false;
    }
    return true;
  }, [isAuthenticated, text.authRequiredCreate]);

  const requestDeviceLocation = useCallback(async (silent = false): Promise<boolean> => {
    if (!navigator.geolocation) {
      setGeoPermission('unsupported');
      if (!silent) {
        setExploreStatus(text.geoUnsupported);
      }
      return false;
    }

    setIsRequestingLocation(true);

    try {
      const granted = await new Promise<boolean>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setGeoPermission('granted');
            setDeviceLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy
            });
            resolve(true);
          },
          (error) => {
            if (error.code === error.PERMISSION_DENIED) {
              setGeoPermission('denied');
            } else {
              setGeoPermission('prompt');
            }
            resolve(false);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000
          }
        );
      });

      if (!granted && !silent) {
        setExploreStatus(text.geoLocateFailed);
      }

      if (granted && !silent) {
        setFocusedMarkerId(null);
        setViewerFocusSignal((current) => current + 1);
        setExploreStatus(text.geoLocated);
      }

      return granted;
    } finally {
      setIsRequestingLocation(false);
    }
  }, [text.geoLocateFailed, text.geoLocated, text.geoUnsupported]);

  const handleViewportChange = useCallback((bounds: MapViewportBounds) => {
    setMapBounds((current) => {
      if (!current) {
        return bounds;
      }

      const threshold = 0.0001;
      const unchanged =
        Math.abs(current.north - bounds.north) < threshold &&
        Math.abs(current.south - bounds.south) < threshold &&
        Math.abs(current.east - bounds.east) < threshold &&
        Math.abs(current.west - bounds.west) < threshold;

      return unchanged ? current : bounds;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    let permissionStatus: PermissionStatus | null = null;

    async function loadPermissionStatus() {
      if (!navigator.geolocation) {
        setGeoPermission('unsupported');
        return;
      }

      if (!navigator.permissions) {
        setGeoPermission('prompt');
        return;
      }

      try {
        permissionStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });

        if (!isMounted) {
          return;
        }

        setGeoPermission(permissionStatus.state as GeoPermissionState);
        permissionStatus.onchange = () => {
          setGeoPermission(permissionStatus?.state as GeoPermissionState);
        };

        if (permissionStatus.state === 'granted') {
          await requestDeviceLocation(true);
        }
      } catch {
        setGeoPermission('prompt');
      }
    }

    void loadPermissionStatus();

    return () => {
      isMounted = false;
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, [requestDeviceLocation]);

  const loadPublicPostcards = useCallback(async () => {
    if (!mapBounds || !showExplore) {
      return;
    }

    setIsLoadingPublic(true);
    try {
      const params = new URLSearchParams({
        sort: exploreSort,
        limit: String(exploreLimit),
        north: String(mapBounds.north),
        south: String(mapBounds.south),
        east: String(mapBounds.east),
        west: String(mapBounds.west)
      });

      const query = searchText.trim();
      if (query) {
        params.set('q', query);
      }

      const response = await fetch(`/api/postcards?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(text.exploreLoadFailed);
      }

      const data = (await response.json()) as PublicPostcardsPayload | PostcardRecord[];
      if (Array.isArray(data)) {
        setPostcards(data);
        setVisibleTotal(data.length);
        setVisibleHasMore(false);
        return;
      }

      setPostcards(data.items ?? []);
      setVisibleTotal(typeof data.total === 'number' ? data.total : data.items?.length ?? 0);
      setVisibleHasMore(Boolean(data.hasMore));
    } catch (error) {
      setExploreStatus(error instanceof Error ? error.message : text.exploreUnknownError);
    } finally {
      setIsLoadingPublic(false);
    }
  }, [
    mapBounds,
    showExplore,
    exploreSort,
    exploreLimit,
    searchText,
    text.exploreLoadFailed,
    text.exploreUnknownError
  ]);

  useEffect(() => {
    if (!showExplore || !mapBounds) {
      return;
    }

    const timeout = setTimeout(() => {
      void loadPublicPostcards();
    }, 180);

    return () => clearTimeout(timeout);
  }, [showExplore, mapBounds, loadPublicPostcards]);

  useEffect(() => {
    return () => {
      if (aiRedirectTimerRef.current) {
        clearTimeout(aiRedirectTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showDashboard || !isAuthenticated) {
      return;
    }

    void loadDashboardData();
    // loadDashboardData uses current render values and should only run on auth/page state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDashboard, isAuthenticated]);

  useEffect(() => {
    setJobDrafts((current) => {
      const next = { ...current };
      let changed = false;

      for (const job of jobs) {
        if (next[job.id]) {
          continue;
        }

        if (job.status !== 'SUCCEEDED' || job.latitude === null || job.longitude === null) {
          continue;
        }

        next[job.id] = {
          title: job.placeGuess?.trim() ? `AI: ${job.placeGuess}` : text.aiDetectedPostcardTitle,
          notes: '',
          locationInput: `${job.latitude.toFixed(6)}, ${job.longitude.toFixed(6)}`
        };
        changed = true;
      }

      return changed ? next : current;
    });
  }, [jobs, text.aiDetectedPostcardTitle]);

  async function submitExploreFeedback(
    postcardId: string,
    action: 'like' | 'dislike' | 'report_wrong_location'
  ) {
    if (!isAuthenticated) {
      setExploreStatus(text.feedbackRequireAuth);
      return;
    }

    const key = `${postcardId}:${action}`;
    setFeedbackPendingKey(key);

    try {
      const response = await fetch(`/api/postcards/${postcardId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      const payload = (await response.json()) as {
        error?: string;
        result?: 'added' | 'removed' | 'switched' | 'already_reported';
        action?: 'like' | 'dislike' | 'report_wrong_location';
      };
      if (!response.ok) {
        throw new Error(payload.error ?? text.feedbackFailed);
      }

      const feedbackAction = payload.action ?? action;
      const result = payload.result ?? 'added';
      if (feedbackAction === 'like') {
        setExploreStatus(result === 'removed' ? text.feedbackLikeRemoved : text.feedbackThanksLike);
      } else if (feedbackAction === 'dislike') {
        setExploreStatus(result === 'removed' ? text.feedbackDislikeRemoved : text.feedbackDislikeRecorded);
      } else {
        setExploreStatus(text.feedbackWrongLocation);
      }
      await loadPublicPostcards();
    } catch (error) {
      setExploreStatus(error instanceof Error ? error.message : text.feedbackUnknownError);
    } finally {
      setFeedbackPendingKey(null);
    }
  }

  async function loadDashboardData() {
    setDashboardStatus('');
    setIsLoadingJobs(true);
    setIsLoadingMine(true);
    setIsLoadingProfile(true);

    try {
      const [jobsResponse, mineResponse, profileResponse] = await Promise.all([
        fetch('/api/location-from-image', { cache: 'no-store' }),
        fetch('/api/postcards?mine=1', { cache: 'no-store' }),
        fetch('/api/profile', { cache: 'no-store' })
      ]);

      if (!jobsResponse.ok) {
        throw new Error(text.dashboardLoadJobsFailed);
      }

      if (!mineResponse.ok) {
        throw new Error(text.dashboardLoadMineFailed);
      }
      if (!profileResponse.ok) {
        throw new Error(text.dashboardUnknownError);
      }

      const jobsData = (await jobsResponse.json()) as DetectionJobRecord[];
      const mineData = (await mineResponse.json()) as PostcardRecord[];
      const profileData = (await profileResponse.json()) as { email?: string; displayName?: string | null };
      setJobs(jobsData);
      setMyPostcards(mineData);
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
      setIsLoadingProfile(false);
    }
  }

  async function submitAiDetectJob(event: FormEvent) {
    event.preventDefault();

    if (!ensureAuthenticated()) {
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

      const payload = (await response.json()) as { id?: string; imageUrl?: string; error?: string; message?: string };

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
  }

  async function saveManualPostcard() {
    if (!ensureAuthenticated()) {
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
  }

  function updateJobDraft(jobId: string, patch: Partial<DetectionDraft>) {
    setJobDrafts((current) => ({
      ...current,
      [jobId]: {
        ...(current[jobId] ?? {
          title: '',
          notes: '',
          locationInput: ''
        }),
        ...patch
      }
    }));
  }

  function updatePostcardDraft(postcardId: string, patch: Partial<PostcardEditDraft>) {
    setPostcardDrafts((current) => ({
      ...current,
      [postcardId]: {
        ...(current[postcardId] ?? {
          title: '',
          notes: '',
          placeName: '',
          locationInput: ''
        }),
        ...patch
      }
    }));
  }

  function isJobAlreadySaved(job: DetectionJobRecord): boolean {
    return myPostcards.some((postcard) => postcard.imageUrl === job.imageUrl);
  }

  async function saveDetectedJobAsPostcard(job: DetectionJobRecord) {
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

    const draft = jobDrafts[job.id] ?? {
      title: job.placeGuess?.trim() ? `AI: ${job.placeGuess}` : text.aiDetectedPostcardTitle,
      notes: '',
      locationInput: `${job.latitude.toFixed(6)}, ${job.longitude.toFixed(6)}`
    };

    if (!draft.title.trim()) {
      setDashboardStatus(text.aiSaveNameRequired);
      return;
    }

    let coords: { latitude: number; longitude: number };
    try {
      coords = parseLocationInput(draft.locationInput, text);
    } catch (error) {
      setDashboardStatus(error instanceof Error ? error.message : text.aiSaveInvalidLocation);
      return;
    }

    setSavingJobId(job.id);
    setDashboardStatus(text.aiSaveSaving);

    try {
      const response = await fetch('/api/postcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title.trim(),
          notes: draft.notes.trim() ? draft.notes.trim() : undefined,
          imageUrl: job.imageUrl,
          originalImageUrl: deriveOriginalImageUrl(job.imageUrl) ?? undefined,
          placeName: job.placeGuess ?? undefined,
          latitude: coords.latitude,
          longitude: coords.longitude,
          aiLatitude: job.latitude,
          aiLongitude: job.longitude,
          aiConfidence: job.confidence ?? undefined,
          aiPlaceGuess: job.placeGuess ?? undefined,
          locationStatus: 'USER_CONFIRMED',
          locationModelVersion: job.modelVersion ?? undefined
        })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? text.aiSaveFailed);
      }

      await Promise.all([loadDashboardData(), loadPublicPostcards()]);
      setDashboardStatus(text.aiSaveDone);
    } catch (error) {
      setDashboardStatus(error instanceof Error ? error.message : text.aiSaveUnknownError);
    } finally {
      setSavingJobId(null);
    }
  }

  async function saveProfileDisplayName() {
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
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName })
      });

      const payload = (await response.json()) as { error?: string; displayName?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? text.profileSaveFailed);
      }

      setProfileDisplayName(payload.displayName ?? displayName);
      setDashboardStatus(text.profileSaved);
      await loadPublicPostcards();
    } catch (error) {
      setDashboardStatus(error instanceof Error ? error.message : text.profileUnknownError);
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function savePostcardEdits(postcard: PostcardRecord) {
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
      notes: draft.notes.trim(),
      placeName: draft.placeName.trim(),
      locationInput:
        latitude !== null && longitude !== null
          ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
          : ''
    };
    const hasChanges =
      normalizedOriginal.title !== normalizedCurrent.title ||
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
  }

  function openCropEditor(postcard: PostcardRecord) {
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
  }

  function closeCropEditor() {
    setEditingCropPostcardId(null);
    setEditingCropOriginalUrl(null);
  }

  async function saveCropEdit(postcardId: string) {
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
  }

  async function softDeletePostcard(postcard: PostcardRecord) {
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
  }

  const isExploreOnlyPage = mode === 'explore';

  const workbenchClassName = [
    'grid gap-3',
    showExplore && showCreate ? 'grid-cols-[1.28fr_0.86fr] max-[1080px]:grid-cols-1' : 'grid-cols-1',
    isExploreOnlyPage ? 'h-full min-h-0 overflow-hidden max-[1080px]:overflow-visible' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const exploreMapClassName = isExploreOnlyPage
    ? 'h-full min-h-0 max-[1080px]:h-[460px] max-[1080px]:min-h-[460px] max-[780px]:h-[380px] max-[780px]:min-h-[380px]'
    : 'h-[540px] min-h-[560px] max-[1080px]:h-[460px] max-[1080px]:min-h-[460px] max-[780px]:h-[380px] max-[780px]:min-h-[380px]';

  return (
    <section className={workbenchClassName}>
      {showExplore ? (
        <ExploreSection
          text={text}
          isAuthenticated={isAuthenticated}
          visiblePostcards={visiblePostcards}
          publicMarkerCount={publicMarkers.length}
          visibleTotal={visibleTotal}
          visibleHasMore={visibleHasMore}
          exploreLimit={exploreLimit}
          exploreSort={exploreSort}
          searchText={searchText}
          mapBoundsLoaded={Boolean(mapBounds)}
          isLoadingPublic={isLoadingPublic}
          exploreStatus={exploreStatus}
          focusedMarkerId={focusedMarkerId}
          feedbackPendingKey={feedbackPendingKey}
          onSearchChange={setSearchText}
          onSortChange={setExploreSort}
          onLimitChange={setExploreLimit}
          onSubmitFeedback={(postcardId, action) => void submitExploreFeedback(postcardId, action)}
          onSignIn={() => signIn('google')}
          mapNode={
            <OpenMap
              className={exploreMapClassName}
              markers={publicMarkers}
              focusedMarkerId={focusedMarkerId}
              viewerFocusSignal={viewerFocusSignal}
              onLocateRequest={() => requestDeviceLocation(false)}
              isLocating={isRequestingLocation}
              onViewportChange={handleViewportChange}
              viewerPoint={
                deviceLocation
                  ? {
                      latitude: deviceLocation.latitude,
                      longitude: deviceLocation.longitude,
                      label: text.exploreViewerLabel,
                      accuracy: deviceLocation.accuracy
                    }
                  : undefined
              }
            />
          }
        />
      ) : null}

      {showCreate ? (
        <CreateSection
          text={text}
          isAuthenticated={isAuthenticated}
          isSubmittingAi={isSubmittingAi}
          isSavingManual={isSavingManual}
          aiFile={aiFile}
          manualTitle={manualTitle}
          manualNotes={manualNotes}
          manualLocationInput={manualLocationInput}
          aiInputVersion={aiInputVersion}
          createStatus={createStatus}
          queuedAiJobId={queuedAiJobId}
          queuedAiImageUrl={queuedAiImageUrl}
          onSignIn={() => signIn('google')}
          onSubmitAi={submitAiDetectJob}
          onAiFileChange={setAiFile}
          onOpenDashboard={() => router.push('/dashboard')}
          onManualTitleChange={setManualTitle}
          onManualNotesChange={setManualNotes}
          onManualLocationInputChange={setManualLocationInput}
          onManualFileChange={setManualFile}
          onSaveManual={() => void saveManualPostcard()}
        />
      ) : null}

      {showDashboard ? (
        <DashboardSection
          text={text}
          isAuthenticated={isAuthenticated}
          jobs={jobs}
          myPostcards={myPostcards}
          jobDrafts={jobDrafts}
          postcardDrafts={postcardDrafts}
          savingJobId={savingJobId}
          savingPostcardId={savingPostcardId}
          deletingPostcardId={deletingPostcardId}
          editingCropPostcardId={editingCropPostcardId}
          editingCropOriginalUrl={editingCropOriginalUrl}
          cropDraft={cropDraft}
          savingCropPostcardId={savingCropPostcardId}
          isLoadingJobs={isLoadingJobs}
          isLoadingMine={isLoadingMine}
          isLoadingProfile={isLoadingProfile}
          isSavingProfile={isSavingProfile}
          profileEmail={profileEmail}
          profileDisplayName={profileDisplayName}
          dashboardStatus={dashboardStatus}
          dashboardViewMode={dashboardViewMode}
          onSignIn={() => signIn('google')}
          onProfileDisplayNameChange={setProfileDisplayName}
          onSaveProfileDisplayName={() => void saveProfileDisplayName()}
          onSetDashboardViewMode={setDashboardViewMode}
          onRefresh={() => void loadDashboardData()}
          onUpdateJobDraft={updateJobDraft}
          onUpdatePostcardDraft={updatePostcardDraft}
          onSaveDetectedJob={(job) => void saveDetectedJobAsPostcard(job)}
          onSavePostcard={(postcard) => void savePostcardEdits(postcard)}
          isJobAlreadySaved={isJobAlreadySaved}
          onOpenCropEditor={openCropEditor}
          onSaveCrop={(postcardId) => void saveCropEdit(postcardId)}
          onCloseCropEditor={closeCropEditor}
          onSoftDelete={(postcard) => void softDeletePostcard(postcard)}
          onCropChange={(percentCrop) => setCropDraft((current) => sanitizePercentCrop(percentCrop, current))}
        />
      ) : null}
    </section>
  );
}
