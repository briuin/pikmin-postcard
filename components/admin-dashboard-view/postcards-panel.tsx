import Link from 'next/link';
import Image from 'next/image';
import { buildAdminPostcardDraft } from '@/components/admin-dashboard-types';
import { mutedTextClassName } from '@/components/admin-dashboard-view/styles';
import type { AdminPostcardsPanelProps } from '@/components/admin-dashboard-view/types';
import { PostcardTypeOptions } from '@/components/workbench/postcard-type-options';
import type { PostcardType } from '@/components/workbench/types';

function reportReasonLabel(
  text: AdminPostcardsPanelProps['text'],
  reason: string
): string {
  if (reason === 'SPAM') {
    return text.reportReasonSpam;
  }
  if (reason === 'ILLEGAL_IMAGE') {
    return text.reportReasonIllegalImage;
  }
  if (reason === 'OTHER') {
    return text.reportReasonOther;
  }
  return text.reportReasonWrongLocation;
}

function reportStatusLabel(
  text: AdminPostcardsPanelProps['text'],
  status: string | null | undefined
): string {
  if (status === 'IN_PROGRESS') {
    return text.reportStatusInProgress;
  }
  if (status === 'VERIFIED') {
    return text.reportStatusVerified;
  }
  if (status === 'REMOVED') {
    return text.reportStatusRemoved;
  }
  return text.reportStatusPending;
}

