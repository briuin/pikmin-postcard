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
  const [shareStatus, setShareStatus] = useState('');

  const selectedPostcard = useMemo(
    () => visiblePostcards.find((postcard) => postcard.id === selectedPostcardId) ?? null,
    [selectedPostcardId, visiblePostcards]
  );

  useEffect(() => {
    if (selectedPostcardId && !selectedPostcard) {
      setSelectedPostcardId(null);
      setCopyStatus('');
      setShareStatus('');
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
  const cardThumbClassName = 'h-auto max-h-[320px] w-full rounded-[14px] border border-[#d7e8df] bg-[#eef6f2] object-cover shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]';
  const modalChipClassName =
    'inline-flex items-center rounded-full border border-[#d5e8d8] bg-[#f6fff7] px-2.5 py-1 text-[0.78rem] font-semibold text-[#355848]';
  const modalActionButtonClassName =
    'rounded-xl border border-[#cde5cf] bg-[linear-gradient(135deg,#58b96d,#369d5a)] px-3 py-2 text-[0.86rem] font-bold text-white shadow-[0_6px_14px_rgba(53,156,89,0.22)] transition hover:enabled:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';
  const modalActionWarnButtonClassName =
    'rounded-xl border border-[#e9c782] bg-[linear-gradient(135deg,#f2cf6a,#e3b84f)] px-3 py-2 text-[0.86rem] font-bold text-[#34402f] shadow-[0_6px_14px_rgba(220,170,67,0.2)] transition hover:enabled:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';

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

  async function copyShareLink(postcard: PostcardRecord) {
    try {
      const baseUrl = window.location.origin;
      await navigator.clipboard.writeText(`${baseUrl}/postcard/${postcard.id}`);
      setShareStatus(text.exploreSharePostcardDone);
    } catch {
      setShareStatus(text.exploreSharePostcardFailed);
    }
  }

  function isAiDetected(postcard: PostcardRecord): boolean {
    return (
      postcard.locationStatus === 'AUTO' ||
      postcard.locationStatus === 'USER_CONFIRMED' ||
      typeof postcard.aiConfidence === 'number' ||
      Boolean(postcard.aiPlaceGuess)
    );
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
                    <div className="flex items-center gap-1.5">
                      <strong className="truncate">{postcard.title}</strong>
                      {isAiDetected(postcard) ? (
                        <span className="inline-flex shrink-0 items-center rounded-full border border-[#c6d9ff] bg-[#e9f1ff] px-1.5 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.06em] text-[#365da6]">
                          AI
                        </span>
                      ) : null}
                    </div>
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
          className="fixed inset-0 z-[1200] grid place-items-center bg-[radial-gradient(circle_at_16%_8%,rgba(244,199,66,0.26),transparent_38%),radial-gradient(circle_at_86%_18%,rgba(78,142,247,0.22),transparent_40%),rgba(14,28,22,0.58)] p-3 backdrop-blur-[2px] max-[780px]:place-items-end max-[780px]:p-0"
          onClick={() => {
            setSelectedPostcardId(null);
            setCopyStatus('');
            setShareStatus('');
          }}
        >
          <article
            className="relative grid max-h-[92vh] w-full max-w-[680px] gap-3 overflow-auto overflow-x-hidden rounded-[26px] border border-[#d8e9d7] bg-[radial-gradient(circle_at_12%_8%,rgba(244,199,66,0.22),transparent_34%),radial-gradient(circle_at_88%_14%,rgba(78,142,247,0.18),transparent_36%),linear-gradient(170deg,#fbfffc,#f2fff5)] p-3.5 shadow-[0_24px_48px_rgba(21,42,33,0.34),inset_0_1px_0_rgba(255,255,255,0.75)] max-[780px]:max-h-[100dvh] max-[780px]:max-w-none max-[780px]:rounded-none max-[780px]:border-x-0 max-[780px]:border-b-0 max-[780px]:px-3 max-[780px]:pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-none absolute -right-12 -top-16 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(86,179,106,0.28),rgba(86,179,106,0))] max-[780px]:hidden" />
            <div className="pointer-events-none absolute -left-8 bottom-16 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(244,199,66,0.28),rgba(244,199,66,0))] max-[780px]:hidden" />

            <div className={`${postcardItemHeadClassName} relative z-10`}>
              <div className="grid min-w-0 gap-1">
                <span className="inline-flex w-fit items-center rounded-full border border-[#d4e7d3] bg-[#f4fff4] px-2.5 py-1 text-[0.72rem] font-black uppercase tracking-[0.08em] text-[#2b6442]">
                  {text.exploreTitle}
                </span>
                <div className="flex items-center gap-1.5">
                  <strong className="text-[1.1rem] leading-tight text-[#1a3428] max-[580px]:text-[1rem]">{selectedPostcard.title}</strong>
                  {isAiDetected(selectedPostcard) ? (
                    <span className="inline-flex shrink-0 items-center rounded-full border border-[#c6d9ff] bg-[#e9f1ff] px-1.5 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.06em] text-[#365da6]">
                      AI
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="h-8 w-8 shrink-0 rounded-full border border-[#d2e4d2] bg-white/90 text-[1rem] font-bold leading-none text-[#325445] shadow-[0_4px_10px_rgba(40,73,57,0.12)]"
                onClick={() => {
                  setSelectedPostcardId(null);
                  setCopyStatus('');
                  setShareStatus('');
                }}
                aria-label={text.buttonCancel}
                title={text.buttonCancel}
              >
                ×
              </button>
            </div>

            {selectedPostcard.imageUrl ? (
              <div className="relative z-10 grid gap-2 rounded-[18px] border border-[#d9e9dd] bg-[#f8fffb] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                <Image
                  className={cardThumbClassName}
                  src={selectedPostcard.imageUrl}
                  alt={selectedPostcard.title}
                  width={960}
                  height={680}
                />
                <div className="flex flex-wrap gap-1.5">
                  <span className={modalChipClassName}>{selectedPostcard.placeName || text.exploreUnknownPlace}</span>
                  {selectedPostcard.uploaderName ? <span className={modalChipClassName}>{text.exploreUploaderBy(selectedPostcard.uploaderName)}</span> : null}
                  <span className={modalChipClassName}>{new Date(selectedPostcard.createdAt).toLocaleDateString(text.dateLocale)}</span>
                </div>
              </div>
            ) : null}

            <div className="relative z-10 flex flex-wrap gap-1.5">
              <span className={modalChipClassName}>👍 {selectedPostcard.likeCount}</span>
              <span className={modalChipClassName}>👎 {selectedPostcard.dislikeCount}</span>
              <span className={modalChipClassName}>⚠️ {selectedPostcard.wrongLocationReports}</span>
              <span className={modalChipClassName}>{new Date(selectedPostcard.createdAt).toLocaleString(text.dateLocale)}</span>
            </div>

            <div className="relative z-10 grid gap-1.5 rounded-[14px] border border-[#d8e8d9] bg-[linear-gradient(145deg,#f2fff5,#edf7ff)] p-2.5">
              <div className="flex items-center gap-2 max-[560px]:flex-wrap">
                <small className={`${smallMutedClassName} min-w-0 break-all`}>
                  {typeof selectedPostcard.latitude === 'number' && typeof selectedPostcard.longitude === 'number'
                    ? `${selectedPostcard.latitude.toFixed(6)}, ${selectedPostcard.longitude.toFixed(6)}`
                    : text.exploreNoCoordinates}
                </small>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    className={`${modalActionButtonClassName} h-10 w-10 px-0 py-0 text-[1.05rem]`}
                    onClick={() => void copyCoordinates(selectedPostcard)}
                    aria-label={text.exploreCopyCoordinates}
                    title={text.exploreCopyCoordinates}
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    className={modalActionButtonClassName}
                    onClick={() => void copyShareLink(selectedPostcard)}
                  >
                    {text.exploreSharePostcard}
                  </button>
                </div>
              </div>
              {copyStatus ? <small className={smallMutedClassName}>{copyStatus}</small> : null}
              {shareStatus ? <small className={smallMutedClassName}>{shareStatus}</small> : null}
            </div>

            {selectedPostcard.notes ? (
              <p className="relative z-10 m-0 rounded-[14px] border border-[#dbe9dc] bg-[linear-gradient(160deg,#f9fffb,#f2fbf5)] px-3 py-2.5 text-[0.91rem] leading-relaxed text-[#355347] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                {selectedPostcard.notes}
              </p>
            ) : null}

            <div className="relative z-10 grid gap-1.5 min-[520px]:grid-cols-3">
              {!isAuthenticated ? (
                <button
                  type="button"
                  className={`${modalActionButtonClassName} min-[520px]:col-span-3`}
                  onClick={onSignIn}
                >
                  {text.buttonSignInGoogle}
                </button>
              ) : null}
              <button
                type="button"
                className={
                  selectedPostcard.viewerFeedback?.liked
                    ? `${modalActionButtonClassName} ring-2 ring-[rgba(47,158,88,0.35)]`
                    : modalActionButtonClassName
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
                    ? `${modalActionButtonClassName} ring-2 ring-[rgba(47,158,88,0.35)]`
                    : modalActionButtonClassName
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
                className={modalActionWarnButtonClassName}
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
