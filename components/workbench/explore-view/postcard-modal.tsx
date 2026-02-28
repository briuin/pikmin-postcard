import { useEffect, useState } from 'react';
import Image from 'next/image';
import { isAiDetected } from '@/components/workbench/explore-view/helpers';
import {
  cardThumbClassName,
  modalActionButtonClassName,
  modalActionWarnButtonClassName,
  modalChipClassName,
  postcardItemHeadClassName,
  smallMutedClassName
} from '@/components/workbench/explore-view/styles';
import type { ExplorePostcardModalProps } from '@/components/workbench/explore-view/types';
import { getPostcardTypeLabel } from '@/lib/postcard-type-label';

export function ExplorePostcardModal({
  text,
  isAuthenticated,
  postcard,
  feedbackPendingKey,
  onClose,
  onSubmitFeedback,
  onCopyCoordinates,
  onCopyShareLink,
  onSignIn
}: ExplorePostcardModalProps) {
  const [isReportFormOpen, setIsReportFormOpen] = useState(false);
  const [reportReason, setReportReason] = useState<'wrong_location' | 'spam' | 'illegal_image' | 'other'>(
    'wrong_location'
  );
  const [reportDescription, setReportDescription] = useState('');
  const reportPending = feedbackPendingKey === `${postcard.id}:report`;

  useEffect(() => {
    setIsReportFormOpen(false);
    setReportReason('wrong_location');
    setReportDescription('');
  }, [postcard.id]);

  return (
    <div
      className="fixed inset-0 z-[1200] grid place-items-center bg-[radial-gradient(circle_at_16%_8%,rgba(244,199,66,0.26),transparent_38%),radial-gradient(circle_at_86%_18%,rgba(78,142,247,0.22),transparent_40%),rgba(14,28,22,0.58)] p-3 backdrop-blur-[2px] max-[780px]:place-items-end max-[780px]:p-0"
      onClick={onClose}
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
            <div className="flex min-w-0 items-start gap-1.5">
              {isAiDetected(postcard) ? (
                <span className="inline-flex shrink-0 items-center rounded-full border border-[#c6d9ff] bg-[#e9f1ff] px-1.5 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.06em] text-[#365da6]">
                  AI
                </span>
              ) : null}
              <strong className="min-w-0 [overflow-wrap:anywhere] text-[1.1rem] leading-tight text-[#1a3428] max-[580px]:text-[1rem]">
                {postcard.title}
              </strong>
            </div>
          </div>
          <button
            type="button"
            className="h-8 w-8 shrink-0 rounded-full border border-[#d2e4d2] bg-white/90 text-[1rem] font-bold leading-none text-[#325445] shadow-[0_4px_10px_rgba(40,73,57,0.12)]"
            onClick={onClose}
            aria-label={text.buttonCancel}
            title={text.buttonCancel}
          >
            ×
          </button>
        </div>

        {postcard.imageUrl ? (
          <div className="relative z-10 grid gap-2 rounded-[18px] border border-[#d9e9dd] bg-[#f8fffb] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <Image
              className={cardThumbClassName}
              src={postcard.imageUrl}
              alt={postcard.title}
              width={960}
              height={680}
            />
            <div className="flex flex-wrap gap-1.5">
              <span className={modalChipClassName}>
                {text.fieldPostcardType}: {getPostcardTypeLabel(postcard.postcardType, text)}
              </span>
              <span className={modalChipClassName}>{postcard.placeName || text.exploreUnknownPlace}</span>
              {postcard.uploaderName ? (
                <span className={modalChipClassName}>{text.exploreUploaderBy(postcard.uploaderName)}</span>
              ) : null}
              <span className={modalChipClassName}>
                {new Date(postcard.createdAt).toLocaleDateString(text.dateLocale)}
              </span>
            </div>
          </div>
        ) : null}

        <div className="relative z-10 flex flex-wrap gap-1.5">
          <span className={modalChipClassName}>👍 {postcard.likeCount}</span>
          <span className={modalChipClassName}>👎 {postcard.dislikeCount}</span>
          <span className={modalChipClassName}>⚠️ {postcard.wrongLocationReports}</span>
          <span className={modalChipClassName}>
            {new Date(postcard.createdAt).toLocaleString(text.dateLocale)}
          </span>
        </div>

        <div className="relative z-10 grid gap-1.5 rounded-[14px] border border-[#d8e8d9] bg-[linear-gradient(145deg,#f2fff5,#edf7ff)] p-2.5">
          <div className="flex items-center gap-2 max-[560px]:flex-wrap">
            <small className={`${smallMutedClassName} min-w-0 break-all`}>
              {typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number'
                ? `${postcard.latitude.toFixed(6)}, ${postcard.longitude.toFixed(6)}`
                : text.exploreNoCoordinates}
            </small>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                className={`${modalActionButtonClassName} h-10 w-10 px-0 py-0 text-[1.05rem]`}
                onClick={() => void onCopyCoordinates(postcard)}
                aria-label={text.exploreCopyCoordinates}
                title={text.exploreCopyCoordinates}
              >
                ⧉
              </button>
              <button
                type="button"
                className={modalActionButtonClassName}
                onClick={() => void onCopyShareLink(postcard)}
              >
                {text.exploreSharePostcard}
              </button>
            </div>
          </div>
        </div>

        {postcard.notes ? (
          <p className="relative z-10 m-0 rounded-[14px] border border-[#dbe9dc] bg-[linear-gradient(160deg,#f9fffb,#f2fbf5)] px-3 py-2.5 text-[0.91rem] leading-relaxed text-[#355347] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            {postcard.notes}
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
              postcard.viewerFeedback?.liked
                ? `${modalActionButtonClassName} ring-2 ring-[rgba(47,158,88,0.35)]`
                : modalActionButtonClassName
            }
            onClick={() => onSubmitFeedback(postcard.id, 'like')}
            disabled={!isAuthenticated || feedbackPendingKey === `${postcard.id}:like`}
          >
            {!isAuthenticated
              ? text.exploreVoteUp
              : postcard.viewerFeedback?.liked
                ? text.exploreVoteUpCancel
                : feedbackPendingKey === `${postcard.id}:like`
                  ? '...'
                  : text.exploreVoteUp}
          </button>
          <button
            type="button"
            className={
              postcard.viewerFeedback?.disliked
                ? `${modalActionButtonClassName} ring-2 ring-[rgba(47,158,88,0.35)]`
                : modalActionButtonClassName
            }
            onClick={() => onSubmitFeedback(postcard.id, 'dislike')}
            disabled={!isAuthenticated || feedbackPendingKey === `${postcard.id}:dislike`}
          >
            {!isAuthenticated
              ? text.exploreVoteDown
              : postcard.viewerFeedback?.disliked
                ? text.exploreVoteDownCancel
                : feedbackPendingKey === `${postcard.id}:dislike`
                  ? '...'
                  : text.exploreVoteDown}
          </button>
          <button
            type="button"
            className={modalActionWarnButtonClassName}
            onClick={() => setIsReportFormOpen((current) => !current)}
            disabled={
              !isAuthenticated ||
              postcard.viewerFeedback?.reportedWrongLocation === true ||
              reportPending
            }
          >
            {!isAuthenticated
              ? text.exploreReportOpen
              : postcard.viewerFeedback?.reportedWrongLocation
                ? text.exploreVoteDone
                : reportPending
                  ? '...'
                  : text.exploreReportOpen}
          </button>
        </div>

        {isAuthenticated && isReportFormOpen && !postcard.viewerFeedback?.reportedWrongLocation ? (
          <div className="relative z-10 grid gap-2 rounded-[14px] border border-[#f0d8c3] bg-[linear-gradient(160deg,#fff8f2,#fff3e8)] p-2.5">
            <label className="grid gap-1 text-[0.82rem] font-bold text-[#6d4a2f]">
              {text.exploreReportReasonLabel}
              <select
                className="rounded-[10px] border border-[#f1d7bf] bg-white px-2 py-1.5 text-[0.86rem] text-[#5b3d27]"
                value={reportReason}
                onChange={(event) =>
                  setReportReason(
                    event.target.value as 'wrong_location' | 'spam' | 'illegal_image' | 'other'
                  )
                }
              >
                <option value="wrong_location">{text.exploreReportReasonWrongLocation}</option>
                <option value="spam">{text.exploreReportReasonSpam}</option>
                <option value="illegal_image">{text.exploreReportReasonIllegalImage}</option>
                <option value="other">{text.exploreReportReasonOther}</option>
              </select>
            </label>
            <label className="grid gap-1 text-[0.82rem] font-bold text-[#6d4a2f]">
              {text.exploreReportDescriptionLabel}
              <textarea
                rows={3}
                className="rounded-[10px] border border-[#f1d7bf] bg-white px-2 py-1.5 text-[0.86rem] text-[#5b3d27]"
                placeholder={text.exploreReportDescriptionPlaceholder}
                value={reportDescription}
                onChange={(event) => setReportDescription(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className={modalActionWarnButtonClassName}
                onClick={() => {
                  onSubmitFeedback(postcard.id, 'report', {
                    reason: reportReason,
                    description: reportDescription
                  });
                  setIsReportFormOpen(false);
                }}
                disabled={reportPending}
              >
                {reportPending ? text.exploreReportSubmitting : text.exploreReportSubmit}
              </button>
              <button
                type="button"
                className={modalActionButtonClassName}
                onClick={() => setIsReportFormOpen(false)}
                disabled={reportPending}
              >
                {text.buttonCancel}
              </button>
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}
