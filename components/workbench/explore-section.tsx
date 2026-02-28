'use client';

import Image from 'next/image';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import type { ExploreSort, PostcardRecord } from '@/components/workbench/types';

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
  onSubmitFeedback: (postcardId: string, action: 'like' | 'dislike' | 'report_wrong_location') => void;
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
  const [copyStatus, setCopyStatus] = useState('');

  const selectedPostcard = useMemo(
    () => visiblePostcards.find((postcard) => postcard.id === selectedPostcardId) ?? null,
    [selectedPostcardId, visiblePostcards]
  );

  useEffect(() => {
    if (selectedPostcardId && !selectedPostcard) {
      setSelectedPostcardId(null);
      setCopyStatus('');
    }
  }, [selectedPostcardId, selectedPostcard]);

  useEffect(() => {
    if (!selectedPostcard) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedPostcard]);

  const panelClassName =
    'relative rounded-[22px] border border-white/60 bg-[linear-gradient(165deg,rgba(255,255,255,0.96),rgba(245,255,246,0.92))] p-[0.88rem] shadow-[0_16px_34px_rgba(57,78,66,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] max-[780px]:rounded-2xl max-[780px]:p-3';
  const sectionHeadClassName = 'mb-2 grid gap-1.5';
  const chipRowClassName = 'flex flex-wrap gap-1.5';
  const chipClassName =
    'inline-flex items-center rounded-full border border-[#d6e8d4] bg-[#f4fff4] px-2.5 py-1 text-[0.78rem] font-bold text-[#2b6442]';
  const inlineFieldClassName = 'mb-0 grid gap-1.5 text-[0.91rem] font-bold text-[#39604f]';
  const postcardItemClassName = 'grid gap-1.5 rounded-[14px] border border-[#e2eee0] bg-[#f8fffc] px-3 py-2.5';
  const postcardItemHeadClassName = 'flex items-center justify-between gap-2';
  const exploreResultsClassName =
    'flex min-h-0 flex-col gap-2 overflow-auto pr-1 max-[1080px]:max-h-none max-[1080px]:overflow-visible max-[1080px]:pr-0';
  const smallMutedClassName = 'text-[0.82rem] text-[#5f736c]';
  const actionButtonClassName =
    'rounded-[10px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-2.5 py-1.5 text-[0.83rem] font-bold text-white shadow-[0_4px_10px_rgba(47,158,88,0.18)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';
  const actionButtonWarnClassName =
    'rounded-[10px] bg-[linear-gradient(135deg,#f4c742,#e5a634)] px-2.5 py-1.5 text-[0.83rem] font-bold text-[#25361f] shadow-[0_4px_10px_rgba(229,166,52,0.25)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';
  const cardThumbClassName = 'h-auto max-h-[160px] w-full rounded-[10px] border border-[#deeadb] object-cover';

  async function copyCoordinates(postcard: PostcardRecord) {
    if (typeof postcard.latitude !== 'number' || typeof postcard.longitude !== 'number') {
      setCopyStatus(text.exploreNoCoordinates);
      return;
    }

    try {
      await navigator.clipboard.writeText(
        `${postcard.latitude.toFixed(6)}, ${postcard.longitude.toFixed(6)}`
      );
      setCopyStatus(text.exploreCopyCoordinatesDone);
    } catch {
      setCopyStatus(text.exploreCopyCoordinatesFailed);
    }
  }

  return (
    <article className={`${panelClassName} grid min-h-0 grid-cols-[minmax(320px,390px)_minmax(0,1fr)] items-stretch gap-2 max-[1080px]:grid-cols-1`}>
      <aside className="grid min-h-0 content-stretch grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-2 max-[1080px]:order-2 max-[1080px]:grid-rows-[auto_auto_auto_auto]">
        <div className={sectionHeadClassName}>
          <h2>{text.exploreTitle}</h2>
          <div className={chipRowClassName}>
            <span className={chipClassName}>{text.chipLoaded(visiblePostcards.length)}</span>
            <span className={chipClassName}>{text.chipMarkers(publicMarkerCount)}</span>
            <span className={chipClassName}>{text.chipInArea(visibleTotal)}</span>
            {visibleHasMore ? <span className={chipClassName}>{text.chipLimitedTo(exploreLimit)}</span> : null}
          </div>
        </div>

        <details className="rounded-xl border border-[#dce9d8] bg-[#fbfffa] px-2.5 pb-2.5 pt-1">
          <summary className="cursor-pointer py-2 font-bold text-[#2b6442] marker:text-[#5a7b67]">{text.exploreFiltersTitle}</summary>
          <div className="grid gap-2 pt-1">
            <label className={inlineFieldClassName}>
              {text.exploreSearchLabel}
              <input
                className="w-full rounded-[13px] border border-[#d8e6d5] bg-[#fdfffc] px-3 py-2 text-[#1f2e29] outline-none transition focus:border-[#72b485] focus:ring-4 focus:ring-[rgba(86,179,106,0.18)] disabled:opacity-60"
                value={searchText}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={text.exploreSearchPlaceholder}
              />
            </label>
            <label className={inlineFieldClassName}>
              {text.exploreSortLabel}
              <select
                className="w-full rounded-[13px] border border-[#d8e6d5] bg-[#fdfffc] px-3 py-2 text-[#1f2e29] outline-none transition focus:border-[#72b485] focus:ring-4 focus:ring-[rgba(86,179,106,0.18)]"
                value={exploreSort}
                onChange={(event) => onSortChange(event.target.value as ExploreSort)}
              >
                <option value="ranking">{text.exploreSortRanking}</option>
                <option value="newest">{text.exploreSortNewest}</option>
                <option value="likes">{text.exploreSortLikes}</option>
                <option value="reports">{text.exploreSortReports}</option>
              </select>
            </label>
            <label className={inlineFieldClassName}>
              {text.exploreMaxResultsLabel}
              <select
                className="w-full rounded-[13px] border border-[#d8e6d5] bg-[#fdfffc] px-3 py-2 text-[#1f2e29] outline-none transition focus:border-[#72b485] focus:ring-4 focus:ring-[rgba(86,179,106,0.18)]"
                value={exploreLimit}
                onChange={(event) => onLimitChange(Number(event.target.value))}
              >
                <option value={60}>60</option>
                <option value={120}>120</option>
                <option value={200}>200</option>
              </select>
            </label>
          </div>
        </details>

        <div className="grid gap-0.5 border-y border-[#e1ece0] px-0.5 py-1">
          {!mapBoundsLoaded ? <small className={smallMutedClassName}>{text.exploreLoadingArea}</small> : null}
          {isLoadingPublic ? <small className={smallMutedClassName}>{text.exploreLoadingPostcards}</small> : null}
          {!isLoadingPublic && mapBoundsLoaded && visiblePostcards.length === 0 ? (
            <small className={smallMutedClassName}>{text.exploreNoResults}</small>
          ) : null}
          {exploreStatus ? <small className={smallMutedClassName}>{exploreStatus}</small> : null}
        </div>

        <div className={exploreResultsClassName}>
          {visiblePostcards.map((postcard) => {
            const cardClassName = [
              postcardItemClassName,
              focusedMarkerId === postcard.id ? 'border-[#7ecb95] ring-2 ring-[rgba(86,179,106,0.2)]' : '',
              'shrink-0',
              'cursor-pointer hover:border-[#95d7a7] hover:ring-2 hover:ring-[rgba(86,179,106,0.16)] focus-visible:outline-2 focus-visible:outline-[rgba(86,179,106,0.45)] focus-visible:outline-offset-2'
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <article
                key={postcard.id}
                className={cardClassName}
                onClick={() => setSelectedPostcardId(postcard.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedPostcardId(postcard.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={text.exploreOpenDetailsAria(postcard.title)}
              >
                <div className="flex items-center gap-2">
                  {postcard.imageUrl ? (
                    <Image
                      className="h-12 w-16 shrink-0 rounded-[8px] border border-[#deeadb] object-cover"
                      src={postcard.imageUrl}
                      alt={postcard.title}
                      width={160}
                      height={120}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 grid gap-0.5">
                    <strong className="truncate">{postcard.title}</strong>
                    <small className={smallMutedClassName}>
                      {new Date(postcard.createdAt).toLocaleDateString(text.dateLocale)}
                    </small>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0 max-[1080px]:order-1">{mapNode}</div>

      {selectedPostcard ? (
        <div
          className="fixed inset-0 z-[1200] grid place-items-center bg-[rgba(18,34,27,0.46)] p-3"
          onClick={() => {
            setSelectedPostcardId(null);
            setCopyStatus('');
          }}
        >
          <article
            className="grid max-h-[92vh] w-full max-w-[640px] gap-2 overflow-auto rounded-2xl border border-[#d9ead6] bg-[#fafffa] p-3 shadow-[0_16px_34px_rgba(31,52,42,0.28)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={postcardItemHeadClassName}>
              <strong>{selectedPostcard.title}</strong>
              <button
                type="button"
                className="rounded-lg border border-[#d2e3d0] bg-white px-2 py-1 text-[0.8rem] font-bold text-[#345447]"
                onClick={() => {
                  setSelectedPostcardId(null);
                  setCopyStatus('');
                }}
              >
                {text.buttonCancel}
              </button>
            </div>

            {selectedPostcard.imageUrl ? (
              <Image
                className={cardThumbClassName}
                src={selectedPostcard.imageUrl}
                alt={selectedPostcard.title}
                width={960}
                height={680}
              />
            ) : null}

            <small className={smallMutedClassName}>{selectedPostcard.placeName || text.exploreUnknownPlace}</small>
            {selectedPostcard.uploaderName ? <small className={smallMutedClassName}>{text.exploreUploaderBy(selectedPostcard.uploaderName)}</small> : null}
            <small className={smallMutedClassName}>
              {new Date(selectedPostcard.createdAt).toLocaleString(text.dateLocale)}
            </small>
            <small className={smallMutedClassName}>
              👍 {selectedPostcard.likeCount} · 👎 {selectedPostcard.dislikeCount} · ⚠️ {selectedPostcard.wrongLocationReports}
            </small>

            <div className="grid gap-1 rounded-xl border border-[#e0ebe0] bg-[#f4fbf5] p-2">
              <small className={smallMutedClassName}>
                {typeof selectedPostcard.latitude === 'number' && typeof selectedPostcard.longitude === 'number'
                  ? `${selectedPostcard.latitude.toFixed(6)}, ${selectedPostcard.longitude.toFixed(6)}`
                  : text.exploreNoCoordinates}
              </small>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={actionButtonClassName}
                  onClick={() => void copyCoordinates(selectedPostcard)}
                >
                  {text.exploreCopyCoordinates}
                </button>
                {copyStatus ? <small className={smallMutedClassName}>{copyStatus}</small> : null}
              </div>
            </div>

            {selectedPostcard.notes ? (
              <p className="m-0 rounded-xl border border-[#e2ece1] bg-[#f7fff8] px-2.5 py-2 text-[0.91rem] text-[#365247]">
                {selectedPostcard.notes}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {!isAuthenticated ? (
                <button
                  type="button"
                  className={actionButtonClassName}
                  onClick={onSignIn}
                >
                  {text.buttonSignInGoogle}
                </button>
              ) : null}
              <button
                type="button"
                className={
                  selectedPostcard.viewerFeedback?.liked
                    ? `${actionButtonClassName} ring-2 ring-[rgba(47,158,88,0.32)]`
                    : actionButtonClassName
                }
                onClick={() => onSubmitFeedback(selectedPostcard.id, 'like')}
                disabled={
                  !isAuthenticated ||
                  feedbackPendingKey === `${selectedPostcard.id}:like`
                }
              >
                {!isAuthenticated
                  ? text.exploreVoteUp
                  : selectedPostcard.viewerFeedback?.liked
                    ? text.exploreVoteUpCancel
                    : feedbackPendingKey === `${selectedPostcard.id}:like`
                      ? '...'
                      : text.exploreVoteUp}
              </button>
              <button
                type="button"
                className={
                  selectedPostcard.viewerFeedback?.disliked
                    ? `${actionButtonClassName} ring-2 ring-[rgba(47,158,88,0.32)]`
                    : actionButtonClassName
                }
                onClick={() => onSubmitFeedback(selectedPostcard.id, 'dislike')}
                disabled={
                  !isAuthenticated ||
                  feedbackPendingKey === `${selectedPostcard.id}:dislike`
                }
              >
                {!isAuthenticated
                  ? text.exploreVoteDown
                  : selectedPostcard.viewerFeedback?.disliked
                    ? text.exploreVoteDownCancel
                    : feedbackPendingKey === `${selectedPostcard.id}:dislike`
                      ? '...'
                      : text.exploreVoteDown}
              </button>
              <button
                type="button"
                className={actionButtonWarnClassName}
                onClick={() => onSubmitFeedback(selectedPostcard.id, 'report_wrong_location')}
                disabled={
                  !isAuthenticated ||
                  selectedPostcard.viewerFeedback?.reportedWrongLocation === true ||
                  feedbackPendingKey === `${selectedPostcard.id}:report_wrong_location`
                }
              >
                {!isAuthenticated
                  ? text.exploreFlag
                  : selectedPostcard.viewerFeedback?.reportedWrongLocation
                    ? text.exploreVoteDone
                    : feedbackPendingKey === `${selectedPostcard.id}:report_wrong_location`
                      ? '...'
                      : text.exploreFlag}
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </article>
  );
}
