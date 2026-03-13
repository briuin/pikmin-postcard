'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import ReactCrop from 'react-image-crop';
import { useBodyScrollLock } from '@/components/use-body-scroll-lock';
import type { WorkbenchText } from '@/lib/i18n';
import { DashboardLoadMoreFooter } from '@/components/workbench/dashboard-view/load-more-footer';
import { PostcardTypeOptions } from '@/components/workbench/postcard-type-options';
import type { PostcardEditDraft, PostcardRecord } from '@/components/workbench/types';
import type { CropDraft } from '@/components/workbench/utils';
import {
  actionButtonClassName,
  chipRowClassName,
  cropPreviewClassName,
  inlineFieldClassName,
  inputClassName,
  postcardItemClassName,
  postcardItemHeadClassName,
  smallMutedClassName
} from '@/components/workbench/dashboard-view/styles';
import type { PreviewImage } from '@/components/workbench/dashboard-view/types';

type DashboardPostcardsListProps = {
  text: WorkbenchText;
  myPostcards: PostcardRecord[];
  postcardDrafts: Record<string, PostcardEditDraft>;
  savingPostcardId: string | null;
  deletingPostcardId: string | null;
  editingCropPostcardId: string | null;
  editingCropOriginalUrl: string | null;
  cropDraft: CropDraft;
  savingCropPostcardId: string | null;
  isLoadingMine: boolean;
  dashboardViewMode: 'grid' | 'list';
  dashboardListClassName: string;
  onUpdatePostcardDraft: (postcardId: string, patch: Partial<PostcardEditDraft>) => void;
  onSavePostcard: (postcard: PostcardRecord) => void;
  onOpenCropEditor: (postcard: PostcardRecord) => void;
  onSaveCrop: (postcardId: string) => void;
  onCloseCropEditor: () => void;
  onSoftDelete: (postcard: PostcardRecord) => void;
  onCropChange: (crop: import('react-image-crop').PercentCrop) => void;
  onPreviewImage: (image: PreviewImage) => void;
};

