'use client';

import { useMemo } from 'react';
import L from 'leaflet';
import Image from 'next/image';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';

export type SavedMapMarker = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  placeName?: string | null;
  imageUrl?: string | null;
};

type DraftPoint = {
  latitude: number;
  longitude: number;
  label: string;
};

type OpenMapProps = {
  draftPoint?: DraftPoint;
  markers?: SavedMapMarker[];
  onPick?: (lat: number, lng: number) => void;
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

export function OpenMap({ draftPoint, markers = [], onPick }: OpenMapProps) {
  const center = useMemo<[number, number]>(() => {
    if (draftPoint) {
      return [draftPoint.latitude, draftPoint.longitude];
    }

    if (markers.length > 0) {
      return [markers[0].latitude, markers[0].longitude];
    }

    return [35.6812, 139.7671];
  }, [draftPoint, markers]);

  const clusters = useMemo(() => clusterByDistance(markers), [markers]);

  return (
    <div className="map-shell">
      <MapContainer center={center} zoom={draftPoint ? 10 : 3} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onPick={onPick} />

        {clusters.map((cluster) => {
          if (cluster.points.length === 1) {
            const point = cluster.points[0];
            return (
              <Marker key={point.id} icon={markerIcon} position={[point.latitude, point.longitude]}>
                <Popup>
                  <strong>{point.title}</strong>
                  <br />
                  {point.placeName || 'Unknown place'}
                  {point.imageUrl ? (
                    <>
                      <br />
                      <Image
                        alt={point.title}
                        src={point.imageUrl}
                        width={130}
                        height={94}
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
                    <li key={point.id}>{point.title}</li>
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
      </MapContainer>
    </div>
  );
}
