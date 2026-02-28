import { inlineFieldClassName } from '@/components/workbench/explore-view/styles';
import type { ExploreFiltersProps } from '@/components/workbench/explore-view/types';
import type { ExploreSort } from '@/components/workbench/types';

const inputClassName =
  'w-full rounded-[13px] border border-[#d8e6d5] bg-[#fdfffc] px-3 py-2 text-[#1f2e29] outline-none transition focus:border-[#72b485] focus:ring-4 focus:ring-[rgba(86,179,106,0.18)]';

export function ExploreFilters({
  text,
  exploreSort,
  searchText,
  exploreLimit,
  onSearchChange,
  onSortChange,
  onLimitChange
}: ExploreFiltersProps) {
  return (
    <details className="rounded-xl border border-[#dce9d8] bg-[#fbfffa] px-2.5 pb-2.5 pt-1">
      <summary className="cursor-pointer py-2 font-bold text-[#2b6442] marker:text-[#5a7b67]">
        {text.exploreFiltersTitle}
      </summary>
      <div className="grid gap-2 pt-1">
        <label className={inlineFieldClassName}>
          {text.exploreSearchLabel}
          <input
            className={`${inputClassName} disabled:opacity-60`}
            value={searchText}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={text.exploreSearchPlaceholder}
          />
        </label>
        <label className={inlineFieldClassName}>
          {text.exploreSortLabel}
          <select
            className={inputClassName}
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
            className={inputClassName}
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
  );
}
