import { smallMutedClassName } from '@/components/workbench/explore-view/styles';
import type { ExploreStatusStripProps } from '@/components/workbench/explore-view/types';

export function ExploreStatusStrip({
  text,
  mapBoundsLoaded,
  isLoadingPublic,
  visiblePostcardsCount,
  exploreStatus
}: ExploreStatusStripProps) {
  return (
    <div className="grid gap-0.5 border-y border-[#e1ece0] px-0.5 py-1">
      {!mapBoundsLoaded ? <small className={smallMutedClassName}>{text.exploreLoadingArea}</small> : null}
      {isLoadingPublic ? <small className={smallMutedClassName}>{text.exploreLoadingPostcards}</small> : null}
      {!isLoadingPublic && mapBoundsLoaded && visiblePostcardsCount === 0 ? (
        <small className={smallMutedClassName}>{text.exploreNoResults}</small>
      ) : null}
      {exploreStatus ? <small className={smallMutedClassName}>{exploreStatus}</small> : null}
    </div>
  );
}
