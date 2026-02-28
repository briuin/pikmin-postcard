'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MapViewportBounds } from '@/components/open-map';
import {
  areBoundsNearlyEqual,
  buildPublicMarkers,
  buildPublicPostcardsParams,
  getFeedbackStatusMessage,
  type ExploreFeedbackAction
} from '@/components/workbench/explore/shared';
import type { ExploreReportInput } from '@/components/workbench/explore-view/types';
import { useExploreGeolocationController } from '@/components/workbench/explore/use-geolocation-controller';
import type { WorkbenchText } from '@/lib/i18n';
import { parseJsonResponseOrThrow } from '@/lib/http-response';
import type {
  ExploreSort,
  PostcardRecord,
  PublicPostcardsPayload
} from '@/components/workbench/types';

type UseExploreControllerArgs = {
  text: WorkbenchText;
  isAuthenticated: boolean;
  showExplore: boolean;
};

export function useExploreController({ text, isAuthenticated, showExplore }: UseExploreControllerArgs) {
  const [searchText, setSearchText] = useState('');
  const [focusedMarkerId, setFocusedMarkerId] = useState<string | null>(null);
  const [postcards, setPostcards] = useState<PostcardRecord[]>([]);
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [exploreStatus, setExploreStatus] = useState('');
  const [exploreSort, setExploreSort] = useState<ExploreSort>('ranking');
  const [exploreLimit, setExploreLimit] = useState(120);
  const [visibleTotal, setVisibleTotal] = useState(0);
  const [visibleHasMore, setVisibleHasMore] = useState(false);
  const [mapBounds, setMapBounds] = useState<MapViewportBounds | null>(null);
  const [feedbackPendingKey, setFeedbackPendingKey] = useState<string | null>(null);

  const visiblePostcards = postcards;

  const publicMarkers = useMemo(() => buildPublicMarkers(visiblePostcards), [visiblePostcards]);

  const {
    deviceLocation,
    viewerFocusSignal,
    isRequestingLocation,
    requestDeviceLocation
  } = useExploreGeolocationController({
    text,
    onSetStatus: setExploreStatus,
    onResetFocusedMarker: () => setFocusedMarkerId(null)
  });

  const handleViewportChange = useCallback((bounds: MapViewportBounds) => {
    setMapBounds((current) => {
      if (!current) {
        return bounds;
      }
      return areBoundsNearlyEqual(current, bounds) ? current : bounds;
    });
  }, []);

  const loadPublicPostcards = useCallback(async () => {
    if (!mapBounds || !showExplore) {
      return;
    }

    setIsLoadingPublic(true);
    try {
      const params = buildPublicPostcardsParams({
        mapBounds,
        exploreSort,
        exploreLimit,
        searchText
      });

      const response = await fetch(`/api/postcards?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(text.exploreLoadFailed);
      }

      const data = (await response.json()) as PublicPostcardsPayload | PostcardRecord[];
      if (Array.isArray(data)) {
        setPostcards(data);
        setVisibleTotal(data.length);
        setVisibleHasMore(false);
        return;
      }

      setPostcards(data.items ?? []);
      setVisibleTotal(typeof data.total === 'number' ? data.total : data.items?.length ?? 0);
      setVisibleHasMore(Boolean(data.hasMore));
    } catch (error) {
      setExploreStatus(error instanceof Error ? error.message : text.exploreUnknownError);
    } finally {
      setIsLoadingPublic(false);
    }
  }, [
    mapBounds,
    showExplore,
    exploreSort,
    exploreLimit,
    searchText,
    text.exploreLoadFailed,
    text.exploreUnknownError
  ]);

  const submitExploreFeedback = useCallback(
    async (
      postcardId: string,
      action: ExploreFeedbackAction,
      reportInput?: ExploreReportInput
    ) => {
      if (!isAuthenticated) {
        setExploreStatus(text.feedbackRequireAuth);
        return;
      }

      const key = `${postcardId}:${action}`;
      setFeedbackPendingKey(key);

      try {
        const response = await fetch(`/api/postcards/${postcardId}/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            action === 'report'
              ? {
                  action,
                  reason: reportInput?.reason ?? 'wrong_location',
                  description: reportInput?.description ?? ''
                }
              : { action }
          )
        });

        const payload = await parseJsonResponseOrThrow<{
          error?: string;
          result?: 'added' | 'removed' | 'switched' | 'already_reported';
          action?: ExploreFeedbackAction;
        }>(response, text.feedbackFailed);

        const feedbackAction = payload.action ?? action;
        const result = payload.result ?? 'added';
        setExploreStatus(getFeedbackStatusMessage(text, feedbackAction, result));

        await loadPublicPostcards();
      } catch (error) {
        setExploreStatus(error instanceof Error ? error.message : text.feedbackUnknownError);
      } finally {
        setFeedbackPendingKey(null);
      }
    },
    [
      isAuthenticated,
      loadPublicPostcards,
      text
    ]
  );

  useEffect(() => {
    if (!showExplore || !mapBounds) {
      return;
    }

    const timeout = setTimeout(() => {
      void loadPublicPostcards();
    }, 180);

    return () => clearTimeout(timeout);
  }, [showExplore, mapBounds, loadPublicPostcards]);

  return {
    searchText,
    focusedMarkerId,
    visiblePostcards,
    publicMarkers,
    isLoadingPublic,
    exploreStatus,
    exploreSort,
    exploreLimit,
    visibleTotal,
    visibleHasMore,
    mapBounds,
    feedbackPendingKey,
    deviceLocation,
    viewerFocusSignal,
    isRequestingLocation,
    setSearchText,
    setFocusedMarkerId,
    setExploreSort,
    setExploreLimit,
    handleViewportChange,
    requestDeviceLocation,
    loadPublicPostcards,
    submitExploreFeedback
  };
}
