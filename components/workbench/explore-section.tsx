'use client';

import Image from 'next/image';
import { type ReactNode } from 'react';
import type { WorkbenchText } from '@/lib/i18n';
import type { ExploreSort, PostcardRecord } from '@/components/workbench/types';

type ExploreSectionProps = {
  text: WorkbenchText;
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
  onFocusMarker: (id: string) => void;
  onSubmitFeedback: (postcardId: string, action: 'like' | 'dislike' | 'report_wrong_location') => void;
  mapNode: ReactNode;
};

export function ExploreSection({
  text,
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
  onFocusMarker,
  onSubmitFeedback,
  mapNode
}: ExploreSectionProps) {
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
    'grid min-h-0 gap-2 overflow-auto pr-1 max-[1080px]:max-h-none max-[1080px]:overflow-visible max-[1080px]:pr-0';
  const smallMutedClassName = 'text-[0.82rem] text-[#5f736c]';
  const actionButtonClassName =
    'rounded-[10px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-2.5 py-1.5 text-[0.83rem] font-bold text-white shadow-[0_4px_10px_rgba(47,158,88,0.18)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';
  const actionButtonWarnClassName =
    'rounded-[10px] bg-[linear-gradient(135deg,#f4c742,#e5a634)] px-2.5 py-1.5 text-[0.83rem] font-bold text-[#25361f] shadow-[0_4px_10px_rgba(229,166,52,0.25)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';
  const cardThumbClassName = 'h-auto max-h-[160px] w-full rounded-[10px] border border-[#deeadb] object-cover';

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
            const hasMapPoint = typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number';
            const cardClassName = [
              postcardItemClassName,
              focusedMarkerId === postcard.id ? 'border-[#7ecb95] ring-2 ring-[rgba(86,179,106,0.2)]' : '',
              hasMapPoint ? 'cursor-pointer hover:border-[#95d7a7] hover:ring-2 hover:ring-[rgba(86,179,106,0.16)] focus-visible:outline-2 focus-visible:outline-[rgba(86,179,106,0.45)] focus-visible:outline-offset-2' : ''
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <article
                key={postcard.id}
                className={cardClassName}
                onClick={() => {
                  if (hasMapPoint) {
                    onFocusMarker(postcard.id);
                  }
                }}
                onKeyDown={(event) => {
                  if (!hasMapPoint) {
                    return;
                  }
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onFocusMarker(postcard.id);
                  }
                }}
                role={hasMapPoint ? 'button' : undefined}
                tabIndex={hasMapPoint ? 0 : undefined}
                aria-label={hasMapPoint ? text.exploreFocusOnMapAria(postcard.title) : undefined}
              >
                {postcard.imageUrl ? (
                  <Image
                    className={cardThumbClassName}
                    src={postcard.imageUrl}
                    alt={postcard.title}
                    width={640}
                    height={420}
                  />
                ) : null}
                <div className={postcardItemHeadClassName}>
                  <strong>{postcard.title}</strong>
                  <small className={smallMutedClassName}>{new Date(postcard.createdAt).toLocaleDateString(text.dateLocale)}</small>
                </div>
                <small className={smallMutedClassName}>{postcard.placeName || text.exploreUnknownPlace}</small>
                {postcard.uploaderMasked ? <small className={smallMutedClassName}>{text.exploreUploaderBy(postcard.uploaderMasked)}</small> : null}
                <small className={smallMutedClassName}>
                  👍 {postcard.likeCount} · 👎 {postcard.dislikeCount} · ⚠️ {postcard.wrongLocationReports}
                </small>
                {postcard.notes ? <p className="m-0 line-clamp-2 text-[0.9rem] text-[#436054]">{postcard.notes}</p> : null}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={actionButtonClassName}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSubmitFeedback(postcard.id, 'like');
                    }}
                    disabled={feedbackPendingKey === `${postcard.id}:like`}
                  >
                    {feedbackPendingKey === `${postcard.id}:like` ? '...' : text.exploreVoteUp}
                  </button>
                  <button
                    type="button"
                    className={actionButtonClassName}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSubmitFeedback(postcard.id, 'dislike');
                    }}
                    disabled={feedbackPendingKey === `${postcard.id}:dislike`}
                  >
                    {feedbackPendingKey === `${postcard.id}:dislike` ? '...' : text.exploreVoteDown}
                  </button>
                  <button
                    type="button"
                    className={actionButtonWarnClassName}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSubmitFeedback(postcard.id, 'report_wrong_location');
                    }}
                    disabled={feedbackPendingKey === `${postcard.id}:report_wrong_location`}
                  >
                    {feedbackPendingKey === `${postcard.id}:report_wrong_location` ? '...' : text.exploreFlag}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0 max-[1080px]:order-1">{mapNode}</div>
    </article>
  );
}
