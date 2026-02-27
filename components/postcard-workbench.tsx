'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapViewportBounds, SavedMapMarker } from '@/components/open-map';

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

type CropDraft = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PostcardWorkbenchProps = {
  mode?: 'explore' | 'create' | 'dashboard' | 'full';
};

type ExploreSort = 'ranking' | 'newest' | 'likes' | 'reports';

const OpenMap = dynamic(
  async () => {
    const mod = await import('@/components/open-map');
    return mod.OpenMap;
  },
  { ssr: false }
);

function parseLocationInput(input: string): { latitude: number; longitude: number } {
  const parts = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length !== 2) {
    throw new Error('Location must be two numbers separated by comma. Example: 25.033, 121.565 or 121.565, 25.033');
  }

  const first = Number(parts[0]);
  const second = Number(parts[1]);

  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    throw new Error('Location values must be valid numbers.');
  }

  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
    return { latitude: first, longitude: second };
  }

  if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
    return { latitude: second, longitude: first };
  }

  throw new Error('Location is out of range. Latitude must be within +/-90 and longitude within +/-180.');
}

function deriveOriginalImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) {
    return null;
  }

  if (imageUrl.includes('/uploads/original/')) {
    return imageUrl;
  }

  if (imageUrl.includes('/uploads/postcard/')) {
    return imageUrl.replace('/uploads/postcard/', '/uploads/original/');
  }

  return null;
}

