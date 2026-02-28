'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import type { DeviceLocation, GeoPermissionState } from '@/components/workbench/types';

type UseExploreGeolocationControllerArgs = {
  text: Pick<WorkbenchText, 'geoUnsupported' | 'geoLocateFailed' | 'geoLocated'>;
  onSetStatus: (status: string) => void;
  onResetFocusedMarker: () => void;
};

export function useExploreGeolocationController({
  text,
  onSetStatus,
  onResetFocusedMarker
}: UseExploreGeolocationControllerArgs) {
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(null);
  const [viewerFocusSignal, setViewerFocusSignal] = useState(0);
  const [, setGeoPermission] = useState<GeoPermissionState>('prompt');
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);

  const requestDeviceLocation = useCallback(
    async (silent = false): Promise<boolean> => {
      if (!navigator.geolocation) {
        setGeoPermission('unsupported');
        if (!silent) {
          onSetStatus(text.geoUnsupported);
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
          onSetStatus(text.geoLocateFailed);
        }

        if (granted && !silent) {
          onResetFocusedMarker();
          setViewerFocusSignal((current) => current + 1);
          onSetStatus(text.geoLocated);
        }

        return granted;
      } finally {
        setIsRequestingLocation(false);
      }
    },
    [onResetFocusedMarker, onSetStatus, text.geoLocateFailed, text.geoLocated, text.geoUnsupported]
  );

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

  return {
    deviceLocation,
    viewerFocusSignal,
    isRequestingLocation,
    requestDeviceLocation
  };
}
