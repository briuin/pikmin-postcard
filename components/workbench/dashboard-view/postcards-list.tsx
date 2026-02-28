'use client';

import { useState } from 'react';
import Image from 'next/image';
import ReactCrop from 'react-image-crop';
import type { WorkbenchText } from '@/lib/i18n';
import { PostcardTypeOptions } from '@/components/workbench/postcard-type-options';
import type { PostcardEditDraft, PostcardRecord } from '@/components/workbench/types';
import type { CropDraft } from '@/components/workbench/utils';
import {
  actionButtonClassName,
  chipRowClassName,
  cropEditorClassName,
  cropImageClassName,
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
  const pendingDeletePostcard = confirmDeletePostcardId
    ? myPostcards.find((item) => item.id === confirmDeletePostcardId) ?? null
    : null;

  return (
    <>
      <h3 className="mt-1">{text.myPostcardsTitle}</h3>
      {isLoadingMine ? <small className={smallMutedClassName}>{text.myPostcardsLoading}</small> : null}
      {!isLoadingMine && myPostcards.length === 0 ? <small className={smallMutedClassName}>{text.myPostcardsEmpty}</small> : null}
      <div className={dashboardListClassName}>
        {myPostcards.slice(0, 20).map((postcard) => (
          <article key={postcard.id} className={postcardItemClassName}>
            <div className={postcardItemHeadClassName}>
              <strong>{postcard.title}</strong>
              <small className={smallMutedClassName}>{new Date(postcard.createdAt).toLocaleDateString(text.dateLocale)}</small>
            </div>
            {postcard.imageUrl ? (
              (() => {
                const imageUrl = postcard.imageUrl as string;
                return (
                  <button
                    type="button"
                    className="cursor-zoom-in rounded-[10px] border-0 bg-transparent p-0"
                    onClick={() => onPreviewImage({ src: imageUrl, alt: postcard.title })}
                  >
                    <Image
                      className="h-auto max-h-[180px] w-full rounded-[10px] border border-[#deeadb] object-cover"
                      src={imageUrl}
                      alt={postcard.title}
                      width={640}
                      height={420}
                    />
                  </button>
                );
              })()
            ) : null}
            <label className={inlineFieldClassName}>
              {text.fieldName}
              <input
                className={inputClassName}
                value={postcardDrafts[postcard.id]?.title ?? ''}
                onChange={(event) => onUpdatePostcardDraft(postcard.id, { title: event.target.value })}
                placeholder={text.fieldName}
                disabled={savingPostcardId === postcard.id || deletingPostcardId === postcard.id}
              />
            </label>
            <label className={inlineFieldClassName}>
              {text.fieldPostcardType}
              <select
                className={inputClassName}
                value={postcardDrafts[postcard.id]?.postcardType ?? 'UNKNOWN'}
                onChange={(event) =>
                  onUpdatePostcardDraft(postcard.id, {
                    postcardType: event.target.value as PostcardRecord['postcardType']
                  })
                }
                disabled={savingPostcardId === postcard.id || deletingPostcardId === postcard.id}
              >
                <PostcardTypeOptions text={text} />
              </select>
            </label>
            <label className={inlineFieldClassName}>
              {text.fieldPlaceName}
              <input
                className={inputClassName}
                value={postcardDrafts[postcard.id]?.placeName ?? ''}
                onChange={(event) => onUpdatePostcardDraft(postcard.id, { placeName: event.target.value })}
                placeholder={text.exploreUnknownPlace}
                disabled={savingPostcardId === postcard.id || deletingPostcardId === postcard.id}
              />
            </label>
            <label className={inlineFieldClassName}>
              {text.fieldDescription}
              <textarea
                className={inputClassName}
                rows={3}
                value={postcardDrafts[postcard.id]?.notes ?? ''}
                onChange={(event) => onUpdatePostcardDraft(postcard.id, { notes: event.target.value })}
                placeholder={text.manualDescriptionPlaceholder}
                disabled={savingPostcardId === postcard.id || deletingPostcardId === postcard.id}
              />
            </label>
            <label className={inlineFieldClassName}>
              {text.fieldLocation}
              <input
                className={inputClassName}
                value={postcardDrafts[postcard.id]?.locationInput ?? ''}
                onChange={(event) => onUpdatePostcardDraft(postcard.id, { locationInput: event.target.value })}
                placeholder={text.manualLocationPlaceholder}
                disabled={savingPostcardId === postcard.id || deletingPostcardId === postcard.id}
              />
            </label>
            <div className={chipRowClassName}>
              <button
                type="button"
                className={actionButtonClassName}
                onClick={() => onSavePostcard(postcard)}
                disabled={savingPostcardId === postcard.id || deletingPostcardId === postcard.id}
              >
                {savingPostcardId === postcard.id ? text.buttonSavingChanges : text.buttonSaveChanges}
              </button>
              <button
                type="button"
                className={actionButtonClassName}
                onClick={() => onOpenCropEditor(postcard)}
                disabled={
                  savingCropPostcardId === postcard.id ||
                  deletingPostcardId === postcard.id ||
                  savingPostcardId === postcard.id
                }
              >
                {editingCropPostcardId === postcard.id ? text.buttonEditingCrop : text.buttonEditCrop}
              </button>
              <button
                type="button"
                className={actionButtonClassName}
                onClick={() => setConfirmDeletePostcardId(postcard.id)}
                disabled={
                  deletingPostcardId === postcard.id ||
                  savingCropPostcardId === postcard.id ||
                  savingPostcardId === postcard.id
                }
              >
                {deletingPostcardId === postcard.id ? text.buttonRemoving : text.buttonRemoveSoftDelete}
              </button>
            </div>
            {editingCropPostcardId === postcard.id && editingCropOriginalUrl ? (
              <div className={cropEditorClassName}>
                <strong>{text.cropEditorTitle}</strong>
                <small className={smallMutedClassName}>{text.cropEditorBody}</small>
                <div className={cropPreviewClassName}>
                  <ReactCrop
                    crop={cropDraft}
                    onChange={(_, percentCrop) => onCropChange(percentCrop)}
                    ruleOfThirds
                    keepSelection
                    className="block w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={editingCropOriginalUrl} alt={text.cropEditorImageAlt} className={cropImageClassName} />
                  </ReactCrop>
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
                    onClick={() => onSaveCrop(postcard.id)}
                    disabled={savingCropPostcardId === postcard.id}
                  >
                    {savingCropPostcardId === postcard.id ? text.buttonSavingCrop : text.buttonSaveCrop}
                  </button>
                  <button
                    type="button"
                    className={actionButtonClassName}
                    onClick={onCloseCropEditor}
                    disabled={savingCropPostcardId === postcard.id}
                  >
                    {text.buttonCancel}
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>

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