export function PostcardWorkbench({ mode = 'full' }: PostcardWorkbenchProps) {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === 'authenticated';

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
  const [mapZoom, setMapZoom] = useState<number>(3);
  const [feedbackPendingKey, setFeedbackPendingKey] = useState<string | null>(null);

  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(null);
  const [viewerFocusSignal, setViewerFocusSignal] = useState(0);
  const [geoPermission, setGeoPermission] = useState<GeoPermissionState>('prompt');
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
  const [cropDraft, setCropDraft] = useState<CropDraft>({
    x: 0.08,
    y: 0.1,
    width: 0.84,
    height: 0.54
  });
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
      setCreateStatus('Sign in with Google to use AI detect and create postcards.');
      return false;
    }
    return true;
  }, [isAuthenticated]);

  const requestDeviceLocation = useCallback(async (silent = false): Promise<boolean> => {
    if (!navigator.geolocation) {
      setGeoPermission('unsupported');
      if (!silent) {
        setExploreStatus('Browser geolocation is not supported.');
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
        setExploreStatus('Could not get your location. You can still use map browse normally.');
      }

      if (granted && !silent) {
        setFocusedMarkerId(null);
        setViewerFocusSignal((current) => current + 1);
        setExploreStatus('Your location is now shown on the map.');
      }

      return granted;
    } finally {
      setIsRequestingLocation(false);
    }
  }, []);

  const handleViewportChange = useCallback((bounds: MapViewportBounds, zoom: number) => {
    setMapZoom(zoom);
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
        throw new Error('Failed to load postcards.');
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
      setExploreStatus(error instanceof Error ? error.message : 'Unknown list error.');
    } finally {
      setIsLoadingPublic(false);
    }
  }, [mapBounds, showExplore, exploreSort, exploreLimit, searchText]);

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
          title: job.placeGuess?.trim() ? `AI: ${job.placeGuess}` : 'AI detected postcard',
          notes: '',
          locationInput: `${job.latitude.toFixed(6)}, ${job.longitude.toFixed(6)}`
        };
        changed = true;
      }

      return changed ? next : current;
    });
  }, [jobs]);

  async function submitExploreFeedback(
    postcardId: string,
    action: 'like' | 'dislike' | 'report_wrong_location'
  ) {
    if (!isAuthenticated) {
      setExploreStatus('Sign in with Google to submit likes/dislikes/reports.');
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
        throw new Error(payload.error ?? 'Failed to submit feedback.');
      }

      setExploreStatus(
        action === 'like'
          ? 'Thanks for the like.'
          : action === 'dislike'
            ? 'Dislike recorded.'
            : 'Wrong-location report submitted.'
      );
      await loadPublicPostcards();
    } catch (error) {
      setExploreStatus(error instanceof Error ? error.message : 'Unknown feedback error.');
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
        throw new Error('Failed to load AI jobs.');
      }

      if (!mineResponse.ok) {
        throw new Error('Failed to load your postcards.');
      }

      const jobsData = (await jobsResponse.json()) as DetectionJobRecord[];
      const mineData = (await mineResponse.json()) as PostcardRecord[];
      setJobs(jobsData);
      setMyPostcards(mineData);
    } catch (error) {
      setDashboardStatus(error instanceof Error ? error.message : 'Unknown dashboard error.');
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
      setCreateStatus('Choose an image for AI detection first.');
      return;
    }

    if (aiRedirectTimerRef.current) {
      clearTimeout(aiRedirectTimerRef.current);
    }
    setQueuedAiJobId(null);
    setQueuedAiImageUrl(null);
    setIsSubmittingAi(true);
    setCreateStatus('Submitting AI detection job...');

    try {
      const formData = new FormData();
      formData.append('image', aiFile);

      const response = await fetch('/api/location-from-image', {
        method: 'POST',
        body: formData
      });

      if (response.status === 401) {
        throw new Error('Unauthorized. Please sign in with Google.');
      }

      const payload = (await response.json()) as { id?: string; imageUrl?: string; error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit AI detection job.');
      }

      setAiFile(null);
      setAiInputVersion((current) => current + 1);
      setQueuedAiJobId(payload.id ?? null);
      setQueuedAiImageUrl(payload.imageUrl ?? null);
      setCreateStatus(`Detection job submitted (id: ${payload.id ?? 'unknown'}). Redirecting to dashboard...`);
      aiRedirectTimerRef.current = setTimeout(() => {
        router.push('/dashboard');
      }, 1400);
    } catch (error) {
      setCreateStatus(error instanceof Error ? error.message : 'Unknown AI detection submit error.');
    } finally {
      setIsSubmittingAi(false);
    }
  }

  async function saveManualPostcard() {
    if (!ensureAuthenticated()) {
      return;
    }

    if (!manualTitle.trim()) {
      setCreateStatus('Name is required.');
      return;
    }

    if (!manualFile) {
      setCreateStatus('Image is required for manual create.');
      return;
    }

    let coords: { latitude: number; longitude: number };
    try {
      coords = parseLocationInput(manualLocationInput);
    } catch (error) {
      setCreateStatus(error instanceof Error ? error.message : 'Invalid location input.');
      return;
    }

    setIsSavingManual(true);
    setCreateStatus('Uploading image...');

    try {
      const uploadForm = new FormData();
      uploadForm.append('image', manualFile);

      const uploadResponse = await fetch('/api/upload-image', {
        method: 'POST',
        body: uploadForm
      });

      if (uploadResponse.status === 401) {
        throw new Error('Unauthorized. Please sign in with Google.');
      }

      const uploadPayload = (await uploadResponse.json()) as { imageUrl?: string; error?: string };
      if (!uploadResponse.ok || !uploadPayload.imageUrl) {
        throw new Error(uploadPayload.error ?? 'Image upload failed.');
      }

      setCreateStatus('Saving postcard...');

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
        throw new Error('Unauthorized. Please sign in with Google.');
      }

      if (!createResponse.ok) {
        throw new Error(createPayload.error ?? 'Failed to create postcard.');
      }

      setManualTitle('');
      setManualNotes('');
      setManualLocationInput('');
      setManualFile(null);
      setCreateStatus('Postcard created.');
      await loadPublicPostcards();
    } catch (error) {
      setCreateStatus(error instanceof Error ? error.message : 'Unknown create error.');
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
      setDashboardStatus('Only successful AI jobs can be saved as postcards.');
      return;
    }

    if (isJobAlreadySaved(job)) {
      setDashboardStatus('This AI result is already saved as a postcard.');
      return;
    }

    const draft = jobDrafts[job.id] ?? {
      title: job.placeGuess?.trim() ? `AI: ${job.placeGuess}` : 'AI detected postcard',
      notes: '',
      locationInput: `${job.latitude.toFixed(6)}, ${job.longitude.toFixed(6)}`
    };

    if (!draft.title.trim()) {
      setDashboardStatus('Name is required before saving AI result.');
      return;
    }

    let coords: { latitude: number; longitude: number };
    try {
      coords = parseLocationInput(draft.locationInput);
    } catch (error) {
      setDashboardStatus(error instanceof Error ? error.message : 'Invalid location input.');
      return;
    }

    setSavingJobId(job.id);
    setDashboardStatus('Saving AI result as postcard...');

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
        throw new Error(payload.error ?? 'Failed to save postcard from AI result.');
      }

      await Promise.all([loadDashboardData(), loadPublicPostcards()]);
      setDashboardStatus('AI result saved as postcard. It is now visible in Explore map.');
    } catch (error) {
      setDashboardStatus(error instanceof Error ? error.message : 'Unknown save error.');
    } finally {
      setSavingJobId(null);
    }
  }

  function openCropEditor(postcard: PostcardRecord) {
    const originalUrl = postcard.originalImageUrl ?? deriveOriginalImageUrl(postcard.imageUrl);
    if (!originalUrl) {
      setDashboardStatus('Original upload image is not available for this postcard.');
      return;
    }

    setEditingCropPostcardId(postcard.id);
    setEditingCropOriginalUrl(originalUrl);
    setCropDraft({
      x: 0.08,
      y: 0.1,
      width: 0.84,
      height: 0.54
    });
    setDashboardStatus('');
  }

  function closeCropEditor() {
    setEditingCropPostcardId(null);
    setEditingCropOriginalUrl(null);
  }

  function updateCropDraftValue(field: keyof CropDraft, value: number) {
    setCropDraft((current) => {
      const next = { ...current, [field]: value };

      if (field === 'x') {
        next.x = Math.min(next.x, 1 - next.width);
      }
      if (field === 'y') {
        next.y = Math.min(next.y, 1 - next.height);
      }
      if (field === 'width') {
        next.width = Math.min(next.width, 1 - next.x);
      }
      if (field === 'height') {
        next.height = Math.min(next.height, 1 - next.y);
      }

      next.x = Math.max(0, next.x);
      next.y = Math.max(0, next.y);
      next.width = Math.max(0.05, next.width);
      next.height = Math.max(0.05, next.height);
      return next;
    });
  }

  async function saveCropEdit(postcardId: string) {
    if (!ensureAuthenticated()) {
      return;
    }

    setSavingCropPostcardId(postcardId);
    setDashboardStatus('Saving crop...');

    try {
      const response = await fetch(`/api/postcards/${postcardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crop: cropDraft })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to save crop.');
      }

      await Promise.all([loadDashboardData(), loadPublicPostcards()]);
      closeCropEditor();
      setDashboardStatus('Crop updated successfully.');
    } catch (error) {
      setDashboardStatus(error instanceof Error ? error.message : 'Unknown crop edit error.');
    } finally {
      setSavingCropPostcardId(null);
    }
  }

  async function softDeletePostcard(postcard: PostcardRecord) {
    if (!ensureAuthenticated()) {
      return;
    }

    const confirmed = window.confirm(`Remove postcard "${postcard.title}" from dashboard and map?`);
    if (!confirmed) {
      return;
    }

    setDeletingPostcardId(postcard.id);
    setDashboardStatus('Removing postcard...');

    try {
      const response = await fetch(`/api/postcards/${postcard.id}`, {
        method: 'DELETE'
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to remove postcard.');
      }

      if (editingCropPostcardId === postcard.id) {
        closeCropEditor();
      }
      setDashboardStatus('Postcard removed (soft delete).');
      await Promise.all([loadDashboardData(), loadPublicPostcards()]);
    } catch (error) {
      setDashboardStatus(error instanceof Error ? error.message : 'Unknown remove error.');
    } finally {
      setDeletingPostcardId(null);
    }
  }

  const permissionText = geoPermission === 'checking'
    ? 'Checking map location permission...'
    : geoPermission === 'granted'
      ? 'Location access granted. You can show your current position on map.'
      : geoPermission === 'prompt'
        ? 'Location permission is optional and only used for Find Me on map.'
        : geoPermission === 'denied'
          ? 'Location permission denied. Map browsing still works.'
          : 'Geolocation unsupported in this browser.';

  return (
    <section className={showExplore && showCreate ? 'workbench' : 'workbench workbench-single'}>
      {showExplore ? (
        <article className="panel explore-panel explore-map-layout">
          <aside className="explore-sidebar">
            <div className="section-head">
              <div>
                <h2>Explore Postcards</h2>
                <small>Google Maps style: list on left, map on right. Pan map to reload this list.</small>
              </div>
              <div className="chip-row">
                <span className="chip">{visiblePostcards.length} loaded</span>
                <span className="chip">{publicMarkers.length} markers</span>
                <span className="chip">Zoom {mapZoom}</span>
                <span className="chip">{visibleTotal} in area</span>
                {visibleHasMore ? <span className="chip">limited to {exploreLimit}</span> : null}
              </div>
            </div>

            <div className="explore-filter-stack">
              <label className="inline-field">
                Search
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Title, place, note, AI guess"
                />
              </label>
              <label className="inline-field">
                Ranking
                <select value={exploreSort} onChange={(event) => setExploreSort(event.target.value as ExploreSort)}>
                  <option value="ranking">Top ranked</option>
                  <option value="newest">Newest</option>
                  <option value="likes">Most likes</option>
                  <option value="reports">Most reported</option>
                </select>
              </label>
              <label className="inline-field">
                Max results
                <select value={exploreLimit} onChange={(event) => setExploreLimit(Number(event.target.value))}>
                  <option value={60}>60</option>
                  <option value={120}>120</option>
                  <option value={200}>200</option>
                </select>
              </label>
            </div>

            <div className="auth-callout">
              <strong>Find Me On Map</strong>
              <small>{permissionText}</small>
              {deviceLocation ? (
                <small>
                  Current location: {deviceLocation.latitude.toFixed(6)}, {deviceLocation.longitude.toFixed(6)} (+/-{Math.round(deviceLocation.accuracy)}m)
                </small>
              ) : null}
              <button type="button" onClick={() => void requestDeviceLocation(false)} disabled={isRequestingLocation}>
                {isRequestingLocation ? 'Finding...' : 'Find my location on map'}
              </button>
            </div>

            <div className="explore-status-stack">
              {!mapBounds ? <small className="list-note">Loading visible map area...</small> : null}
              {isLoadingPublic ? <small className="list-note">Loading postcards...</small> : null}
              {!isLoadingPublic && mapBounds && visiblePostcards.length === 0 ? (
                <small className="list-note">No postcards found in the current map area/filter.</small>
              ) : null}
              {exploreStatus ? <small className="list-note">{exploreStatus}</small> : null}
            </div>

            <div className="explore-results">
              {visiblePostcards.map((postcard) => (
                <article key={postcard.id} className={focusedMarkerId === postcard.id ? 'postcard-item postcard-focused' : 'postcard-item'}>
                  <div className="postcard-item-head">
                    <strong>{postcard.title}</strong>
                    <small>{new Date(postcard.createdAt).toLocaleDateString()}</small>
                  </div>
                  <small>{postcard.placeName || 'Unknown place'}</small>
                  {postcard.uploaderMasked ? <small>by {postcard.uploaderMasked}</small> : null}
                  <small>
                    👍 {postcard.likeCount} · 👎 {postcard.dislikeCount} · ⚠️ {postcard.wrongLocationReports}
                  </small>
                  {postcard.notes ? <p>{postcard.notes}</p> : null}
                  <div className="chip-row">
                    <button
                      type="button"
                      className="action-button"
                      onClick={() => setFocusedMarkerId(postcard.id)}
                      disabled={typeof postcard.latitude !== 'number' || typeof postcard.longitude !== 'number'}
                    >
                      Focus on map
                    </button>
                    <button
                      type="button"
                      className="action-button"
                      onClick={() => void submitExploreFeedback(postcard.id, 'like')}
                      disabled={feedbackPendingKey === `${postcard.id}:like`}
                    >
                      {feedbackPendingKey === `${postcard.id}:like` ? '...' : 'Like'}
                    </button>
                    <button
                      type="button"
                      className="action-button"
                      onClick={() => void submitExploreFeedback(postcard.id, 'dislike')}
                      disabled={feedbackPendingKey === `${postcard.id}:dislike`}
                    >
                      {feedbackPendingKey === `${postcard.id}:dislike` ? '...' : 'Dislike'}
                    </button>
                    <button
                      type="button"
                      className="action-button"
                      onClick={() => void submitExploreFeedback(postcard.id, 'report_wrong_location')}
                      disabled={feedbackPendingKey === `${postcard.id}:report_wrong_location`}
                    >
                      {feedbackPendingKey === `${postcard.id}:report_wrong_location` ? '...' : 'Report Wrong Location'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </aside>

          <div className="explore-map-pane">
            <OpenMap
              className="map-shell-large map-shell-google"
              markers={publicMarkers}
              focusedMarkerId={focusedMarkerId}
              viewerFocusSignal={viewerFocusSignal}
              onViewportChange={handleViewportChange}
              viewerPoint={
                deviceLocation
                  ? {
                      latitude: deviceLocation.latitude,
                      longitude: deviceLocation.longitude,
                      label: 'Your current location'
                    }
                  : undefined
              }
            />
          </div>
        </article>
      ) : null}

      {showCreate ? (
        <article className="panel create-panel">
          <div className="section-head">
            <div>
              <h2>Create</h2>
              <small>Two upload options: async AI detect job or manual postcard create.</small>
            </div>
          </div>

          {!isAuthenticated ? (
            <div className="auth-callout">
              <strong>Login Required</strong>
              <small>Sign in with Google to submit AI jobs and create postcards.</small>
              <button type="button" onClick={() => signIn('google')}>
                Sign in with Google
              </button>
            </div>
          ) : null}

          <form onSubmit={submitAiDetectJob} className="form-stack">
            <h3>Option 1: AI Detect (Async)</h3>
            <small>Upload image and submit. You can leave this page and check result later in Dashboard.</small>
            <label>
              Image
              <input
                key={aiInputVersion}
                type="file"
                accept="image/*"
                onChange={(event) => setAiFile(event.target.files?.[0] ?? null)}
                disabled={!isAuthenticated || isSubmittingAi || isSavingManual}
              />
            </label>
            <button type="submit" disabled={!isAuthenticated || !aiFile || isSubmittingAi || isSavingManual}>
              {isSubmittingAi ? 'Submitting...' : 'Submit AI Detect Job'}
            </button>
          </form>

          {queuedAiJobId ? (
            <div className="status-box status-success">
              <small>Queued. You can leave this page; processing continues in background.</small>
              <small>Job ID: {queuedAiJobId}</small>
              {queuedAiImageUrl ? (
                <small>
                  Image: <Link href={queuedAiImageUrl} target="_blank" rel="noreferrer">open uploaded image</Link>
                </small>
              ) : null}
              <button type="button" onClick={() => router.push('/dashboard')}>
                Open Dashboard
              </button>
            </div>
          ) : null}

          <div className="form-stack">
            <h3>Option 2: Manual Create</h3>
            <small>Fill name, description, location (single field), and image.</small>
            <label>
              Name
              <input
                value={manualTitle}
                onChange={(event) => setManualTitle(event.target.value)}
                placeholder="Central Park bloom walk"
                disabled={!isAuthenticated || isSavingManual || isSubmittingAi}
              />
            </label>
            <label>
              Description
              <textarea
                rows={4}
                value={manualNotes}
                onChange={(event) => setManualNotes(event.target.value)}
                placeholder="Spotted red Pikmin decor near the fountain"
                disabled={!isAuthenticated || isSavingManual || isSubmittingAi}
              />
            </label>
            <label>
              Location (lat,lon or lon,lat)
              <input
                value={manualLocationInput}
                onChange={(event) => setManualLocationInput(event.target.value)}
                placeholder="25.033, 121.565"
                disabled={!isAuthenticated || isSavingManual || isSubmittingAi}
              />
            </label>
            <label>
              Image
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setManualFile(event.target.files?.[0] ?? null)}
                disabled={!isAuthenticated || isSavingManual || isSubmittingAi}
              />
            </label>
            <button type="button" disabled={!isAuthenticated || isSavingManual || isSubmittingAi} onClick={saveManualPostcard}>
              {isSavingManual ? 'Saving...' : 'Create Postcard'}
            </button>
          </div>

          <div className="status-box">
            <small>{createStatus || 'No action yet.'}</small>
          </div>
        </article>
      ) : null}

      {showDashboard ? (
        <article className="panel create-panel">
          <div className="section-head">
            <div>
              <h2>Dashboard</h2>
              <small>Your AI detection jobs and your own postcards.</small>
            </div>
          </div>

          {!isAuthenticated ? (
            <div className="auth-callout">
              <strong>Login Required</strong>
              <small>Sign in to view your private dashboard.</small>
              <button type="button" onClick={() => signIn('google')}>
                Sign in with Google
              </button>
            </div>
          ) : (
            <>
              <div className="dashboard-toolbar">
                <div className="chip-row">
                  <span className="chip">AI Jobs: {jobs.length}</span>
                  <span className="chip">My Postcards: {myPostcards.length}</span>
                </div>
                <div className="chip-row">
                  <button type="button" className="action-button" onClick={() => setDashboardViewMode('grid')} disabled={dashboardViewMode === 'grid'}>
                    Grid
                  </button>
                  <button type="button" className="action-button" onClick={() => setDashboardViewMode('list')} disabled={dashboardViewMode === 'list'}>
                    List
                  </button>
                  <button type="button" className="action-button" onClick={() => void loadDashboardData()} disabled={isLoadingJobs || isLoadingMine}>
                    Refresh
                  </button>
                </div>
              </div>

              {dashboardStatus ? <small>{dashboardStatus}</small> : null}

              <h3 style={{ marginTop: '0.5rem' }}>AI Detection Jobs</h3>
              {isLoadingJobs ? <small>Loading AI jobs...</small> : null}
              {!isLoadingJobs && jobs.length === 0 ? <small>No AI jobs yet.</small> : null}
              <div className={dashboardViewMode === 'grid' ? 'postcard-list dashboard-grid' : 'postcard-list dashboard-list'}>
                {jobs.slice(0, 20).map((job) => (
                  <article key={job.id} className="postcard-item">
                    <div className="postcard-item-head">
                      <strong>{job.status}</strong>
                      <small>{new Date(job.createdAt).toLocaleString()}</small>
                    </div>
                    {job.imageUrl ? (
                      <Image
                        className="postcard-thumb postcard-thumb-contain"
                        src={job.imageUrl}
                        alt={`AI job ${job.id}`}
                        width={640}
                        height={420}
                      />
                    ) : null}
                    <small>{job.placeGuess ?? 'No place guess yet'}</small>
                    {job.status === 'SUCCEEDED' && job.latitude !== null && job.longitude !== null ? (
                      <small>
                        {job.latitude.toFixed(6)}, {job.longitude.toFixed(6)}
                        {job.confidence !== null ? ` (confidence ${Math.round(job.confidence * 100)}%)` : ''}
                      </small>
                    ) : null}
                    {job.status === 'SUCCEEDED' && job.latitude !== null && job.longitude !== null ? (
                      <>
                        <label>
                          Name
                          <input
                            value={jobDrafts[job.id]?.title ?? ''}
                            onChange={(event) => updateJobDraft(job.id, { title: event.target.value })}
                            placeholder="Postcard name"
                            disabled={savingJobId === job.id}
                          />
                        </label>
                        <label>
                          Description
                          <textarea
                            rows={3}
                            value={jobDrafts[job.id]?.notes ?? ''}
                            onChange={(event) => updateJobDraft(job.id, { notes: event.target.value })}
                            placeholder="Write a short description"
                            disabled={savingJobId === job.id}
                          />
                        </label>
                        <label>
                          Location (lat,lon or lon,lat)
                          <input
                            value={jobDrafts[job.id]?.locationInput ?? ''}
                            onChange={(event) => updateJobDraft(job.id, { locationInput: event.target.value })}
                            placeholder="25.033, 121.565"
                            disabled={savingJobId === job.id}
                          />
                        </label>
                        {isJobAlreadySaved(job) ? (
                          <small>Already saved as postcard.</small>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void saveDetectedJobAsPostcard(job)}
                            disabled={savingJobId === job.id}
                          >
                            {savingJobId === job.id ? 'Saving...' : 'Save as Postcard'}
                          </button>
                        )}
                      </>
                    ) : null}
                    {job.status === 'FAILED' && job.errorMessage ? <small>{job.errorMessage}</small> : null}
                  </article>
                ))}
              </div>

              <h3 style={{ marginTop: '0.5rem' }}>My Postcards</h3>
              {isLoadingMine ? <small>Loading your postcards...</small> : null}
              {!isLoadingMine && myPostcards.length === 0 ? <small>You have not created postcards yet.</small> : null}
              <div className={dashboardViewMode === 'grid' ? 'postcard-list dashboard-grid' : 'postcard-list dashboard-list'}>
                {myPostcards.slice(0, 20).map((postcard) => (
                  <article key={postcard.id} className="postcard-item">
                    <div className="postcard-item-head">
                      <strong>{postcard.title}</strong>
                      <small>{new Date(postcard.createdAt).toLocaleDateString()}</small>
                    </div>
                    {postcard.imageUrl ? (
                      <Image
                        className="postcard-thumb"
                        src={postcard.imageUrl}
                        alt={postcard.title}
                        width={640}
                        height={420}
                      />
                    ) : null}
                    <small>{postcard.placeName || 'Unknown place'}</small>
                    {typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number' ? (
                      <small>{postcard.latitude.toFixed(6)}, {postcard.longitude.toFixed(6)}</small>
                    ) : null}
                    {postcard.notes ? <p>{postcard.notes}</p> : null}
                    <div className="chip-row">
                      <button
                        type="button"
                        className="action-button"
                        onClick={() => openCropEditor(postcard)}
                        disabled={savingCropPostcardId === postcard.id || deletingPostcardId === postcard.id}
                      >
                        {editingCropPostcardId === postcard.id ? 'Editing Crop' : 'Edit Crop'}
                      </button>
                      <button
                        type="button"
                        className="action-button"
                        onClick={() => void softDeletePostcard(postcard)}
                        disabled={deletingPostcardId === postcard.id || savingCropPostcardId === postcard.id}
                      >
                        {deletingPostcardId === postcard.id ? 'Removing...' : 'Remove (Soft Delete)'}
                      </button>
                    </div>
                    {editingCropPostcardId === postcard.id && editingCropOriginalUrl ? (
                      <div className="crop-editor">
                        <strong>Crop Editor (Original Upload)</strong>
                        <small>Adjust the box to match the postcard photo area, then save.</small>
                        <div className="crop-preview">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={editingCropOriginalUrl} alt="Original upload for crop editing" className="crop-preview-image" />
                          <div
                            className="crop-preview-box"
                            style={{
                              left: `${cropDraft.x * 100}%`,
                              top: `${cropDraft.y * 100}%`,
                              width: `${cropDraft.width * 100}%`,
                              height: `${cropDraft.height * 100}%`
                            }}
                          />
                        </div>
                        <div className="crop-slider-grid">
                          <label>
                            Left ({Math.round(cropDraft.x * 100)}%)
                            <input
                              type="range"
                              min={0}
                              max={Math.max(0, 1 - cropDraft.width)}
                              step={0.005}
                              value={cropDraft.x}
                              onChange={(event) => updateCropDraftValue('x', Number(event.target.value))}
                            />
                          </label>
                          <label>
                            Top ({Math.round(cropDraft.y * 100)}%)
                            <input
                              type="range"
                              min={0}
                              max={Math.max(0, 1 - cropDraft.height)}
                              step={0.005}
                              value={cropDraft.y}
                              onChange={(event) => updateCropDraftValue('y', Number(event.target.value))}
                            />
                          </label>
                          <label>
                            Width ({Math.round(cropDraft.width * 100)}%)
                            <input
                              type="range"
                              min={0.05}
                              max={Math.max(0.05, 1 - cropDraft.x)}
                              step={0.005}
                              value={cropDraft.width}
                              onChange={(event) => updateCropDraftValue('width', Number(event.target.value))}
                            />
                          </label>
                          <label>
                            Height ({Math.round(cropDraft.height * 100)}%)
                            <input
                              type="range"
                              min={0.05}
                              max={Math.max(0.05, 1 - cropDraft.y)}
                              step={0.005}
                              value={cropDraft.height}
                              onChange={(event) => updateCropDraftValue('height', Number(event.target.value))}
                            />
                          </label>
                        </div>
                        <div className="chip-row">
                          <button
                            type="button"
                            className="action-button"
                            onClick={() => void saveCropEdit(postcard.id)}
                            disabled={savingCropPostcardId === postcard.id}
                          >
                            {savingCropPostcardId === postcard.id ? 'Saving Crop...' : 'Save Crop'}
                          </button>
                          <button
                            type="button"
                            className="action-button"
                            onClick={closeCropEditor}
                            disabled={savingCropPostcardId === postcard.id}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </>
          )}
        </article>
      ) : null}
    </section>
  );
}
