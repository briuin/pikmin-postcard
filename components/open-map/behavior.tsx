'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap, useMapEvents } from 'react-leaflet';
import type {
  DraftPoint,
  MapViewportBounds,
  SavedMapMarker,
  ViewerPoint
} from '@/components/open-map/types';

function emitViewportChange(
  map: ReturnType<typeof useMap>,
  onViewportChange?: (bounds: MapViewportBounds, zoom: number) => void
) {
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

export function MapClickHandler({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
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

export function MapViewportManager({
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
    if (
      viewerPoint &&
      typeof viewerFocusSignal === 'number' &&
      viewerFocusSignal !== lastViewerFocusSignalRef.current
    ) {
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

export function MapViewportEvents({
  onViewportChange
}: {
  onViewportChange?: (bounds: MapViewportBounds, zoom: number) => void;
}) {
  const map = useMapEvents({
    moveend() {
      emitViewportChange(map, onViewportChange);
    },
    zoomend() {
      emitViewportChange(map, onViewportChange);
    }
  });

  useEffect(() => {
    emitViewportChange(map, onViewportChange);
  }, [map, onViewportChange]);

  return null;
}

export function MapLocateControl({
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
