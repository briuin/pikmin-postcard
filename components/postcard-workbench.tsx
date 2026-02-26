'use client';

import dynamic from 'next/dynamic';
import { FormEvent, useEffect, useMemo, useState } from 'react';
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
  placeName: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
};

const OpenMap = dynamic(
  async () => {
    const mod = await import('@/components/open-map');
    return mod.OpenMap;
  },
  { ssr: false }
);

export function PostcardWorkbench() {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [postcards, setPostcards] = useState<PostcardRecord[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');

  const confidenceLabel = useMemo(() => {
    if (!location) {
      return null;
    }
    return `${Math.round(location.confidence * 100)}%`;
  }, [location]);

  const markers = useMemo<SavedMapMarker[]>(() => {
    return postcards
      .filter(
        (postcard) =>
          typeof postcard.latitude === 'number' &&
          typeof postcard.longitude === 'number'
      )
      .map((postcard) => ({
        id: postcard.id,
        title: postcard.title,
        latitude: postcard.latitude as number,
        longitude: postcard.longitude as number,
        placeName: postcard.placeName,
        imageUrl: postcard.imageUrl
      }));
  }, [postcards]);

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

    if (!response.ok) {
      const errorJson = (await response.json()) as { error?: string };
      throw new Error(errorJson.error ?? 'Image upload failed.');
    }

    const payload = (await response.json()) as { imageUrl: string };
    return payload.imageUrl;
  }

  async function savePostcard() {
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

  return (
    <section className="grid">
      <article className="panel">
        <h2 style={{ marginBottom: '1rem' }}>Postcard Input</h2>
        <form onSubmit={detectLocation}>
          <label>
            Postcard title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Central Park bloom walk"
            />
          </label>
          <label>
            Notes
            <textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Spotted red Pikmin decor near the fountain"
            />
          </label>
          <label>
            Photo
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button type="submit" disabled={isDetecting || isSaving}>
            {isDetecting ? 'Detecting...' : 'Detect location with Gemini'}
          </button>
        </form>

        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.4rem' }}>
          <small>{status || 'No action yet.'}</small>
          {location ? (
            <small>
              Result: {location.place_guess} ({location.latitude.toFixed(6)},{' '}
              {location.longitude.toFixed(6)}), confidence {confidenceLabel}
            </small>
          ) : null}
        </div>

        <div style={{ marginTop: '1rem' }}>
          <button type="button" disabled={isSaving || !location} onClick={savePostcard}>
            {isSaving ? 'Saving...' : 'Save postcard'}
          </button>
        </div>

        <hr style={{ border: 0, borderTop: '1px solid #e5ebdf', margin: '1rem 0' }} />

        <h2 style={{ marginBottom: '0.5rem' }}>Recent Postcards</h2>
        {isLoadingList ? <small>Loading...</small> : null}
        {!isLoadingList && postcards.length === 0 ? <small>No postcards yet.</small> : null}
        <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.4rem' }}>
          {postcards.slice(0, 8).map((postcard) => (
            <div
              key={postcard.id}
              style={{
                padding: '0.55rem 0.65rem',
                borderRadius: '8px',
                border: '1px solid #e5ebdf',
                background: '#fcfffa'
              }}
            >
              <strong style={{ fontSize: '0.93rem' }}>{postcard.title}</strong>
              <br />
              <small>{postcard.placeName || 'Unknown place'}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="panel">
        <h2 style={{ marginBottom: '1rem' }}>Open Map</h2>
        <OpenMap
          markers={markers}
          draftPoint={
            location
              ? {
                  latitude: location.latitude,
                  longitude: location.longitude,
                  label: 'Current draft location'
                }
              : undefined
          }
          onPick={(lat, lng) => {
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
          }}
        />
      </article>
    </section>
  );
}