function SummaryStat({
  label,
  value,
  icon
}: {
  label: string;
  value: number;
  icon: 'heart' | 'flag';
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[#d8e7d8] bg-white/92 px-2 py-1 text-[0.76rem] font-bold text-[#446455]"
      aria-label={`${label}: ${value}`}
      title={`${label}: ${value}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className={`h-3.5 w-3.5 ${icon === 'heart' ? 'text-[#c85f6a]' : 'text-[#d08845]'}`}
        fill="currentColor"
      >
        {icon === 'heart' ? (
          <path d="M8 13.2 2.9 8.4A3.4 3.4 0 0 1 7.7 3.7L8 4l.3-.3a3.4 3.4 0 1 1 4.8 4.8L8 13.2Z" />
        ) : (
          <path d="M4 1.7A.7.7 0 0 1 4.7 1h5.6l-.9 2 1 2H4.7v9.3a.7.7 0 1 1-1.4 0V1.7A.7.7 0 0 1 4 1.7Z" />
        )}
      </svg>
      <span>{value}</span>
    </span>
  );
}

function resolvePostcardLocationStatusLabel(text: WorkbenchText, locationStatus: PostcardRecord['locationStatus']) {
  if (locationStatus === 'USER_CONFIRMED') {
    return text.myPostcardsLocationConfirmed;
  }
  if (locationStatus === 'MANUAL') {
    return text.myPostcardsLocationManual;
  }
  return text.myPostcardsLocationAuto;
}

function resolvePostcardLocationSummary(text: WorkbenchText, postcard: PostcardRecord) {
  const parts = [postcard.placeName, postcard.city, postcard.state, postcard.country]
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 0);
  return parts.length > 0 ? parts.join(', ') : null;
}

function resolvePostcardCoordinateSummary(text: WorkbenchText, postcard: PostcardRecord) {
  if (!Number.isFinite(postcard.latitude) || !Number.isFinite(postcard.longitude)) {
    return null;
  }
  return text.myPostcardsCoordinates(postcard.latitude as number, postcard.longitude as number);
}

export function DashboardPostcardsList({
  text,
  myPostcards,
  postcardDrafts,
  savingPostcardId,
  deletingPostcardId,
  editingCropPostcardId,
  editingCropOriginalUrl,
  cropDraft,
  savingCropPostcardId,
  isLoadingMine,
  dashboardViewMode,
  dashboardListClassName,
  onUpdatePostcardDraft,
  onSavePostcard,
  onOpenCropEditor,
  onSaveCrop,
  onCloseCropEditor,
  onSoftDelete,
  onCropChange,
  onPreviewImage
}: DashboardPostcardsListProps) {
  const [confirmDeletePostcardId, setConfirmDeletePostcardId] = useState<string | null>(null);
  const [editingPostcardId, setEditingPostcardId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const [cropViewportSize, setCropViewportSize] = useState<{ width: number; height: number } | null>(null);
  const [cropImageSize, setCropImageSize] = useState<{ width: number; height: number } | null>(null);
  const cropViewportRef = useRef<HTMLDivElement | null>(null);
  const pendingDeletePostcard = confirmDeletePostcardId
    ? myPostcards.find((item) => item.id === confirmDeletePostcardId) ?? null
    : null;
  const editingPostcard = editingPostcardId
    ? myPostcards.find((item) => item.id === editingPostcardId) ?? null
    : null;
  const isListMode = dashboardViewMode === 'list';
  const isCropModalOpen = Boolean(
    editingPostcard && editingCropPostcardId === editingPostcard.id && editingCropOriginalUrl
  );

  useBodyScrollLock(Boolean(editingPostcard || pendingDeletePostcard || isCropModalOpen));

  useEffect(() => {
    setVisibleCount((current) => {
      if (myPostcards.length === 0) {
        return 20;
      }
      return Math.min(Math.max(current, 20), myPostcards.length);
    });
  }, [myPostcards.length]);

  useEffect(() => {
    setEditingPostcardId((current) =>
      current && myPostcards.some((item) => item.id === current) ? current : null
    );
  }, [myPostcards]);

  useEffect(() => {
    if (!editingPostcard && editingCropPostcardId) {
      onCloseCropEditor();
    }
  }, [editingCropPostcardId, editingPostcard, onCloseCropEditor]);

  useEffect(() => {
    if (!isCropModalOpen || !cropViewportRef.current) {
      setCropViewportSize(null);
      return;
    }

    const node = cropViewportRef.current;

    const updateViewportSize = () => {
      const next = { width: node.clientWidth, height: node.clientHeight };
      setCropViewportSize((current) =>
        current && current.width === next.width && current.height === next.height ? current : next
      );
    };

    updateViewportSize();

    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, [isCropModalOpen]);

  useEffect(() => {
    if (!isCropModalOpen || !editingCropOriginalUrl) {
      setCropImageSize(null);
      return;
    }

    let isCancelled = false;
    const image = new window.Image();

    image.onload = () => {
      if (isCancelled) {
        return;
      }
      setCropImageSize({
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    };

    image.onerror = () => {
      if (!isCancelled) {
        setCropImageSize(null);
      }
    };

    image.src = editingCropOriginalUrl;

    return () => {
      isCancelled = true;
    };
  }, [editingCropOriginalUrl, isCropModalOpen]);

  const visiblePostcards = myPostcards.slice(0, visibleCount);
  const cropCanvasSize =
    cropViewportSize && cropImageSize && cropViewportSize.width > 0 && cropViewportSize.height > 0
      ? (() => {
          const scale = Math.min(
            cropViewportSize.width / cropImageSize.width,
            cropViewportSize.height / cropImageSize.height
          );

          return {
            width: Math.max(1, Math.floor(cropImageSize.width * scale)),
            height: Math.max(1, Math.floor(cropImageSize.height * scale))
          };
        })()
      : null;

  function closeEditModal() {
    if (editingCropPostcardId) {
      onCloseCropEditor();
    }
    setEditingPostcardId(null);
  }

  return (
    <>
      <h3 className="mt-1">{text.myPostcardsTitle}</h3>
      {isLoadingMine ? <small className={smallMutedClassName}>{text.myPostcardsLoading}</small> : null}
      {!isLoadingMine && myPostcards.length === 0 ? <small className={smallMutedClassName}>{text.myPostcardsEmpty}</small> : null}
      <div className={dashboardListClassName}>
        {visiblePostcards.map((postcard) => {
          const locationSummary = resolvePostcardLocationSummary(text, postcard);
          const coordinateSummary = resolvePostcardCoordinateSummary(text, postcard);
          const locationDisplay = locationSummary ?? coordinateSummary;

          return (
            <article
              key={postcard.id}
              className={`${postcardItemClassName} overflow-hidden rounded-[18px] border-[#dcead8] bg-[linear-gradient(165deg,rgba(255,255,255,0.98),rgba(246,255,247,0.95))] px-0 py-0 shadow-[0_12px_24px_rgba(53,79,63,0.08)] ${
                isListMode && postcard.imageUrl
                  ? 'grid items-start grid-cols-[220px_minmax(0,1fr)] max-[780px]:grid-cols-[180px_minmax(0,1fr)] max-[560px]:grid-cols-[132px_minmax(0,1fr)]'
                  : 'grid'
              }`}
            >
              {postcard.imageUrl ? (
                (() => {
                  const imageUrl = postcard.imageUrl as string;
                  return (
                    <button
                      type="button"
                      className={`relative block cursor-zoom-in border-0 bg-transparent p-0 text-left ${
                        isListMode ? 'self-start' : ''
                      }`}
                      onClick={() => onPreviewImage({ src: imageUrl, alt: postcard.title })}
                    >
                      <Image
                        className={
                          isListMode
                            ? 'aspect-[16/10] h-auto w-full object-cover'
                            : 'h-[210px] w-full object-cover'
                        }
                        src={imageUrl}
                        alt={postcard.title}
                        width={640}
                        height={420}
                      />
                      <span className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-white/70 bg-[rgba(20,38,28,0.68)] px-3 py-1 text-[0.74rem] font-bold text-white shadow-[0_10px_18px_rgba(15,28,21,0.2)] max-[560px]:hidden">
                        {text.myPostcardsQuickPreview}
                      </span>
                    </button>
                  );
                })()
              ) : null}

              <div className="grid gap-3 px-3.5 py-3">
                <div className={postcardItemHeadClassName}>
                  <div className="grid min-w-0 gap-1">
                    <strong className="truncate text-[1rem] text-[#214233]">{postcard.title}</strong>
                    <small className={smallMutedClassName}>
                      {new Date(postcard.createdAt).toLocaleDateString(text.dateLocale)}
                    </small>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    <span className="rounded-full border border-[#d8e7d8] bg-white px-2.5 py-1 text-[0.72rem] font-bold text-[#315445]">
                      {postcard.postcardType}
                    </span>
                    <span className="rounded-full border border-[#cfe5cd] bg-[#f1fff0] px-2.5 py-1 text-[0.72rem] font-bold text-[#2f7a44]">
                      {resolvePostcardLocationStatusLabel(text, postcard.locationStatus)}
                    </span>
                  </div>
                </div>

                <div className="grid gap-2 rounded-[16px] border border-[#dfeadf] bg-[rgba(248,252,248,0.92)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {locationDisplay ? (
                      <div className="min-w-0 flex-1">
                        {locationSummary ? (
                          <strong className="text-[0.95rem] text-[#274736]">{locationSummary}</strong>
                        ) : (
                          <code className="rounded-[10px] bg-white/92 px-2 py-1 text-[0.8rem] font-semibold text-[#295240]">
                            {coordinateSummary}
                          </code>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1" />
                    )}
                    <div className="flex items-center gap-1.5">
                      <SummaryStat label={text.myPostcardsLikesLabel} value={postcard.likeCount} icon="heart" />
                      <SummaryStat
                        label={text.myPostcardsReportsLabel}
                        value={postcard.wrongLocationReports}
                        icon="flag"
                      />
                    </div>
                  </div>
                  {locationSummary && coordinateSummary ? (
                    <code className="w-fit rounded-[10px] bg-white/92 px-2.5 py-1.5 text-[0.8rem] font-semibold text-[#295240]">
                      {coordinateSummary}
                    </code>
                  ) : null}
                  {postcard.locationStatus === 'AUTO' && postcard.aiPlaceGuess ? (
                    <small className={smallMutedClassName}>
                      {text.myPostcardsAiHint(
                        postcard.aiPlaceGuess,
                        postcard.aiConfidence ? Math.round(postcard.aiConfidence * 100) : null
                      )}
                    </small>
                  ) : null}
                </div>

                <div className={chipRowClassName}>
                  <button
                    type="button"
                    className={actionButtonClassName}
                    onClick={() => setEditingPostcardId(postcard.id)}
                    disabled={deletingPostcardId === postcard.id}
                  >
                    {text.myPostcardsOpenEditor}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!isLoadingMine ? (
        <DashboardLoadMoreFooter
          text={text}
          visibleCount={visibleCount}
          totalCount={myPostcards.length}
          onLoadMore={() => setVisibleCount((current) => current + 20)}
        />
      ) : null}

      {editingPostcard ? (
        <div
          className="fixed inset-0 z-[1300] grid place-items-center bg-[rgba(16,28,22,0.64)] px-3 py-4"
          onClick={closeEditModal}
        >
          <article
            className="grid w-full max-w-[920px] gap-4 rounded-[20px] border border-[#dcead8] bg-[#fbfffb] p-4 shadow-[0_18px_36px_rgba(20,42,30,0.24)] max-[720px]:p-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <strong className="text-[1.08rem] text-[#1f3a2d]">{text.myPostcardsEditorTitle}</strong>
                <small className={smallMutedClassName}>{editingPostcard.title}</small>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d5e6d4] bg-white text-[1.3rem] leading-none text-[#406351]"
                onClick={closeEditModal}
                aria-label={text.buttonCancel}
                title={text.buttonCancel}
              >
                ×
              </button>
            </div>

            <div className={`grid gap-4 ${editingPostcard.imageUrl ? 'min-[860px]:grid-cols-[280px_minmax(0,1fr)]' : ''}`}>
              {editingPostcard.imageUrl ? (
                <button
                  type="button"
                  className="relative block cursor-zoom-in overflow-hidden rounded-[18px] border border-[#deeadb] bg-transparent p-0 text-left"
                  onClick={() => onPreviewImage({ src: editingPostcard.imageUrl as string, alt: editingPostcard.title })}
                >
                  <Image
                    className="aspect-[16/10] h-auto w-full object-cover"
                    src={editingPostcard.imageUrl as string}
                    alt={editingPostcard.title}
                    width={800}
                    height={500}
                  />
                </button>
              ) : null}

              <div className="grid gap-3">
                <small className={smallMutedClassName}>{text.myPostcardsEditorBody}</small>

                <label className={inlineFieldClassName}>
                  {text.fieldName}
                  <input
                    className={inputClassName}
                    value={postcardDrafts[editingPostcard.id]?.title ?? ''}
                    onChange={(event) => onUpdatePostcardDraft(editingPostcard.id, { title: event.target.value })}
                    placeholder={text.fieldName}
                    disabled={savingPostcardId === editingPostcard.id || deletingPostcardId === editingPostcard.id}
                  />
                </label>
                <label className={inlineFieldClassName}>
                  {text.fieldPostcardType}
                  <select
                    className={inputClassName}
                    value={postcardDrafts[editingPostcard.id]?.postcardType ?? 'UNKNOWN'}
                    onChange={(event) =>
                      onUpdatePostcardDraft(editingPostcard.id, {
                        postcardType: event.target.value as PostcardRecord['postcardType']
                      })
                    }
                    disabled={savingPostcardId === editingPostcard.id || deletingPostcardId === editingPostcard.id}
                  >
                    <PostcardTypeOptions text={text} />
                  </select>
                </label>
                <div className="grid gap-1.5">
                  <input
                    className={inputClassName}
                    aria-label={text.fieldPlaceName}
                    value={postcardDrafts[editingPostcard.id]?.placeName ?? ''}
                    onChange={(event) => onUpdatePostcardDraft(editingPostcard.id, { placeName: event.target.value })}
                    placeholder={text.exploreUnknownPlace}
                    disabled={savingPostcardId === editingPostcard.id || deletingPostcardId === editingPostcard.id}
                  />
                </div>
                <label className={inlineFieldClassName}>
                  {text.fieldDescription}
                  <textarea
                    className={inputClassName}
                    rows={4}
                    value={postcardDrafts[editingPostcard.id]?.notes ?? ''}
                    onChange={(event) => onUpdatePostcardDraft(editingPostcard.id, { notes: event.target.value })}
                    placeholder={text.manualDescriptionPlaceholder}
                    disabled={savingPostcardId === editingPostcard.id || deletingPostcardId === editingPostcard.id}
                  />
                </label>
                <div className="grid gap-1.5">
                  <input
                    className={inputClassName}
                    aria-label={text.fieldLocation}
                    value={postcardDrafts[editingPostcard.id]?.locationInput ?? ''}
                    onChange={(event) => onUpdatePostcardDraft(editingPostcard.id, { locationInput: event.target.value })}
                    placeholder={text.manualLocationPlaceholder}
                    disabled={savingPostcardId === editingPostcard.id || deletingPostcardId === editingPostcard.id}
                  />
                </div>

                <div className={chipRowClassName}>
                  <button
                    type="button"
                    className={actionButtonClassName}
                    onClick={() => onSavePostcard(editingPostcard)}
                    disabled={savingPostcardId === editingPostcard.id || deletingPostcardId === editingPostcard.id}
                  >
                    {savingPostcardId === editingPostcard.id ? text.buttonSavingChanges : text.buttonSaveChanges}
                  </button>
                  <button
                    type="button"
                    className={actionButtonClassName}
                    onClick={() => onOpenCropEditor(editingPostcard)}
                    disabled={
                      savingCropPostcardId === editingPostcard.id ||
                      deletingPostcardId === editingPostcard.id ||
                      savingPostcardId === editingPostcard.id
                    }
                  >
                    {editingCropPostcardId === editingPostcard.id ? text.buttonEditingCrop : text.buttonEditCrop}
                  </button>
                  <button
                    type="button"
                    className={actionButtonClassName}
                    onClick={() => setConfirmDeletePostcardId(editingPostcard.id)}
                    disabled={
                      deletingPostcardId === editingPostcard.id ||
                      savingCropPostcardId === editingPostcard.id ||
                      savingPostcardId === editingPostcard.id
                    }
                  >
                    {deletingPostcardId === editingPostcard.id ? text.buttonRemoving : text.buttonRemoveSoftDelete}
                  </button>
                  <button
                    type="button"
                    className={actionButtonClassName}
                    onClick={closeEditModal}
                    disabled={savingPostcardId === editingPostcard.id || savingCropPostcardId === editingPostcard.id}
                  >
                    {text.buttonCancel}
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      ) : null}

      {isCropModalOpen && editingPostcard && editingCropOriginalUrl ? (
        <div
          className="fixed inset-0 z-[1350] grid place-items-center bg-[rgba(16,24,20,0.78)] px-3 py-4"
          onClick={onCloseCropEditor}
        >
          <article
            className="grid max-h-[92vh] w-full max-w-[980px] grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] gap-3 overflow-hidden rounded-[20px] border border-[#dcead8] bg-[#fbfffb] p-4 shadow-[0_18px_36px_rgba(20,42,30,0.28)] max-[720px]:p-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <strong className="text-[1.08rem] text-[#1f3a2d]">{text.cropEditorTitle}</strong>
                <small className={smallMutedClassName}>{editingPostcard.title}</small>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d5e6d4] bg-white text-[1.3rem] leading-none text-[#406351]"
                onClick={onCloseCropEditor}
                aria-label={text.buttonCancel}
                title={text.buttonCancel}
              >
                ×
              </button>
            </div>

            <small className={smallMutedClassName}>{text.cropEditorBody}</small>
            <div className="grid h-[min(58vh,640px)] min-h-[280px] min-w-0 place-items-center overflow-hidden rounded-[14px] border border-[#d8e7d8] bg-[#edf4ed] p-2 max-[720px]:h-[min(48vh,440px)]">
              <div
                ref={cropViewportRef}
                className={`${cropPreviewClassName} grid h-full w-full min-w-0 place-items-center border-0 bg-transparent`}
              >
                {cropCanvasSize ? (
                  <div
                    className="grid place-items-center overflow-hidden"
                    style={{ width: `${cropCanvasSize.width}px`, height: `${cropCanvasSize.height}px` }}
                  >
                    <ReactCrop
                      crop={cropDraft}
                      onChange={(_, percentCrop) => onCropChange(percentCrop)}
                      ruleOfThirds
                      keepSelection
                      className="block h-full w-full overflow-hidden"
                      style={{ width: '100%', height: '100%' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={editingCropOriginalUrl}
                        alt={text.cropEditorImageAlt}
                        className="block h-full w-full bg-transparent object-contain"
                      />
                    </ReactCrop>
                  </div>
                ) : (
                  <div className="grid place-items-center">
                    <small className={smallMutedClassName}>{text.myPostcardsLoading}</small>
                  </div>
                )}
              </div>
            </div>
            <small className={smallMutedClassName}>
              {text.cropSelection(
                Math.round(cropDraft.x ?? 0),
                Math.round(cropDraft.y ?? 0),
                Math.round(cropDraft.width ?? 0),
                Math.round(cropDraft.height ?? 0)
              )}
            </small>
            <div className={chipRowClassName}>
              <button
                type="button"
                className={actionButtonClassName}
                onClick={() => onSaveCrop(editingPostcard.id)}
                disabled={savingCropPostcardId === editingPostcard.id}
              >
                {savingCropPostcardId === editingPostcard.id ? text.buttonSavingCrop : text.buttonSaveCrop}
              </button>
              <button
                type="button"
                className={actionButtonClassName}
                onClick={onCloseCropEditor}
                disabled={savingCropPostcardId === editingPostcard.id}
              >
                {text.buttonCancel}
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {pendingDeletePostcard ? (
        <div className="fixed inset-0 z-[1300] grid place-items-center bg-[rgba(16,28,22,0.58)] px-3">
          <article className="grid w-full max-w-[420px] gap-2.5 rounded-[16px] border border-[#dcead8] bg-[#fbfffb] p-3.5 shadow-[0_16px_32px_rgba(20,42,30,0.24)]">
            <strong className="text-[1.02rem] text-[#1f3a2d]">{text.removeConfirmTitle}</strong>
            <small className={smallMutedClassName}>{text.removeConfirm(pendingDeletePostcard.title)}</small>
            <div className="flex flex-wrap justify-end gap-1.5">
              <button
                type="button"
                className={actionButtonClassName}
                onClick={() => setConfirmDeletePostcardId(null)}
                disabled={deletingPostcardId === pendingDeletePostcard.id}
              >
                {text.buttonCancel}
              </button>
              <button
                type="button"
                className={actionButtonClassName}
                onClick={() => {
                  if (editingPostcardId === pendingDeletePostcard.id) {
                    closeEditModal();
                  }
                  onSoftDelete(pendingDeletePostcard);
                  setConfirmDeletePostcardId(null);
                }}
                disabled={deletingPostcardId === pendingDeletePostcard.id}
              >
                {deletingPostcardId === pendingDeletePostcard.id
                  ? text.buttonRemoving
                  : text.buttonRemoveSoftDelete}
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </>
  );
}
