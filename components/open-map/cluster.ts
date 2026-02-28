import L from 'leaflet';
import type { SavedMapMarker } from '@/components/open-map/types';

export type MarkerCluster = {
  id: string;
  latitude: number;
  longitude: number;
  points: SavedMapMarker[];
};

export function clusterIcon(count: number) {
  return L.divIcon({
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
}

export function clusterByDistance(markers: SavedMapMarker[]): MarkerCluster[] {
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
