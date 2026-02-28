import { UserRole } from '@prisma/client';
import {
  fieldInputClassName,
  fieldLabelClassName
} from '@/components/admin-dashboard-view/styles';
import type { AdminSearchControlsProps } from '@/components/admin-dashboard-view/types';

export function AdminSearchControls({
  text,
  activeTab,
  userSearchText,
  userRoleFilter,
  searchText,
  onUserSearchChange,
  onUserRoleFilterChange,
  onSearchTextChange
}: AdminSearchControlsProps) {
  if (activeTab === 'users') {
    return (
      <div className="grid gap-2 rounded-[14px] border border-[#deead9] bg-[#f8fffc] p-3 min-[720px]:grid-cols-2">
        <label className="grid gap-1 text-[0.9rem] font-bold text-[#39604f]">
          {text.userSearchLabel}
          <input
            className={fieldInputClassName}
            value={userSearchText}
            onChange={(event) => onUserSearchChange(event.target.value)}
            placeholder={text.userSearchPlaceholder}
          />
        </label>
        <label className="grid gap-1 text-[0.9rem] font-bold text-[#39604f]">
          {text.userRoleFilterLabel}
          <select
            className="rounded-[11px] border border-[#d8e6d5] bg-white px-2.5 py-2"
            value={userRoleFilter}
            onChange={(event) => onUserRoleFilterChange(event.target.value as 'ALL' | UserRole)}
          >
            <option value="ALL">{text.userRoleFilterAll}</option>
            <option value={UserRole.ADMIN}>ADMIN</option>
            <option value={UserRole.MANAGER}>MANAGER</option>
            <option value={UserRole.MEMBER}>MEMBER</option>
          </select>
        </label>
      </div>
    );
  }

  return (
    <label className={fieldLabelClassName}>
      {text.searchLabel}
      <input
        className={fieldInputClassName}
        value={searchText}
        onChange={(event) => onSearchTextChange(event.target.value)}
        placeholder={text.searchPlaceholder}
      />
    </label>
  );
}
