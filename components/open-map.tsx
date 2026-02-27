'use client';

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import Image from 'next/image';
import { Circle, CircleMarker, MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';

export type SavedMapMarker = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  placeName?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  createdAt?: string;
  locationStatus?: 'AUTO' | 'USER_CONFIRMED' | 'MANUAL';
  aiConfidence?: number | null;
  aiPlaceGuess?: string | null;
  locationModelVersion?: string | null;
  uploaderMasked?: string | null;
  likeCount?: number;
  dislikeCount?: number;
  wrongLocationReports?: number;
};

export type MapViewportBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

type DraftPoint = {
  latitude: number;
  longitude: number;
  label: string;
};

type ViewerPoint = {
  latitude: number;
  longitude: number;
  label?: string;
  accuracy?: number;
};

type OpenMapProps = {
  draftPoint?: DraftPoint;
  viewerPoint?: ViewerPoint;
  markers?: SavedMapMarker[];
  focusedMarkerId?: string | null;
  viewerFocusSignal?: number;
  onLocateRequest?: () => Promise<boolean> | boolean;
  isLocating?: boolean;
  onViewportChange?: (bounds: MapViewportBounds, zoom: number) => void;
  onPick?: (lat: number, lng: number) => void;
  className?: string;
};

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

const clusterIcon = (count: number) =>
  L.divIcon({
    html: `<div style="
      width:36px;
      height:36px;
      border-radius:999px;
      display:flex;
      align-items:center;
      justify-content:center;
      color:#fff;
      font-weight:700;
      background:#2c8f5f;
      border:2px solid #fff;
      box-shadow:0 3px 10px rgba(0,0,0,0.25);
    ">${count}</div>`,
    className: 'cluster-icon',
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });

function MapClickHandler({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      if (!onPick) {
        return;
      }
      onPick(event.latlng.lat, event.latlng.lng);
    }
  });
  return null;
}

function MapViewportManager({
  draftPoint,
  viewerPoint,
  markers,
  focusedMarker,
  viewerFocusSignal
}: {
  draftPoint?: DraftPoint;
  viewerPoint?: ViewerPoint;
  markers: SavedMapMarker[];
  focusedMarker?: SavedMapMarker;
  viewerFocusSignal?: number;
}) {
  const map = useMap();
  const initializedRef = useRef(false);
  const lastFocusedIdRef = useRef<string | null>(null);
  const lastViewerFocusSignalRef = useRef(0);

  useEffect(() => {
    if (viewerPoint && typeof viewerFocusSignal === 'number' && viewerFocusSignal !== lastViewerFocusSignalRef.current) {
      map.setView([viewerPoint.latitude, viewerPoint.longitude], 13);
      lastViewerFocusSignalRef.current = viewerFocusSignal;
      lastFocusedIdRef.current = null;
      return;
    }

    if (focusedMarker) {
      if (lastFocusedIdRef.current !== focusedMarker.id) {
        map.setView([focusedMarker.latitude, focusedMarker.longitude], 12);
        lastFocusedIdRef.current = focusedMarker.id;
      }
      return;
    }
    lastFocusedIdRef.current = null;

    if (draftPoint) {
      map.setView([draftPoint.latitude, draftPoint.longitude], 10);
      return;
    }

    if (initializedRef.current) {
      return;
    }

    const points: Array<[number, number]> = markers.map((marker) => [marker.latitude, marker.longitude]);
    if (viewerPoint) {
      points.push([viewerPoint.latitude, viewerPoint.longitude]);
    }

    if (points.length === 0) {
      map.setView([35.6812, 139.7671], 3);
      initializedRef.current = true;
      return;
    }

    if (points.length === 1) {
      const zoom = viewerPoint && markers.length === 0 ? 11 : 6;
      map.setView(points[0], zoom);
      initializedRef.current = true;
      return;
    }

    map.fitBounds(points, {
      padding: [36, 36],
      maxZoom: 7
    });
    initializedRef.current = true;
  }, [map, focusedMarker, draftPoint, viewerPoint, viewerFocusSignal, markers]);

  return null;
}

function MapViewportEvents({
  onViewportChange
}: {
  onViewportChange?: (bounds: MapViewportBounds, zoom: number) => void;
}) {
  const map = useMapEvents({
    moveend() {
      if (!onViewportChange) {
        return;
      }
      const bounds = map.getBounds();
      onViewportChange(
        {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        },
        map.getZoom()
      );
    },
    zoomend() {
      if (!onViewportChange) {
        return;
      }
      const bounds = map.getBounds();
      onViewportChange(
        {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        },
        map.getZoom()
      );
    }
  });

  useEffect(() => {
    if (!onViewportChange) {
      return;
    }
    const bounds = map.getBounds();
    onViewportChange(
      {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      },
      map.getZoom()
    );
  }, [map, onViewportChange]);

  return null;
}

