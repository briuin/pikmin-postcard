import {
  chipClassName,
  chipRowClassName,
  sectionHeadClassName
} from '@/components/workbench/explore-view/styles';
import type { ExploreSummaryProps } from '@/components/workbench/explore-view/types';

export function ExploreSummary({
  text,
  visiblePostcardsCount,
  publicMarkerCount,
  visibleTotal,
  visibleHasMore,
  exploreLimit
}: ExploreSummaryProps) {
  return (
    <div className={sectionHeadClassName}>
      <h2>{text.exploreTitle}</h2>
      <div className={chipRowClassName}>
        <span className={chipClassName}>{text.chipLoaded(visiblePostcardsCount)}</span>
        <span className={chipClassName}>{text.chipMarkers(publicMarkerCount)}</span>
        <span className={chipClassName}>{text.chipInArea(visibleTotal)}</span>
        {visibleHasMore ? <span className={chipClassName}>{text.chipLimitedTo(exploreLimit)}</span> : null}
      </div>
    </div>
  );
}
