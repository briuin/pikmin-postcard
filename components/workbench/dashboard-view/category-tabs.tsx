'use client';

import type { WorkbenchText } from '@/lib/i18n';
import type { DashboardCategory } from '@/components/workbench/dashboard-view/types';
import { categoryTabButtonClassName } from '@/components/workbench/dashboard-view/styles';

type DashboardCategoryTabsProps = {
  text: WorkbenchText;
  activeCategory: DashboardCategory;
  jobsCount: number;
  postcardsCount: number;
  onChangeCategory: (category: DashboardCategory) => void;
};

export function DashboardCategoryTabs({
  text,
  activeCategory,
  jobsCount,
  postcardsCount,
  onChangeCategory
}: DashboardCategoryTabsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        className={
          activeCategory === 'ai'
            ? `${categoryTabButtonClassName} border-[#83c797] bg-[linear-gradient(135deg,#56b36a,#359d59)] text-white shadow-[0_6px_12px_rgba(47,158,88,0.22)]`
            : `${categoryTabButtonClassName} border-[#d6e8d4] bg-[#f4fff4] text-[#2b6442]`
        }
        onClick={() => onChangeCategory('ai')}
      >
        {text.aiJobsTitle} ({jobsCount})
      </button>
      <button
        type="button"
        className={
          activeCategory === 'postcards'
            ? `${categoryTabButtonClassName} border-[#83c797] bg-[linear-gradient(135deg,#56b36a,#359d59)] text-white shadow-[0_6px_12px_rgba(47,158,88,0.22)]`
            : `${categoryTabButtonClassName} border-[#d6e8d4] bg-[#f4fff4] text-[#2b6442]`
        }
        onClick={() => onChangeCategory('postcards')}
      >
        {text.myPostcardsTitle} ({postcardsCount})
      </button>
    </div>
  );
}