function MapLocateControl({
  viewerPoint,
  onLocateRequest,
  isLocating
}: {
  viewerPoint?: ViewerPoint;
  onLocateRequest?: () => Promise<boolean> | boolean;
  isLocating?: boolean;
}) {
  const map = useMap();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const viewerRef = useRef<ViewerPoint | undefined>(viewerPoint);
  const requestRef = useRef<(() => Promise<boolean> | boolean) | undefined>(onLocateRequest);

  useEffect(() => {
    viewerRef.current = viewerPoint;
  }, [viewerPoint]);

  useEffect(() => {
    requestRef.current = onLocateRequest;
  }, [onLocateRequest]);

  useEffect(() => {
    if (!buttonRef.current) {
      return;
    }
    buttonRef.current.disabled = Boolean(isLocating);
    if (isLocating) {
      buttonRef.current.classList.add('locate-control-button-loading');
    } else {
      buttonRef.current.classList.remove('locate-control-button-loading');
    }
  }, [isLocating]);

  useEffect(() => {
    const control = new L.Control({ position: 'topright' });

    control.onAdd = () => {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control locate-control');
      const button = L.DomUtil.create('button', 'locate-control-button', container) as HTMLButtonElement;
      button.type = 'button';
      button.title = 'Find my location';
      button.ariaLabel = 'Find my location';
      button.innerHTML = '<span class="locate-target-icon" aria-hidden="true"></span>';
      buttonRef.current = button;
      button.disabled = Boolean(isLocating);

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      L.DomEvent.on(button, 'click', async (event) => {
        L.DomEvent.preventDefault(event);

        const currentViewer = viewerRef.current;
        if (currentViewer) {
          map.setView([currentViewer.latitude, currentViewer.longitude], Math.max(map.getZoom(), 14));
          return;
        }

        if (!requestRef.current) {
          return;
        }

        const granted = await requestRef.current();
        if (!granted) {
          return;
        }

        const updatedViewer = viewerRef.current;
        if (updatedViewer) {
          map.setView([updatedViewer.latitude, updatedViewer.longitude], Math.max(map.getZoom(), 14));
        }
      });

      return container;
    };

    control.addTo(map);

    return () => {
      buttonRef.current = null;
      control.remove();
    };
  }, [map, isLocating]);

  return null;
}

type MarkerCluster = {
  id: string;
  latitude: number;
  longitude: number;
  points: SavedMapMarker[];
};

function clusterByDistance(markers: SavedMapMarker[]): MarkerCluster[] {
  const threshold = 0.2;
  const clusters: MarkerCluster[] = [];

  for (const marker of markers) {
    let matched: MarkerCluster | null = null;

    for (const cluster of clusters) {
      const latDiff = marker.latitude - cluster.latitude;
      const lngDiff = marker.longitude - cluster.longitude;
      const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

      if (distance <= threshold) {
        matched = cluster;
        break;
      }
    }

    if (!matched) {
      clusters.push({
        id: marker.id,
        latitude: marker.latitude,
        longitude: marker.longitude,
        points: [marker]
      });
      continue;
    }

    matched.points.push(marker);
    const total = matched.points.length;
    matched.latitude = (matched.latitude * (total - 1) + marker.latitude) / total;
    matched.longitude = (matched.longitude * (total - 1) + marker.longitude) / total;
  }

  return clusters;
}

function getLocationMethodText(marker: SavedMapMarker): string {
  if (marker.locationStatus === 'MANUAL') {
    return 'Location: manual input';
  }

  if (typeof marker.aiConfidence === 'number') {
    return `Location: AI detected (${Math.round(marker.aiConfidence * 100)}% confidence)`;
  }

  if (marker.locationStatus === 'USER_CONFIRMED') {
    return 'Location: AI detected and user confirmed';
  }

  return 'Location: unknown method';
}

