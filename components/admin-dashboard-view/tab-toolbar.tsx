import {
  activeTabClassName,
  inactiveTabClassName,
  refreshButtonClassName,
  tabToolbarClassName
} from '@/components/admin-dashboard-view/styles';
import type { AdminTabToolbarProps } from '@/components/admin-dashboard-view/types';

export function AdminTabToolbar({
  activeTab,
  visibleTabs,
  text,
  isLoadingUsers,
  isLoadingPostcards,
  onChangeTab,
  onRefresh
}: AdminTabToolbarProps) {
  return (
    <div className={tabToolbarClassName}>
      {visibleTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={activeTab === tab.key ? activeTabClassName : inactiveTabClassName}
          onClick={() => onChangeTab(tab.key)}
        >
          {tab.label}
        </button>
      ))}
      <button
        type="button"
        className={refreshButtonClassName}
        onClick={onRefresh}
        disabled={isLoadingUsers || isLoadingPostcards}
      >
        {text.buttonRefresh}
      </button>
    </div>
  );
}
