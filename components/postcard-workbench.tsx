'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import ReactCrop, { type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapViewportBounds, SavedMapMarker } from '@/components/open-map';
import { messages, type Locale } from '@/lib/i18n';

type PostcardRecord = {
  id: string;
  title: string;
  notes: string | null;
  placeName: string | null;
  imageUrl: string | null;
  originalImageUrl?: string | null;
  latitude: number | null;
  longitude: number | null;
  aiConfidence: number | null;
  aiPlaceGuess: string | null;
  likeCount: number;
  dislikeCount: number;
  wrongLocationReports: number;
  locationStatus: 'AUTO' | 'USER_CONFIRMED' | 'MANUAL';
  locationModelVersion: string | null;
  uploaderMasked?: string | null;
  createdAt: string;
};

type PublicPostcardsPayload = {
  items: PostcardRecord[];
  total: number;
  hasMore: boolean;
  limit: number;
  sort: 'ranking' | 'newest' | 'likes' | 'reports';
};

type DetectionJobRecord = {
  id: string;
  imageUrl: string;
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  latitude: number | null;
  longitude: number | null;
  confidence: number | null;
  placeGuess: string | null;
  modelVersion: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type GeoPermissionState = 'checking' | 'prompt' | 'granted' | 'denied' | 'unsupported';

type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type DetectionDraft = {
  title: string;
  notes: string;
  locationInput: string;
};

type CropDraft = PercentCrop;

type PostcardWorkbenchProps = {
  mode?: 'explore' | 'create' | 'dashboard' | 'full';
  locale?: Locale;
};

type ExploreSort = 'ranking' | 'newest' | 'likes' | 'reports';

const DEFAULT_CROP_DRAFT: CropDraft = {
  unit: '%',
  x: 8,
  y: 10,
  width: 84,
  height: 54
};

const OpenMap = dynamic(
  async () => {
    const mod = await import('@/components/open-map');
    return mod.OpenMap;
  },
  { ssr: false }
);

function parseLocationInput(
  input: string,
  text: {
    parseLocationTwoNumbers: string;
    parseLocationNumeric: string;
    parseLocationRange: string;
  }
): { latitude: number; longitude: number } {
  const parts = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length !== 2) {
    throw new Error(text.parseLocationTwoNumbers);
  }

  const first = Number(parts[0]);
  const second = Number(parts[1]);

  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    throw new Error(text.parseLocationNumeric);
  }

  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
    return { latitude: first, longitude: second };
  }

  if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
    return { latitude: second, longitude: first };
  }

  throw new Error(text.parseLocationRange);
}

function deriveOriginalImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) {
    return null;
  }

  if (imageUrl.includes('/uploads/original/')) {
    return imageUrl;
  }

  if (imageUrl.includes('/uploads/postcard/')) {
    const fileName = imageUrl.split('/').pop()?.toLowerCase() ?? '';
    if (fileName.includes('recrop-')) {
      return null;
    }
    return imageUrl.replace('/uploads/postcard/', '/uploads/original/');
  }

  return null;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizePercentCrop(crop: Partial<PercentCrop>, fallback: CropDraft = DEFAULT_CROP_DRAFT): CropDraft {
  const x = clampNumber(crop.x ?? fallback.x ?? DEFAULT_CROP_DRAFT.x ?? 0, 0, 99);
  const y = clampNumber(crop.y ?? fallback.y ?? DEFAULT_CROP_DRAFT.y ?? 0, 0, 99);

  let width = clampNumber(crop.width ?? fallback.width ?? DEFAULT_CROP_DRAFT.width ?? 50, 1, 100);
  let height = clampNumber(crop.height ?? fallback.height ?? DEFAULT_CROP_DRAFT.height ?? 50, 1, 100);

  if (x + width > 100) {
    width = Math.max(1, 100 - x);
  }
  if (y + height > 100) {
    height = Math.max(1, 100 - y);
  }

  return {
    unit: '%',
    x,
    y,
    width,
    height
  };
}