export function OpenMap({
  draftPoint,
  viewerPoint,
  markers = [],
  focusedMarkerId,
  viewerFocusSignal,
  onLocateRequest,
  isLocating,
  onViewportChange,
  onPick,
  className
}: OpenMapProps) {
  const clusters = useMemo(() => clusterByDistance(markers), [markers]);
  const focusedMarker = useMemo(
    () => (focusedMarkerId ? markers.find((marker) => marker.id === focusedMarkerId) : undefined),
    [focusedMarkerId, markers]
  );

  return (
    <div className={className ? `map-shell ${className}` : 'map-shell'}>
      <MapContainer center={[35.6812, 139.7671]} zoom={3} zoomControl={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onPick={onPick} />
        <MapLocateControl viewerPoint={viewerPoint} onLocateRequest={onLocateRequest} isLocating={isLocating} />
        <ZoomControl position="topright" />
        <MapViewportEvents onViewportChange={onViewportChange} />
        <MapViewportManager
          draftPoint={draftPoint}
          viewerPoint={viewerPoint}
          markers={markers}
          focusedMarker={focusedMarker}
          viewerFocusSignal={viewerFocusSignal}
        />

        {clusters.map((cluster) => {
          if (cluster.points.length === 1) {
            const point = cluster.points[0];
            return (
              <Marker key={point.id} icon={markerIcon} position={[point.latitude, point.longitude]}>
                <Popup>
                  <strong>{point.title}</strong>
                  <br />
                  {point.placeName || 'Unknown place'}
                  <br />
                  {getLocationMethodText(point)}
                  <br />
                  by {point.uploaderMasked ?? 'unknown uploader'}
                  {point.aiPlaceGuess ? (
                    <>
                      <br />
                      AI guess: {point.aiPlaceGuess}
                    </>
                  ) : null}
                  {point.locationModelVersion ? (
                    <>
                      <br />
                      model: {point.locationModelVersion}
                    </>
                  ) : null}
                  <br />
                  {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
                  {point.createdAt ? (
                    <>
                      <br />
                      uploaded: {new Date(point.createdAt).toLocaleString()}
                    </>
                  ) : null}
                  {point.notes ? (
                    <>
                      <br />
                      {point.notes}
                    </>
                  ) : null}
                  <br />
                  👍 {point.likeCount ?? 0} · 👎 {point.dislikeCount ?? 0} · ⚠️ {point.wrongLocationReports ?? 0}
                  {point.imageUrl ? (
                    <>
                      <br />
                      <Image
                        alt={point.title}
                        src={point.imageUrl}
                        width={160}
                        height={116}
                        style={{ marginTop: '0.45rem', borderRadius: '6px', objectFit: 'cover' }}
                      />
                    </>
                  ) : null}
                </Popup>
              </Marker>
            );
          }

          return (
            <Marker
              key={cluster.id}
              icon={clusterIcon(cluster.points.length)}
              position={[cluster.latitude, cluster.longitude]}
            >
              <Popup>
                <strong>{cluster.points.length} postcards nearby</strong>
                <ul style={{ margin: '0.45rem 0 0', paddingLeft: '1rem' }}>
                  {cluster.points.slice(0, 6).map((point) => (
                    <li key={point.id}>{point.title} ({point.uploaderMasked ?? 'unknown'})</li>
                  ))}
                </ul>
              </Popup>
            </Marker>
          );
        })}

        {draftPoint ? (
          <Marker icon={markerIcon} position={[draftPoint.latitude, draftPoint.longitude]}>
            <Popup>
              {draftPoint.label}
              <br />
              {draftPoint.latitude.toFixed(6)}, {draftPoint.longitude.toFixed(6)}
            </Popup>
          </Marker>
        ) : null}

        {viewerPoint ? (
          <>
            <Circle
              center={[viewerPoint.latitude, viewerPoint.longitude]}
              radius={Math.max(12, viewerPoint.accuracy ?? 0)}
              pathOptions={{
                color: '#3e89ff',
                weight: 1,
                fillColor: '#69a9ff',
                fillOpacity: 0.18
              }}
            />
            <CircleMarker
              center={[viewerPoint.latitude, viewerPoint.longitude]}
              radius={9}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: '#2f7dff',
                fillOpacity: 0.95
              }}
            >
              <Popup>
                {viewerPoint.label ?? 'Your current location'}
                <br />
                {viewerPoint.latitude.toFixed(6)}, {viewerPoint.longitude.toFixed(6)}
                {typeof viewerPoint.accuracy === 'number' ? (
                  <>
                    <br />
                    Accuracy: +/-{Math.round(viewerPoint.accuracy)}m
                  </>
                ) : null}
              </Popup>
            </CircleMarker>
          </>
        ) : null}
      </MapContainer>
    </div>
  );
}
