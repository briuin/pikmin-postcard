'use client';

import { useMemo } from 'react';
import L from 'leaflet';
import Image from 'next/image';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  ZoomControl
} from 'react-leaflet';
import { clusterByDistance, clusterIcon } from '@/components/open-map/cluster';
import {
  MapClickHandler,
  MapLocateControl,
  MapViewportEvents,
  MapViewportManager
} from '@/components/open-map/behavior';
import type { OpenMapProps, SavedMapMarker } from '@/components/open-map/types';

export type { MapViewportBounds, OpenMapProps, SavedMapMarker } from '@/components/open-map/types';

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

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

  const mapShellClassName = className
    ? `overflow-hidden rounded-2xl border border-[#d6e7db] ${className}`
    : 'h-[510px] overflow-hidden rounded-2xl border border-[#d6e7db]';

  return (
    <div className={mapShellClassName}>
      <MapContainer
        center={[35.6812, 139.7671]}
        zoom={3}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
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
                  by {point.uploaderName ?? 'unknown uploader'}
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
                    <li key={point.id}>
                      {point.title} ({point.uploaderName ?? 'unknown'})
                    </li>
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
