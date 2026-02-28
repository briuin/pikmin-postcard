'use client';

import type { DashboardViewMode } from '@/components/workbench/types';
import type { WorkbenchText } from '@/lib/i18n';
import {
  actionButtonClassName,
  chipClassName,
  chipRowClassName,
  dashboardToolbarClassName
} from '@/components/workbench/dashboard-view/styles';

type DashboardToolbarProps = {
  text: WorkbenchText;
  jobsCount: number;
  postcardsCount: number;
  dashboardViewMode: DashboardViewMode;
  isLoadingJobs: boolean;
  isLoadingMine: boolean;
  onSetDashboardViewMode: (mode: DashboardViewMode) => void;
  onRefresh: () => void;
};

export function DashboardToolbar({
  text,
  jobsCount,
  postcardsCount,
  dashboardViewMode,
  isLoadingJobs,
  isLoadingMine,
  onSetDashboardViewMode,
  onRefresh
}: DashboardToolbarProps) {
  return (
    <div className={dashboardToolbarClassName}>
      <div className={chipRowClassName}>
        <span className={chipClassName}>{text.chipAiJobs(jobsCount)}</span>
        <span className={chipClassName}>{text.chipMyPostcards(postcardsCount)}</span>
      </div>
      <div className={chipRowClassName}>
        <button
          type="button"
          className={actionButtonClassName}
          onClick={() => onSetDashboardViewMode('grid')}
          disabled={dashboardViewMode === 'grid'}
        >
          {text.buttonGrid}
        </button>
        <button
          type="button"
          className={actionButtonClassName}
          onClick={() => onSetDashboardViewMode('list')}
          disabled={dashboardViewMode === 'list'}
        >
          {text.buttonList}
        </button>
        <button
          type="button"
          className={actionButtonClassName}
          onClick={onRefresh}
          disabled={isLoadingJobs || isLoadingMine}
        >
          {text.buttonRefresh}
        </button>
      </div>
    </div>
  );
}
