'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ExploreFilters } from '@/components/workbench/explore-view/filters';
import { ExplorePostcardModal } from '@/components/workbench/explore-view/postcard-modal';
import { ExplorePostcardsList } from '@/components/workbench/explore-view/postcards-list';
import { ExploreStatusStrip } from '@/components/workbench/explore-view/status-strip';
import {
  panelClassName
} from '@/components/workbench/explore-view/styles';
import { ExploreSummary } from '@/components/workbench/explore-view/summary';
import { ExploreToastBanner } from '@/components/workbench/explore-view/toast';
import type { ExploreReportInput, ExploreToast } from '@/components/workbench/explore-view/types';
import { useAutoDismiss } from '@/components/use-auto-dismiss';
import { useBodyScrollLock } from '@/components/use-body-scroll-lock';
import type { WorkbenchText } from '@/lib/i18n';
import type { ExploreSort, PostcardRecord } from '@/components/workbench/types';
import type { ExploreFeedbackAction } from '@/components/workbench/explore/shared';

type ExploreSectionProps = {
  text: WorkbenchText;
  isAuthenticated: boolean;
  visiblePostcards: PostcardRecord[];
  publicMarkerCount: number;
  visibleTotal: number;
  visibleHasMore: boolean;
  exploreLimit: number;
  exploreSort: ExploreSort;
  searchText: string;
  mapBoundsLoaded: boolean;
  isLoadingPublic: boolean;
  exploreStatus: string;
  focusedMarkerId: string | null;
  feedbackPendingKey: string | null;
  onSearchChange: (value: string) => void;
  onSortChange: (value: ExploreSort) => void;
  onLimitChange: (value: number) => void;
  onSubmitFeedback: (
    postcardId: string,
    action: ExploreFeedbackAction,
    reportInput?: ExploreReportInput
  ) => void;
  onSignIn: () => void;
  mapNode: ReactNode;
};

export function ExploreSection({
  text,
  isAuthenticated,
  visiblePostcards,
  publicMarkerCount,
  visibleTotal,
  visibleHasMore,
  exploreLimit,
  exploreSort,
  searchText,
  mapBoundsLoaded,
  isLoadingPublic,
  exploreStatus,
  focusedMarkerId,
  feedbackPendingKey,
  onSearchChange,
  onSortChange,
  onLimitChange,
  onSubmitFeedback,
  onSignIn,
  mapNode
}: ExploreSectionProps) {
  const [selectedPostcardId, setSelectedPostcardId] = useState<string | null>(null);
  const [toast, setToast] = useState<ExploreToast | null>(null);

  const selectedPostcard = useMemo(
    () => visiblePostcards.find((postcard) => postcard.id === selectedPostcardId) ?? null,
    [selectedPostcardId, visiblePostcards]
  );

  useEffect(() => {
    if (selectedPostcardId && !selectedPostcard) {
      setSelectedPostcardId(null);
    }
  }, [selectedPostcardId, selectedPostcard]);
  const clearToast = useCallback(() => setToast(null), []);
  useAutoDismiss(toast, clearToast);
  useBodyScrollLock(Boolean(selectedPostcard));

  function showToast(message: string, tone: 'success' | 'error') {
    setToast({ message, tone });
  }

  async function copyCoordinates(postcard: PostcardRecord) {
    if (typeof postcard.latitude !== 'number' || typeof postcard.longitude !== 'number') {
      showToast(text.exploreNoCoordinates, 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(`${postcard.latitude.toFixed(6)}, ${postcard.longitude.toFixed(6)}`);
      showToast(text.exploreCopyCoordinatesDone, 'success');
    } catch {
      showToast(text.exploreCopyCoordinatesFailed, 'error');
    }
  }

  async function copyShareLink(postcard: PostcardRecord) {
    try {
      const baseUrl = window.location.origin;
      await navigator.clipboard.writeText(`${baseUrl}/postcard/${postcard.id}`);
      showToast(text.exploreSharePostcardDone, 'success');
    } catch {
      showToast(text.exploreSharePostcardFailed, 'error');
    }
  }

  return (
    <article
      className={`${panelClassName} grid min-h-0 grid-cols-[minmax(320px,390px)_minmax(0,1fr)] items-stretch gap-2 max-[1080px]:grid-cols-1`}
    >
      <aside className="grid min-h-0 content-stretch grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-2 max-[1080px]:order-2 max-[1080px]:grid-rows-[auto_auto_auto_auto]">
        <ExploreSummary
          text={text}
          visiblePostcardsCount={visiblePostcards.length}
          publicMarkerCount={publicMarkerCount}
          visibleTotal={visibleTotal}
          visibleHasMore={visibleHasMore}
          exploreLimit={exploreLimit}
        />

        <ExploreFilters
          text={text}
          exploreSort={exploreSort}
          searchText={searchText}
          exploreLimit={exploreLimit}
          onSearchChange={onSearchChange}
          onSortChange={onSortChange}
          onLimitChange={onLimitChange}
        />

        <ExploreStatusStrip
          text={text}
          mapBoundsLoaded={mapBoundsLoaded}
          isLoadingPublic={isLoadingPublic}
          visiblePostcardsCount={visiblePostcards.length}
          exploreStatus={exploreStatus}
        />

        <ExplorePostcardsList
          text={text}
          visiblePostcards={visiblePostcards}
          focusedMarkerId={focusedMarkerId}
          onSelectPostcardId={setSelectedPostcardId}
        />
      </aside>

      <div className="min-w-0 max-[1080px]:order-1">{mapNode}</div>

      {selectedPostcard ? (
        <ExplorePostcardModal
          text={text}
          isAuthenticated={isAuthenticated}
          postcard={selectedPostcard}
          feedbackPendingKey={feedbackPendingKey}
          onClose={() => setSelectedPostcardId(null)}
          onSubmitFeedback={onSubmitFeedback}
          onCopyCoordinates={copyCoordinates}
          onCopyShareLink={copyShareLink}
          onSignIn={onSignIn}
        />
      ) : null}

      <ExploreToastBanner toast={toast} />
    </article>
  );
}
