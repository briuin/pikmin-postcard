'use client';

import dynamic from 'next/dynamic';
import { signIn, useSession } from 'next-auth/react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { SavedMapMarker } from '@/components/open-map';

type LocationResult = {
  latitude: number;
  longitude: number;
  confidence: number;
  place_guess: string;
};

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

type GeoPermissionState = 'checking' | 'prompt' | 'granted' | 'denied' | 'unsupported';

type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type PostcardWorkbenchProps = {
  mode?: 'explore' | 'create' | 'full';
};

const OpenMap = dynamic(
  async () => {
    const mod = await import('@/components/open-map');
    return mod.OpenMap;
  },
  { ssr: false }
);

export function PostcardWorkbench({ mode = 'full' }: PostcardWorkbenchProps) {
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === 'authenticated';

  const showExplore = mode !== 'create';
  const showCreate = mode !== 'explore';

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [searchText, setSearchText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(null);
  const [geoPermission, setGeoPermission] = useState<GeoPermissionState>('prompt');
  const [postcards, setPostcards] = useState<PostcardRecord[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');

  const confidenceLabel = useMemo(() => {
    if (!location) {
      return null;
    }
    return `${Math.round(location.confidence * 100)}%`;
  }, [location]);

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

  const markers = useMemo<SavedMapMarker[]>(() => {
    const source = showExplore ? filteredPostcards : postcards;

    return source
      .filter((postcard) => typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number')
      .map((postcard) => ({
        id: postcard.id,
        title: postcard.title,
        latitude: postcard.latitude as number,
        longitude: postcard.longitude as number,
        placeName: postcard.placeName,
        imageUrl: postcard.imageUrl
      }));
  }, [filteredPostcards, postcards, showExplore]);

  const setDraftLocation = useCallback((lat: number, lng: number) => {
    setLocation((prev) => {
      if (!prev) {
        return {
          latitude: lat,
          longitude: lng,
          confidence: 1,
          place_guess: 'Manual map pick'
        };
      }

      return {
        ...prev,
        latitude: lat,
        longitude: lng
      };
    });
  }, []);

  const requestDeviceLocation = useCallback(async (silent = false): Promise<boolean> => {
    if (!navigator.geolocation) {
      setGeoPermission('unsupported');
      if (!silent) {
        setStatus('Browser geolocation is not supported.');
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
        setStatus('Location permission is required to continue.');
      }

      if (granted && !silent) {
        setStatus('Location permission granted.');
      }

      return granted;
    } finally {
      setIsRequestingLocation(false);
    }
  }, []);

  const ensureAuthenticated = useCallback((): boolean => {
    if (!isAuthenticated) {
      setStatus('Sign in with Google to analyze images or add postcards.');
      return false;
    }

    return true;
  }, [isAuthenticated]);

  const ensureLocationReady = useCallback(async (): Promise<boolean> => {
    if (!ensureAuthenticated()) {
      return false;
    }

    if (geoPermission === 'granted' && deviceLocation) {
      return true;
    }

    return requestDeviceLocation(false);
  }, [deviceLocation, ensureAuthenticated, geoPermission, requestDeviceLocation]);

  useEffect(() => {
    if (!isAuthenticated) {
      setGeoPermission('prompt');
      setDeviceLocation(null);
      return;
    }

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
        permissionStatus = await navigator.permissions.query({
          name: 'geolocation' as PermissionName
        });

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
  }, [isAuthenticated, requestDeviceLocation]);

  useEffect(() => {
    void loadPostcards();
  }, []);

  async function loadPostcards() {
    setIsLoadingList(true);
    try {
      const response = await fetch('/api/postcards', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load postcards.');
      }
      const data = (await response.json()) as PostcardRecord[];
      setPostcards(data);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unknown list error.');
    } finally {
      setIsLoadingList(false);
    }
  }

  async function detectLocation(event: FormEvent) {
    event.preventDefault();

    if (!ensureAuthenticated()) {
      return;
    }

    if (!file) {
      setStatus('Choose an image first.');
      return;
    }

    setIsDetecting(true);
    setStatus('Detecting location from image...');

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/location-from-image', {
        method: 'POST',
        body: formData
      });

      if (response.status === 401) {
        throw new Error('Unauthorized. Please sign in with Google.');
      }

      if (!response.ok) {
        const errorJson = (await response.json()) as { error?: string };
        throw new Error(errorJson.error ?? 'Detection failed.');
      }

      const result = (await response.json()) as LocationResult;
      setLocation(result);
      setStatus(`Location detected near ${result.place_guess}. Click map to adjust pin if needed.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unknown detection error.');
    } finally {
      setIsDetecting(false);
    }
  }

  async function uploadImageIfPresent(): Promise<string | undefined> {
    if (!file) {
      return undefined;
    }

    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch('/api/upload-image', {
      method: 'POST',
      body: formData
    });

    if (response.status === 401) {
      throw new Error('Unauthorized. Please sign in with Google.');
    }

    if (!response.ok) {
      const errorJson = (await response.json()) as { error?: string };
      throw new Error(errorJson.error ?? 'Image upload failed.');
    }

    const payload = (await response.json()) as { imageUrl: string };
    return payload.imageUrl;
  }

  async function savePostcard() {
    if (!(await ensureLocationReady())) {
      return;
    }

    if (!title.trim()) {
      setStatus('Title is required.');
      return;
    }

    if (!location) {
      setStatus('Detect location first, then save.');
      return;
    }

    setIsSaving(true);
    setStatus('Saving postcard...');

    try {
      setStatus('Uploading image...');
      const imageUrl = await uploadImageIfPresent();
      setStatus('Creating postcard entry...');

      const response = await fetch('/api/postcards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          notes,
          imageUrl,
          latitude: location.latitude,
          longitude: location.longitude,
          aiLatitude: location.latitude,
          aiLongitude: location.longitude,
          aiConfidence: location.confidence,
          aiPlaceGuess: location.place_guess,
          placeName: location.place_guess,
          locationStatus: 'USER_CONFIRMED'
        })
      });

      if (response.status === 401) {
        throw new Error('Unauthorized. Please sign in with Google.');
      }

      if (!response.ok) {
        const errorJson = (await response.json()) as { error?: string };
        throw new Error(errorJson.error ?? 'Failed to save postcard.');
      }

      await loadPostcards();
      setStatus('Postcard saved.');
      setTitle('');
      setNotes('');
      setFile(null);
      setLocation(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unknown save error.');
    } finally {
      setIsSaving(false);
    }
  }

  const permissionText = !isAuthenticated
    ? 'Sign in first to enable geolocation and postcard creation tools.'
    : geoPermission === 'checking'
      ? 'Checking location permission...'
      : geoPermission === 'granted'
        ? 'Location access granted.'
        : geoPermission === 'prompt'
          ? 'Location permission is required. Click "Allow location".'
          : geoPermission === 'denied'
            ? 'Location permission denied. Enable it in browser settings.'
            : 'Location permission unsupported in this browser.';

  const visiblePostcardCount = filteredPostcards.length;
  const mappedPostcardCount = markers.length;
  const canPickDraftOnMap = isAuthenticated && showCreate;

  return (
    <section className={showExplore && showCreate ? 'workbench' : 'workbench workbench-single'}>
      {showExplore ? (
        <article className="panel explore-panel">
          <div className="section-head">
            <div>
              <h2>Explore Postcards</h2>
              <small>Public view. Search list and browse the open map without login.</small>
            </div>
            <div className="chip-row">
              <span className="chip">{visiblePostcardCount} in search</span>
              <span className="chip">{mappedPostcardCount} with coordinates</span>
            </div>
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
            markers={markers}
            draftPoint={showCreate && location ? { latitude: location.latitude, longitude: location.longitude, label: 'Current draft location' } : undefined}
            onPick={canPickDraftOnMap ? setDraftLocation : undefined}
          />

          {isLoadingList ? <small className="list-note">Loading postcards...</small> : null}
          {!isLoadingList && filteredPostcards.length === 0 ? (
            <small className="list-note">No postcards match this search.</small>
          ) : null}

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
              <h2>Create Postcard</h2>
              <small>AI location detection and manual postcard creation are separate steps.</small>
            </div>
          </div>

          <div className="auth-callout">
            <strong>Location Permission (for create flow)</strong>
            <small>{permissionText}</small>
            {!isAuthenticated ? (
              <button type="button" onClick={() => signIn('google')}>
                Sign in with Google
              </button>
            ) : null}
            {deviceLocation ? (
              <small>
                Device location: {deviceLocation.latitude.toFixed(6)}, {deviceLocation.longitude.toFixed(6)} (+/-
                {Math.round(deviceLocation.accuracy)}m)
              </small>
            ) : null}
            <button
              type="button"
              onClick={() => void requestDeviceLocation(false)}
              disabled={!isAuthenticated || isRequestingLocation}
            >
              {isRequestingLocation ? 'Requesting location...' : 'Allow location'}
            </button>
          </div>

          <form onSubmit={detectLocation} className="form-stack">
            <h3>1. AI Detect Location</h3>
            <small>Only image upload is needed for AI detection.</small>
            <label>
              Photo
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                disabled={!isAuthenticated}
              />
            </label>
            <button type="submit" disabled={!isAuthenticated || isDetecting || isSaving}>
              {isDetecting ? 'Detecting...' : 'Detect location with Gemini'}
            </button>
          </form>

          <div className="status-box">
            <small>{status || 'No action yet.'}</small>
            {location ? (
              <small>
                Result: {location.place_guess} ({location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}), confidence {confidenceLabel}
              </small>
            ) : null}
          </div>

          <div className="form-stack">
            <h3>2. Create Postcard Location</h3>
            <small>After AI result, adjust pin on map or keep detected coordinates, then save.</small>
            <label>
              Postcard title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Central Park bloom walk"
                disabled={!isAuthenticated}
              />
            </label>
            <label>
              Notes
              <textarea
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Spotted red Pikmin decor near the fountain"
                disabled={!isAuthenticated}
              />
            </label>
            <button type="button" disabled={!isAuthenticated || isSaving || !location} onClick={savePostcard}>
              {isSaving ? 'Saving...' : 'Save postcard'}
            </button>
          </div>

          {!showExplore ? (
            <div className="create-map-block">
              <h3>Draft Location Map</h3>
              <small>Click map to fine-tune your draft location before saving.</small>
              <OpenMap
                className="map-shell-create"
                markers={markers}
                draftPoint={location ? { latitude: location.latitude, longitude: location.longitude, label: 'Current draft location' } : undefined}
                onPick={canPickDraftOnMap ? setDraftLocation : undefined}
              />
            </div>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
