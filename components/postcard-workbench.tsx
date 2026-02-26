'use client';

import dynamic from 'next/dynamic';
import { FormEvent, useMemo, useState } from 'react';

type LocationResult = {
  latitude: number;
  longitude: number;
  confidence: number;
  place_guess: string;
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
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');

  const confidenceLabel = useMemo(() => {
    if (!location) {
      return null;
    }
    return `${Math.round(location.confidence * 100)}%`;
  }, [location]);

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
      const response = await fetch('/api/postcards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          notes,
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
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Central Park bloom walk" />
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
          <button type="submit" disabled={isDetecting}>
            {isDetecting ? 'Detecting...' : 'Detect location with Gemini'}
          </button>
        </form>

        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.4rem' }}>
          <small>{status || 'No action yet.'}</small>
          {location ? (
            <small>
              Result: {location.place_guess} ({location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}), confidence {confidenceLabel}
            </small>
          ) : null}
        </div>

        <div style={{ marginTop: '1rem' }}>
          <button type="button" disabled={isSaving || !location} onClick={savePostcard}>
            {isSaving ? 'Saving...' : 'Save postcard'}
          </button>
        </div>
      </article>

      <article className="panel">
        <h2 style={{ marginBottom: '1rem' }}>Open Map</h2>
        <OpenMap
          latitude={location?.latitude}
          longitude={location?.longitude}
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
