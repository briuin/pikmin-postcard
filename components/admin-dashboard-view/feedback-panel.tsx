import { mutedTextClassName } from '@/components/admin-dashboard-view/styles';
import type { AdminFeedbackPanelProps } from '@/components/admin-dashboard-view/types';

export function AdminFeedbackPanel({
  text,
  feedbacks,
  isLoadingFeedbacks,
  dateLocale
}: AdminFeedbackPanelProps) {
  return (
    <div className="grid gap-2">
      <strong>{text.feedbackTitle}</strong>
      {isLoadingFeedbacks ? <small className={mutedTextClassName}>{text.feedbackLoading}</small> : null}
      {!isLoadingFeedbacks && feedbacks.length === 0 ? (
        <small className={mutedTextClassName}>{text.feedbackEmpty}</small>
      ) : null}

      <div className="grid gap-2">
        {feedbacks.map((item) => (
          <article key={item.id} className="grid gap-1.5 rounded-[14px] border border-[#e2eee0] bg-[#f8fffc] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <strong>{item.subject}</strong>
              <small className={mutedTextClassName}>
                {item.status === 'OPEN' ? text.feedbackStatusOpen : text.feedbackStatusClosed}
              </small>
            </div>
            <small className={mutedTextClassName}>
              {(item.userDisplayName?.trim() || item.userEmail)} · {new Date(item.createdAt).toLocaleString(dateLocale)}
            </small>
            <p className="m-0 whitespace-pre-wrap break-words rounded-[10px] border border-[#deeadb] bg-white px-2.5 py-2 text-[0.9rem] text-[#294136]">
              {item.message}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
