'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SavedMapMarker } from '@/components/open-map';

type PostcardRecord = {
  id: string;
  title: string;
  notes: string | null;
  placeName: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
};

type DetectionJobRecord = {
  id: string;
  imageUrl: string;
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  latitude: number | null;
  longitude: number | null;
  confidence: number | null;
  placeGuess: string | null;
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

type PostcardWorkbenchProps = {
  mode?: 'explore' | 'create' | 'dashboard' | 'full';
};

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

export function PostcardWorkbench({ mode = 'full' }: PostcardWorkbenchProps) {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === 'authenticated';

  const showExplore = mode === 'explore' || mode === 'full';
  const showCreate = mode === 'create' || mode === 'full';
  const showDashboard = mode === 'dashboard';

  const [searchText, setSearchText] = useState('');
  const [postcards, setPostcards] = useState<PostcardRecord[]>([]);
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [exploreStatus, setExploreStatus] = useState('');

  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(null);
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
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isLoadingMine, setIsLoadingMine] = useState(false);
  const [dashboardStatus, setDashboardStatus] = useState('');

  const filteredPostcards = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) {
      return postcards;
    }

    return postcards.filter((postcard) => {
      const haystack = `${postcard.title} ${postcard.placeName ?? ''} ${postcard.notes ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [postcards, searchText]);

  const publicMarkers = useMemo<SavedMapMarker[]>(() => {
    return filteredPostcards
      .filter((postcard) => typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number')
      .map((postcard) => ({
        id: postcard.id,
        title: postcard.title,
        latitude: postcard.latitude as number,
        longitude: postcard.longitude as number,
        placeName: postcard.placeName,
        imageUrl: postcard.imageUrl
      }));
  }, [filteredPostcards]);

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
        setExploreStatus('Your location is now shown on the map.');
      }

      return granted;
    } finally {
      setIsRequestingLocation(false);
    }
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

  useEffect(() => {
    void loadPublicPostcards();
  }, []);

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

  async function loadPublicPostcards() {
    setIsLoadingPublic(true);
    try {
      const response = await fetch('/api/postcards', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load postcards.');
      }
      const data = (await response.json()) as PostcardRecord[];
      setPostcards(data);
    } catch (error) {
      setExploreStatus(error instanceof Error ? error.message : 'Unknown list error.');
    } finally {
      setIsLoadingPublic(false);
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
        <article className="panel explore-panel">
          <div className="section-head">
            <div>
              <h2>Explore Postcards</h2>
              <small>Public view and search. Use Find Me to show your current location on the map.</small>
            </div>
            <div className="chip-row">
              <span className="chip">{filteredPostcards.length} in search</span>
              <span className="chip">{publicMarkers.length} with coordinates</span>
            </div>
          </div>

          <div className="auth-callout" style={{ marginBottom: '0.8rem' }}>
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

          <label className="search-label">
            Search postcards
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Try city, place name, or postcard title"
            />
          </label>

          <OpenMap
            className="map-shell-large"
            markers={publicMarkers}
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

          {isLoadingPublic ? <small className="list-note">Loading postcards...</small> : null}
          {!isLoadingPublic && filteredPostcards.length === 0 ? (
            <small className="list-note">No postcards match this search.</small>
          ) : null}
          {exploreStatus ? <small className="list-note">{exploreStatus}</small> : null}

          <div className="postcard-list">
            {filteredPostcards.slice(0, 12).map((postcard) => (
              <article key={postcard.id} className="postcard-item">
                <div className="postcard-item-head">
                  <strong>{postcard.title}</strong>
                  <small>{new Date(postcard.createdAt).toLocaleDateString()}</small>
                </div>
                <small>{postcard.placeName || 'Unknown place'}</small>
                {postcard.notes ? <p>{postcard.notes}</p> : null}
              </article>
            ))}
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
              <div className="chip-row">
                <span className="chip">AI Jobs: {jobs.length}</span>
                <span className="chip">My Postcards: {myPostcards.length}</span>
                <button type="button" onClick={() => void loadDashboardData()} disabled={isLoadingJobs || isLoadingMine}>
                  Refresh
                </button>
              </div>

              {dashboardStatus ? <small>{dashboardStatus}</small> : null}

              <h3 style={{ marginTop: '0.5rem' }}>AI Detection Jobs</h3>
              {isLoadingJobs ? <small>Loading AI jobs...</small> : null}
              {!isLoadingJobs && jobs.length === 0 ? <small>No AI jobs yet.</small> : null}
              <div className="postcard-list">
                {jobs.slice(0, 20).map((job) => (
                  <article key={job.id} className="postcard-item">
                    <div className="postcard-item-head">
                      <strong>{job.status}</strong>
                      <small>{new Date(job.createdAt).toLocaleString()}</small>
                    </div>
                    <small>{job.placeGuess ?? 'No place guess yet'}</small>
                    {job.status === 'SUCCEEDED' && job.latitude !== null && job.longitude !== null ? (
                      <small>
                        {job.latitude.toFixed(6)}, {job.longitude.toFixed(6)}
                        {job.confidence !== null ? ` (confidence ${Math.round(job.confidence * 100)}%)` : ''}
                      </small>
                    ) : null}
                    {job.status === 'FAILED' && job.errorMessage ? <small>{job.errorMessage}</small> : null}
                  </article>
                ))}
              </div>

              <h3 style={{ marginTop: '0.5rem' }}>My Postcards</h3>
              {isLoadingMine ? <small>Loading your postcards...</small> : null}
              {!isLoadingMine && myPostcards.length === 0 ? <small>You have not created postcards yet.</small> : null}
              <div className="postcard-list">
                {myPostcards.slice(0, 20).map((postcard) => (
                  <article key={postcard.id} className="postcard-item">
                    <div className="postcard-item-head">
                      <strong>{postcard.title}</strong>
                      <small>{new Date(postcard.createdAt).toLocaleDateString()}</small>
                    </div>
                    <small>{postcard.placeName || 'Unknown place'}</small>
                    {typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number' ? (
                      <small>{postcard.latitude.toFixed(6)}, {postcard.longitude.toFixed(6)}</small>
                    ) : null}
                    {postcard.notes ? <p>{postcard.notes}</p> : null}
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
