'use client';

import { useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';

type OpenMapProps = {
  latitude?: number;
  longitude?: number;
  onPick?: (lat: number, lng: number) => void;
};

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
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

export function OpenMap({ latitude, longitude, onPick }: OpenMapProps) {
  const center = useMemo<[number, number]>(() => {
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      return [latitude, longitude];
    }
    return [35.6812, 139.7671];
  }, [latitude, longitude]);

  const hasPoint = typeof latitude === 'number' && typeof longitude === 'number';

  return (
    <div className="map-shell">
      <MapContainer center={center} zoom={hasPoint ? 10 : 3} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onPick={onPick} />
        {hasPoint ? (
          <Marker icon={markerIcon} position={[latitude, longitude]}>
            <Popup>
              Detected location<br />
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </Popup>
          </Marker>
        ) : null}
      </MapContainer>
    </div>
  );
}