function toNormalizedCrop(crop: CropDraft): { x: number; y: number; width: number; height: number } {
  const sanitized = sanitizePercentCrop(crop);
  const x = clampNumber(sanitized.x ?? 0, 0, 95);
  const y = clampNumber(sanitized.y ?? 0, 0, 95);
  const maxWidth = Math.max(5, 100 - x);
  const maxHeight = Math.max(5, 100 - y);
  const width = clampNumber(sanitized.width ?? 84, 5, maxWidth);
  const height = clampNumber(sanitized.height ?? 54, 5, maxHeight);

  return {
    x: Number((x / 100).toFixed(6)),
    y: Number((y / 100).toFixed(6)),
    width: Number((width / 100).toFixed(6)),
    height: Number((height / 100).toFixed(6))
  };
}

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
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [deletingPostcardId, setDeletingPostcardId] = useState<string | null>(null);
  const [editingCropPostcardId, setEditingCropPostcardId] = useState<string | null>(null);
  const [editingCropOriginalUrl, setEditingCropOriginalUrl] = useState<string | null>(null);
  const [cropDraft, setCropDraft] = useState<CropDraft>({ ...DEFAULT_CROP_DRAFT });
  const [savingCropPostcardId, setSavingCropPostcardId] = useState<string | null>(null);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isLoadingMine, setIsLoadingMine] = useState(false);
  const [dashboardStatus, setDashboardStatus] = useState('');
  const [dashboardViewMode, setDashboardViewMode] = useState<'grid' | 'list'>('grid');

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
        uploaderMasked: postcard.uploaderMasked ?? null,
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

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? text.feedbackFailed);
      }

      setExploreStatus(
        action === 'like'
          ? text.feedbackThanksLike
          : action === 'dislike'
            ? text.feedbackDislikeRecorded
            : text.feedbackWrongLocation
      );
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

    try {
      const [jobsResponse, mineResponse] = await Promise.all([
        fetch('/api/location-from-image', { cache: 'no-store' }),
        fetch('/api/postcards?mine=1', { cache: 'no-store' })
      ]);

      if (!jobsResponse.ok) {
        throw new Error(text.dashboardLoadJobsFailed);
      }

      if (!mineResponse.ok) {
        throw new Error(text.dashboardLoadMineFailed);
      }

      const jobsData = (await jobsResponse.json()) as DetectionJobRecord[];
      const mineData = (await mineResponse.json()) as PostcardRecord[];
      setJobs(jobsData);
      setMyPostcards(mineData);
    } catch (error) {
      setDashboardStatus(error instanceof Error ? error.message : text.dashboardUnknownError);
    } finally {
      setIsLoadingJobs(false);
      setIsLoadingMine(false);
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
  const panelClassName =
    'relative rounded-[22px] border border-white/60 bg-[linear-gradient(165deg,rgba(255,255,255,0.96),rgba(245,255,246,0.92))] p-[0.88rem] shadow-[0_16px_34px_rgba(57,78,66,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] max-[780px]:rounded-2xl max-[780px]:p-3';
  const sectionHeadClassName = 'mb-2 grid gap-1.5';
  const chipRowClassName = 'flex flex-wrap gap-1.5';
  const chipClassName =
    'inline-flex items-center rounded-full border border-[#d6e8d4] bg-[#f4fff4] px-2.5 py-1 text-[0.78rem] font-bold text-[#2b6442]';
  const inlineFieldClassName = 'mb-0 grid gap-1.5 text-[0.91rem] font-bold text-[#39604f]';
  const postcardItemClassName = 'grid gap-1.5 rounded-[14px] border border-[#e2eee0] bg-[#f8fffc] px-3 py-2.5';
  const postcardItemHeadClassName = 'flex items-center justify-between gap-2';
  const exploreResultsClassName =
    'grid min-h-0 gap-2 overflow-auto pr-1 max-[1080px]:max-h-none max-[1080px]:overflow-visible max-[1080px]:pr-0';
  const smallMutedClassName = 'text-[0.82rem] text-[#5f736c]';
  const actionButtonClassName =
    'rounded-[10px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-2.5 py-1.5 text-[0.83rem] font-bold text-white shadow-[0_4px_10px_rgba(47,158,88,0.18)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';
  const actionButtonWarnClassName =
    'rounded-[10px] bg-[linear-gradient(135deg,#f4c742,#e5a634)] px-2.5 py-1.5 text-[0.83rem] font-bold text-[#25361f] shadow-[0_4px_10px_rgba(229,166,52,0.25)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';
  const cardThumbClassName = 'h-auto max-h-[160px] w-full rounded-[10px] border border-[#deeadb] object-cover';
  const formStackClassName = 'grid gap-0.5';
  const authCalloutClassName =
    'grid gap-2 rounded-[14px] border border-[#dce8d7] bg-[linear-gradient(145deg,rgba(243,251,226,0.8),rgba(241,255,251,0.8))] p-3';
  const statusBoxClassName = 'grid gap-1 rounded-[14px] border border-[#e3eddc] bg-[#fbfffa] p-3';
  const statusSuccessClassName =
    'grid gap-1 rounded-[14px] border border-[#b9e3c3] bg-[linear-gradient(145deg,rgba(230,255,236,0.92),rgba(243,255,250,0.95))] p-3';
  const dashboardToolbarClassName =
    'flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#deead9] bg-[linear-gradient(140deg,rgba(244,255,245,0.95),rgba(247,254,255,0.92))] px-2.5 py-2';
  const cropEditorClassName = 'grid gap-2 rounded-xl border border-dashed border-[#c9dfc7] bg-[#f6fff6] p-2.5';
  const cropPreviewClassName = 'w-full overflow-hidden rounded-[10px] border border-[#d8e7d8] bg-[#edf4ed]';
  const cropImageClassName = 'block h-auto max-h-[420px] w-full bg-[#edf4ed] object-contain';

  const workbenchClassName = [
    'grid gap-3',
    showExplore && showCreate ? 'grid-cols-[1.28fr_0.86fr] max-[1080px]:grid-cols-1' : 'grid-cols-1',
    isExploreOnlyPage ? 'h-full min-h-0 overflow-hidden max-[1080px]:overflow-visible' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const explorePanelClassName = `${panelClassName} grid min-h-0 grid-cols-[minmax(320px,390px)_minmax(0,1fr)] items-stretch gap-2 max-[1080px]:grid-cols-1`;
  const exploreSidebarClassName =
    'grid min-h-0 content-stretch grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-2 max-[1080px]:order-2 max-[1080px]:grid-rows-[auto_auto_auto_auto]';
  const exploreMapPaneClassName = 'min-w-0 max-[1080px]:order-1';
  const exploreMapClassName = isExploreOnlyPage
    ? 'h-full min-h-0 max-[1080px]:h-[460px] max-[1080px]:min-h-[460px] max-[780px]:h-[380px] max-[780px]:min-h-[380px]'
    : 'h-[540px] min-h-[560px] max-[1080px]:h-[460px] max-[1080px]:min-h-[460px] max-[780px]:h-[380px] max-[780px]:min-h-[380px]';
  const dashboardListClassName =
    dashboardViewMode === 'grid'
      ? 'mt-2 grid grid-cols-2 gap-2 max-[780px]:grid-cols-1'
      : 'mt-2 grid grid-cols-1 gap-2';
  const inputClassName =
    'w-full rounded-[13px] border border-[#d8e6d5] bg-[#fdfffc] px-3 py-2 text-[#1f2e29] outline-none transition focus:border-[#72b485] focus:ring-4 focus:ring-[rgba(86,179,106,0.18)] disabled:opacity-60';
  const primaryButtonClassName =
    'rounded-[13px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-4 py-2.5 font-bold text-white shadow-[0_8px_16px_rgba(47,158,88,0.23)] transition hover:enabled:-translate-y-px hover:enabled:shadow-[0_11px_18px_rgba(47,158,88,0.27)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';

  return (
    <section className={workbenchClassName}>
      {showExplore ? (
        <article className={explorePanelClassName}>
          <aside className={exploreSidebarClassName}>
            <div className={sectionHeadClassName}>
              <h2>{text.exploreTitle}</h2>
              <div className={chipRowClassName}>
                <span className={chipClassName}>{text.chipLoaded(visiblePostcards.length)}</span>
                <span className={chipClassName}>{text.chipMarkers(publicMarkers.length)}</span>
                <span className={chipClassName}>{text.chipInArea(visibleTotal)}</span>
                {visibleHasMore ? <span className={chipClassName}>{text.chipLimitedTo(exploreLimit)}</span> : null}
              </div>
            </div>

            <details className="rounded-xl border border-[#dce9d8] bg-[#fbfffa] px-2.5 pb-2.5 pt-1">
              <summary className="cursor-pointer py-2 font-bold text-[#2b6442] marker:text-[#5a7b67]">{text.exploreFiltersTitle}</summary>
              <div className="grid gap-2 pt-1">
                <label className={inlineFieldClassName}>
                  {text.exploreSearchLabel}
                  <input
                    className={inputClassName}
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder={text.exploreSearchPlaceholder}
                  />
                </label>
                <label className={inlineFieldClassName}>
                  {text.exploreSortLabel}
                  <select className={inputClassName} value={exploreSort} onChange={(event) => setExploreSort(event.target.value as ExploreSort)}>
                    <option value="ranking">{text.exploreSortRanking}</option>
                    <option value="newest">{text.exploreSortNewest}</option>
                    <option value="likes">{text.exploreSortLikes}</option>
                    <option value="reports">{text.exploreSortReports}</option>
                  </select>
                </label>
                <label className={inlineFieldClassName}>
                  {text.exploreMaxResultsLabel}
                  <select className={inputClassName} value={exploreLimit} onChange={(event) => setExploreLimit(Number(event.target.value))}>
                    <option value={60}>60</option>
                    <option value={120}>120</option>
                    <option value={200}>200</option>
                  </select>
                </label>
              </div>
            </details>

            <div className="grid gap-0.5 border-y border-[#e1ece0] px-0.5 py-1">
              {!mapBounds ? <small className={smallMutedClassName}>{text.exploreLoadingArea}</small> : null}
              {isLoadingPublic ? <small className={smallMutedClassName}>{text.exploreLoadingPostcards}</small> : null}
              {!isLoadingPublic && mapBounds && visiblePostcards.length === 0 ? (
                <small className={smallMutedClassName}>{text.exploreNoResults}</small>
              ) : null}
              {exploreStatus ? <small className={smallMutedClassName}>{exploreStatus}</small> : null}
            </div>

            <div className={exploreResultsClassName}>
              {visiblePostcards.map((postcard) => {
                const hasMapPoint = typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number';
                const cardClassName = [
                  postcardItemClassName,
                  focusedMarkerId === postcard.id ? 'border-[#7ecb95] ring-2 ring-[rgba(86,179,106,0.2)]' : '',
                  hasMapPoint ? 'cursor-pointer hover:border-[#95d7a7] hover:ring-2 hover:ring-[rgba(86,179,106,0.16)] focus-visible:outline-2 focus-visible:outline-[rgba(86,179,106,0.45)] focus-visible:outline-offset-2' : ''
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <article
                    key={postcard.id}
                    className={cardClassName}
                    onClick={() => {
                      if (hasMapPoint) {
                        setFocusedMarkerId(postcard.id);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (!hasMapPoint) {
                        return;
                      }
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setFocusedMarkerId(postcard.id);
                      }
                    }}
                    role={hasMapPoint ? 'button' : undefined}
                    tabIndex={hasMapPoint ? 0 : undefined}
                    aria-label={hasMapPoint ? text.exploreFocusOnMapAria(postcard.title) : undefined}
                  >
                    {postcard.imageUrl ? (
                      <Image
                        className={cardThumbClassName}
                        src={postcard.imageUrl}
                        alt={postcard.title}
                        width={640}
                        height={420}
                      />
                    ) : null}
                    <div className={postcardItemHeadClassName}>
                      <strong>{postcard.title}</strong>
                      <small className={smallMutedClassName}>{new Date(postcard.createdAt).toLocaleDateString(text.dateLocale)}</small>
                    </div>
                    <small className={smallMutedClassName}>{postcard.placeName || text.exploreUnknownPlace}</small>
                    {postcard.uploaderMasked ? <small className={smallMutedClassName}>{text.exploreUploaderBy(postcard.uploaderMasked)}</small> : null}
                    <small className={smallMutedClassName}>
                      👍 {postcard.likeCount} · 👎 {postcard.dislikeCount} · ⚠️ {postcard.wrongLocationReports}
                    </small>
                    {postcard.notes ? <p className="m-0 line-clamp-2 text-[0.9rem] text-[#436054]">{postcard.notes}</p> : null}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className={actionButtonClassName}
                        onClick={(event) => {
                          event.stopPropagation();
                          void submitExploreFeedback(postcard.id, 'like');
                        }}
                        disabled={feedbackPendingKey === `${postcard.id}:like`}
                      >
                        {feedbackPendingKey === `${postcard.id}:like` ? '...' : text.exploreVoteUp}
                      </button>
                      <button
                        type="button"
                        className={actionButtonClassName}
                        onClick={(event) => {
                          event.stopPropagation();
                          void submitExploreFeedback(postcard.id, 'dislike');
                        }}
                        disabled={feedbackPendingKey === `${postcard.id}:dislike`}
                      >
                        {feedbackPendingKey === `${postcard.id}:dislike` ? '...' : text.exploreVoteDown}
                      </button>
                      <button
                        type="button"
                        className={actionButtonWarnClassName}
                        onClick={(event) => {
                          event.stopPropagation();
                          void submitExploreFeedback(postcard.id, 'report_wrong_location');
                        }}
                        disabled={feedbackPendingKey === `${postcard.id}:report_wrong_location`}
                      >
                        {feedbackPendingKey === `${postcard.id}:report_wrong_location` ? '...' : text.exploreFlag}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </aside>

          <div className={exploreMapPaneClassName}>
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
          </div>
        </article>
      ) : null}

      {showCreate ? (
        <article className={`${panelClassName} grid content-start gap-3`}>
          <div className={sectionHeadClassName}>
            <div>
              <h2>{text.createTitle}</h2>
              <small className={smallMutedClassName}>{text.createSubtitle}</small>
            </div>
          </div>

          {!isAuthenticated ? (
            <div className={authCalloutClassName}>
              <strong>{text.loginRequiredTitle}</strong>
              <small className={smallMutedClassName}>{text.loginRequiredCreateBody}</small>
              <button type="button" className={primaryButtonClassName} onClick={() => signIn('google')}>
                {text.buttonSignInGoogle}
              </button>
            </div>
          ) : null}

          <form onSubmit={submitAiDetectJob} className={formStackClassName}>
            <h3>{text.optionAiTitle}</h3>
            <small className={smallMutedClassName}>{text.optionAiBody}</small>
            <label className={inlineFieldClassName}>
              {text.fieldImage}
              <input
                className={inputClassName}
                key={aiInputVersion}
                type="file"
                accept="image/*"
                onChange={(event) => setAiFile(event.target.files?.[0] ?? null)}
                disabled={!isAuthenticated || isSubmittingAi || isSavingManual}
              />
            </label>
            <button type="submit" className={primaryButtonClassName} disabled={!isAuthenticated || !aiFile || isSubmittingAi || isSavingManual}>
              {isSubmittingAi ? text.buttonSubmitting : text.buttonSubmitAiJob}
            </button>
          </form>

          {queuedAiJobId ? (
            <div className={statusSuccessClassName}>
              <small className={smallMutedClassName}>{text.queuedBody}</small>
              <small className={smallMutedClassName}>{text.queuedJobId(queuedAiJobId)}</small>
              {queuedAiImageUrl ? (
                <small className={smallMutedClassName}>
                  {text.queuedImageLabel}: <Link href={queuedAiImageUrl} target="_blank" rel="noreferrer">{text.queuedOpenUploadedImage}</Link>
                </small>
              ) : null}
              <button type="button" className={primaryButtonClassName} onClick={() => router.push('/dashboard')}>
                {text.buttonOpenDashboard}
              </button>
            </div>
          ) : null}

          <div className={formStackClassName}>
            <h3>{text.optionManualTitle}</h3>
            <small className={smallMutedClassName}>{text.optionManualBody}</small>
            <label className={inlineFieldClassName}>
              {text.fieldName}
              <input
                className={inputClassName}
                value={manualTitle}
                onChange={(event) => setManualTitle(event.target.value)}
                placeholder={text.manualNamePlaceholder}
                disabled={!isAuthenticated || isSavingManual || isSubmittingAi}
              />
            </label>
            <label className={inlineFieldClassName}>
              {text.fieldDescription}
              <textarea
                className={inputClassName}
                rows={4}
                value={manualNotes}
                onChange={(event) => setManualNotes(event.target.value)}
                placeholder={text.manualDescriptionPlaceholder}
                disabled={!isAuthenticated || isSavingManual || isSubmittingAi}
              />
            </label>
            <label className={inlineFieldClassName}>
              {text.fieldLocation}
              <input
                className={inputClassName}
                value={manualLocationInput}
                onChange={(event) => setManualLocationInput(event.target.value)}
                placeholder={text.manualLocationPlaceholder}
                disabled={!isAuthenticated || isSavingManual || isSubmittingAi}
              />
            </label>
            <label className={inlineFieldClassName}>
              {text.fieldImage}
              <input
                className={inputClassName}
                type="file"
                accept="image/*"
                onChange={(event) => setManualFile(event.target.files?.[0] ?? null)}
                disabled={!isAuthenticated || isSavingManual || isSubmittingAi}
              />
            </label>
            <button type="button" className={primaryButtonClassName} disabled={!isAuthenticated || isSavingManual || isSubmittingAi} onClick={saveManualPostcard}>
              {isSavingManual ? text.buttonSaving : text.buttonCreatePostcard}
            </button>
          </div>

          <div className={statusBoxClassName}>
            <small className={smallMutedClassName}>{createStatus || text.noActionYet}</small>
          </div>
        </article>
      ) : null}

      {showDashboard ? (
        <article className={`${panelClassName} grid content-start gap-3`}>
          <div className={sectionHeadClassName}>
            <div>
              <h2>{text.dashboardTitle}</h2>
              <small className={smallMutedClassName}>{text.dashboardSubtitle}</small>
            </div>
          </div>

          {!isAuthenticated ? (
            <div className={authCalloutClassName}>
              <strong>{text.loginRequiredTitle}</strong>
              <small className={smallMutedClassName}>{text.loginRequiredDashboardBody}</small>
              <button type="button" className={primaryButtonClassName} onClick={() => signIn('google')}>
                {text.buttonSignInGoogle}
              </button>
            </div>
          ) : (
            <>
              <div className={dashboardToolbarClassName}>
                <div className={chipRowClassName}>
                  <span className={chipClassName}>{text.chipAiJobs(jobs.length)}</span>
                  <span className={chipClassName}>{text.chipMyPostcards(myPostcards.length)}</span>
                </div>
                <div className={chipRowClassName}>
                  <button type="button" className={actionButtonClassName} onClick={() => setDashboardViewMode('grid')} disabled={dashboardViewMode === 'grid'}>
                    {text.buttonGrid}
                  </button>
                  <button type="button" className={actionButtonClassName} onClick={() => setDashboardViewMode('list')} disabled={dashboardViewMode === 'list'}>
                    {text.buttonList}
                  </button>
                  <button type="button" className={actionButtonClassName} onClick={() => void loadDashboardData()} disabled={isLoadingJobs || isLoadingMine}>
                    {text.buttonRefresh}
                  </button>
                </div>
              </div>

              {dashboardStatus ? <small className={smallMutedClassName}>{dashboardStatus}</small> : null}

              <h3 style={{ marginTop: '0.5rem' }}>{text.aiJobsTitle}</h3>
              {isLoadingJobs ? <small className={smallMutedClassName}>{text.aiJobsLoading}</small> : null}
              {!isLoadingJobs && jobs.length === 0 ? <small className={smallMutedClassName}>{text.aiJobsEmpty}</small> : null}
              <div className={dashboardListClassName}>
                {jobs.slice(0, 20).map((job) => (
                  <article key={job.id} className={postcardItemClassName}>
                    <div className={postcardItemHeadClassName}>
                      <strong>{job.status}</strong>
                      <small className={smallMutedClassName}>{new Date(job.createdAt).toLocaleString(text.dateLocale)}</small>
                    </div>
                    {job.imageUrl ? (
                      <Image
                        className="h-auto max-h-[180px] w-full rounded-[10px] border border-[#deeadb] object-contain bg-[#edf6ef]"
                        src={job.imageUrl}
                        alt={text.aiJobImageAlt(job.id)}
                        width={640}
                        height={420}
                      />
                    ) : null}
                    <small className={smallMutedClassName}>{job.placeGuess ?? text.aiJobNoGuess}</small>
                    {job.status === 'SUCCEEDED' && job.latitude !== null && job.longitude !== null ? (
                      <small className={smallMutedClassName}>
                        {job.latitude.toFixed(6)}, {job.longitude.toFixed(6)}
                        {job.confidence !== null ? ` (${text.aiConfidenceLabel(Math.round(job.confidence * 100))})` : ''}
                      </small>
                    ) : null}
                    {job.status === 'SUCCEEDED' && job.latitude !== null && job.longitude !== null ? (
                      <>
                        <label className={inlineFieldClassName}>
                          {text.fieldName}
                          <input
                            className={inputClassName}
                            value={jobDrafts[job.id]?.title ?? ''}
                            onChange={(event) => updateJobDraft(job.id, { title: event.target.value })}
                            placeholder={text.fieldName}
                            disabled={savingJobId === job.id}
                          />
                        </label>
                        <label className={inlineFieldClassName}>
                          {text.fieldDescription}
                          <textarea
                            className={inputClassName}
                            rows={3}
                            value={jobDrafts[job.id]?.notes ?? ''}
                            onChange={(event) => updateJobDraft(job.id, { notes: event.target.value })}
                            placeholder={text.fieldDescription}
                            disabled={savingJobId === job.id}
                          />
                        </label>
                        <label className={inlineFieldClassName}>
                          {text.fieldLocation}
                          <input
                            className={inputClassName}
                            value={jobDrafts[job.id]?.locationInput ?? ''}
                            onChange={(event) => updateJobDraft(job.id, { locationInput: event.target.value })}
                            placeholder={text.manualLocationPlaceholder}
                            disabled={savingJobId === job.id}
                          />
                        </label>
                        {isJobAlreadySaved(job) ? (
                          <small className={smallMutedClassName}>{text.aiResultAlreadySaved}</small>
                        ) : (
                          <button
                            type="button"
                            className={primaryButtonClassName}
                            onClick={() => void saveDetectedJobAsPostcard(job)}
                            disabled={savingJobId === job.id}
                          >
                            {savingJobId === job.id ? text.buttonSaving : text.saveAsPostcard}
                          </button>
                        )}
                      </>
                    ) : null}
                    {job.status === 'FAILED' && job.errorMessage ? <small className={smallMutedClassName}>{job.errorMessage}</small> : null}
                  </article>
                ))}
              </div>

              <h3 style={{ marginTop: '0.5rem' }}>{text.myPostcardsTitle}</h3>
              {isLoadingMine ? <small className={smallMutedClassName}>{text.myPostcardsLoading}</small> : null}
              {!isLoadingMine && myPostcards.length === 0 ? <small className={smallMutedClassName}>{text.myPostcardsEmpty}</small> : null}
              <div className={dashboardListClassName}>
                {myPostcards.slice(0, 20).map((postcard) => {
                  return (
                    <article key={postcard.id} className={postcardItemClassName}>
                    <div className={postcardItemHeadClassName}>
                      <strong>{postcard.title}</strong>
                      <small className={smallMutedClassName}>{new Date(postcard.createdAt).toLocaleDateString(text.dateLocale)}</small>
                    </div>
                    {postcard.imageUrl ? (
                      <Image
                        className="h-auto max-h-[180px] w-full rounded-[10px] border border-[#deeadb] object-cover"
                        src={postcard.imageUrl}
                        alt={postcard.title}
                        width={640}
                        height={420}
                      />
                    ) : null}
                    <small className={smallMutedClassName}>{postcard.placeName || text.exploreUnknownPlace}</small>
                    {typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number' ? (
                      <small className={smallMutedClassName}>{postcard.latitude.toFixed(6)}, {postcard.longitude.toFixed(6)}</small>
                    ) : null}
                    {postcard.notes ? <p className="m-0 text-[0.9rem] text-[#436054]">{postcard.notes}</p> : null}
                    <div className={chipRowClassName}>
                      <button
                        type="button"
                        className={actionButtonClassName}
                        onClick={() => openCropEditor(postcard)}
                        disabled={savingCropPostcardId === postcard.id || deletingPostcardId === postcard.id}
                      >
                        {editingCropPostcardId === postcard.id ? text.buttonEditingCrop : text.buttonEditCrop}
                      </button>
                      <button
                        type="button"
                        className={actionButtonClassName}
                        onClick={() => void softDeletePostcard(postcard)}
                        disabled={deletingPostcardId === postcard.id || savingCropPostcardId === postcard.id}
                      >
                        {deletingPostcardId === postcard.id ? text.buttonRemoving : text.buttonRemoveSoftDelete}
                      </button>
                    </div>
                    {editingCropPostcardId === postcard.id && editingCropOriginalUrl ? (
                      <div className={cropEditorClassName}>
                        <strong>{text.cropEditorTitle}</strong>
                        <small className={smallMutedClassName}>{text.cropEditorBody}</small>
                        <div className={cropPreviewClassName}>
                          <ReactCrop
                            crop={cropDraft}
                            onChange={(_, percentCrop) => setCropDraft((current) => sanitizePercentCrop(percentCrop, current))}
                            ruleOfThirds
                            keepSelection
                            className="block w-full"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={editingCropOriginalUrl} alt={text.cropEditorImageAlt} className={cropImageClassName} />
                          </ReactCrop>
                        </div>
                        <small className={smallMutedClassName}>{text.cropSelection(
                          Math.round(cropDraft.x ?? 0),
                          Math.round(cropDraft.y ?? 0),
                          Math.round(cropDraft.width ?? 0),
                          Math.round(cropDraft.height ?? 0)
                        )}</small>
                        <div className={chipRowClassName}>
                          <button
                            type="button"
                            className={actionButtonClassName}
                            onClick={() => void saveCropEdit(postcard.id)}
                            disabled={savingCropPostcardId === postcard.id}
                          >
                            {savingCropPostcardId === postcard.id ? text.buttonSavingCrop : text.buttonSaveCrop}
                          </button>
                          <button
                            type="button"
                            className={actionButtonClassName}
                            onClick={closeCropEditor}
                            disabled={savingCropPostcardId === postcard.id}
                          >
                            {text.buttonCancel}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </article>
      ) : null}
    </section>
  );
}
