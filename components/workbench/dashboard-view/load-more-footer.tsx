'use client';

import type { WorkbenchText } from '@/lib/i18n';
import { primaryButtonClassName, smallMutedClassName } from '@/components/workbench/dashboard-view/styles';

type DashboardLoadMoreFooterProps = {
  text: WorkbenchText;
  visibleCount: number;
  totalCount: number;
  onLoadMore: () => void;
};

export function DashboardLoadMoreFooter({
  text,
  visibleCount,
  totalCount,
  onLoadMore
}: DashboardLoadMoreFooterProps) {
  if (totalCount <= 0) {
    return null;
  }

  const cappedVisibleCount = Math.min(visibleCount, totalCount);
  const hasMore = cappedVisibleCount < totalCount;

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <small className={smallMutedClassName}>
        {text.dashboardShowingCount(cappedVisibleCount, totalCount)}
      </small>
      {hasMore ? (
        <button
          type="button"
          className={`${primaryButtonClassName} cursor-pointer px-3 py-2 text-[0.82rem]`}
          onClick={onLoadMore}
        >
          {text.buttonLoadMore}
        </button>
      ) : null}
    </div>
  );
}