export function AdminPostcardsPanel({
  text,
  workbenchText,
  activeTab,
  postcards,
  postcardDrafts,
  setPostcardDrafts,
  isLoadingPostcards,
  savingPostcardId,
  onSavePostcard,
  dateLocale
}: AdminPostcardsPanelProps) {
  return (
    <div className="grid gap-2">
      <strong>{activeTab === 'reported' ? text.reportedTitle : text.postcardsTitle}</strong>
      {isLoadingPostcards ? <small className={mutedTextClassName}>{text.postcardsLoading}</small> : null}
      {!isLoadingPostcards && postcards.length === 0 ? (
        <small className={mutedTextClassName}>
          {activeTab === 'reported' ? text.reportedEmpty : text.postcardsEmpty}
        </small>
      ) : null}

      <div className="grid gap-2 max-[960px]:grid-cols-1 min-[961px]:grid-cols-2">
        {postcards.map((postcard) => {
          if (activeTab === 'reported') {
            const detailHref = postcard.activeReportCaseId
              ? `/admin/reports/${postcard.activeReportCaseId}`
              : '/admin';
            const reasonSummary = postcard.activeReportReasonCounts
              ? Object.entries(postcard.activeReportReasonCounts)
                  .map(([reason, count]) => `${reportReasonLabel(text, reason)}: ${count}`)
                  .join(' · ')
              : '';

            return (
              <Link
                key={postcard.id}
                href={detailHref}
                className="grid gap-1.5 rounded-[14px] border border-[#e2eee0] bg-[#f8fffc] px-3 py-2.5 text-inherit no-underline transition hover:border-[#8dcd9f] hover:shadow-[0_8px_20px_rgba(44,89,64,0.14)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <small className={mutedTextClassName}>
                    {new Date(postcard.createdAt).toLocaleString(dateLocale)}
                  </small>
                  <small className={mutedTextClassName}>
                    {text.reportedStatusLabel}:{' '}
                    {reportStatusLabel(text, postcard.activeReportCaseStatus)}
                  </small>
                </div>
                <div className="flex items-center gap-2">
                  {postcard.imageUrl ? (
                    <Image
                      className="h-14 w-20 shrink-0 rounded-[10px] border border-[#deeadb] object-cover"
                      src={postcard.imageUrl}
                      alt={postcard.title}
                      width={240}
                      height={160}
                    />
                  ) : null}
                  <div className="min-w-0 grid gap-0.5">
                    <strong className="truncate">{postcard.title}</strong>
                    <small className={mutedTextClassName}>
                      {text.reportCountLabel(Number(postcard.activeReportCount ?? 0))}
                    </small>
                    {reasonSummary ? (
                      <small className={mutedTextClassName}>{reasonSummary}</small>
                    ) : null}
                  </div>
                </div>
                <small className={mutedTextClassName}>{text.reportedOpenDetail}</small>
              </Link>
            );
          }

          const draft = postcardDrafts[postcard.id] ?? buildAdminPostcardDraft(postcard);

          return (
            <article key={postcard.id} className="grid gap-1.5 rounded-[14px] border border-[#e2eee0] bg-[#f8fffc] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <small className={mutedTextClassName}>
                  {new Date(postcard.createdAt).toLocaleString(dateLocale)}
                </small>
                <small className={mutedTextClassName}>⚠️ {postcard.wrongLocationReports}</small>
              </div>
              {postcard.imageUrl ? (
                <Image
                  className="h-auto max-h-[180px] w-full rounded-[10px] border border-[#deeadb] object-cover"
                  src={postcard.imageUrl}
                  alt={postcard.title}
                  width={640}
                  height={420}
                />
              ) : null}
              <small className={mutedTextClassName}>{text.uploaderLabel(postcard.uploaderName ?? 'unknown')}</small>
              <label className="grid gap-1 text-[0.86rem] font-bold text-[#39604f]">
                {text.fieldTitle}
                <input
                  className="rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-1.5"
                  value={draft.title}
                  onChange={(event) =>
                    setPostcardDrafts((current) => ({
                      ...current,
                      [postcard.id]: {
                        ...draft,
                        title: event.target.value
                      }
                    }))
                  }
                  disabled={savingPostcardId === postcard.id}
                />
              </label>
              <label className="grid gap-1 text-[0.86rem] font-bold text-[#39604f]">
                {workbenchText.fieldPostcardType}
                <select
                  className="rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-1.5"
                  value={draft.postcardType}
                  onChange={(event) =>
                    setPostcardDrafts((current) => ({
                      ...current,
                      [postcard.id]: {
                        ...draft,
                        postcardType: event.target.value as PostcardType
                      }
                    }))
                  }
                  disabled={savingPostcardId === postcard.id}
                >
                  <PostcardTypeOptions text={workbenchText} />
                </select>
              </label>
              <label className="grid gap-1 text-[0.86rem] font-bold text-[#39604f]">
                {text.fieldPlaceName}
                <input
                  className="rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-1.5"
                  value={draft.placeName}
                  onChange={(event) =>
                    setPostcardDrafts((current) => ({
                      ...current,
                      [postcard.id]: {
                        ...draft,
                        placeName: event.target.value
                      }
                    }))
                  }
                  disabled={savingPostcardId === postcard.id}
                />
              </label>
              <label className="grid gap-1 text-[0.86rem] font-bold text-[#39604f]">
                {text.fieldDescription}
                <textarea
                  className="rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-1.5"
                  rows={3}
                  value={draft.notes}
                  onChange={(event) =>
                    setPostcardDrafts((current) => ({
                      ...current,
                      [postcard.id]: {
                        ...draft,
                        notes: event.target.value
                      }
                    }))
                  }
                  disabled={savingPostcardId === postcard.id}
                />
              </label>
              <label className="grid gap-1 text-[0.86rem] font-bold text-[#39604f]">
                {text.fieldLocation}
                <input
                  className="rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-1.5"
                  value={draft.locationInput}
                  onChange={(event) =>
                    setPostcardDrafts((current) => ({
                      ...current,
                      [postcard.id]: {
                        ...draft,
                        locationInput: event.target.value
                      }
                    }))
                  }
                  disabled={savingPostcardId === postcard.id}
                />
              </label>
              <button
                type="button"
                className="rounded-[10px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-3 py-1.5 text-[0.83rem] font-bold text-white disabled:opacity-60"
                disabled={savingPostcardId === postcard.id}
                onClick={() => onSavePostcard(postcard)}
              >
                {savingPostcardId === postcard.id ? text.savingPostcard : text.savePostcard}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
