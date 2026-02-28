import { UserApprovalStatus, UserRole } from '@prisma/client';
import { buildUserAccessDraft } from '@/components/admin-dashboard-types';
import { mutedTextClassName } from '@/components/admin-dashboard-view/styles';
import type { AdminUsersPanelProps } from '@/components/admin-dashboard-view/types';

export function AdminUsersPanel({
  text,
  users,
  userAccessDrafts,
  setUserAccessDrafts,
  isLoadingUsers,
  savingUserAccessId,
  onSaveUserAccess,
  dateLocale
}: AdminUsersPanelProps) {
  return (
    <div className="grid gap-2">
      <strong>{text.usersTitle}</strong>
      <small className={mutedTextClassName}>{text.usersHint}</small>
      {isLoadingUsers ? <small className={mutedTextClassName}>{text.usersLoading}</small> : null}
      {!isLoadingUsers && users.length === 0 ? <small className={mutedTextClassName}>{text.usersEmpty}</small> : null}

      <div className="grid gap-2.5">
        {users.map((user) => {
          const draft = userAccessDrafts[user.id] ?? buildUserAccessDraft(user);
          const displayName = user.displayName?.trim() || user.email;
          const initial = displayName.slice(0, 1).toUpperCase();

          return (
            <article
              key={user.id}
              className="grid gap-3 rounded-[18px] border border-[#d7e7d6] bg-[linear-gradient(165deg,#f9fffb,#f2fbf5)] px-3 py-3 shadow-[0_6px_16px_rgba(49,87,67,0.08)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2.5">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#cde4d0] bg-[linear-gradient(140deg,#68bf78,#3fa866)] text-[0.95rem] font-black text-white shadow-[0_4px_10px_rgba(47,158,88,0.26)]">
                    {initial}
                  </span>
                  <div className="grid min-w-0 gap-0.5">
                    <strong className="truncate text-[0.99rem] text-[#1f3a2f]">{displayName}</strong>
                    <small className={`${mutedTextClassName} truncate`}>{user.email}</small>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      <span className="inline-flex items-center rounded-full border border-[#d5e7d6] bg-white/90 px-2 py-0.5 text-[0.74rem] font-semibold text-[#355547]">
                        {new Date(user.createdAt).toLocaleDateString(dateLocale)}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[#d5e7d6] bg-white/90 px-2 py-0.5 text-[0.74rem] font-semibold text-[#355547]">
                        {user.postcardCount} postcards
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="rounded-[11px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-3 py-1.5 text-[0.83rem] font-bold text-white shadow-[0_8px_16px_rgba(47,158,88,0.25)] transition hover:brightness-105 disabled:opacity-60"
                  disabled={savingUserAccessId === user.id}
                  onClick={() => onSaveUserAccess(user)}
                >
                  {savingUserAccessId === user.id ? text.savingRole : text.saveRole}
                </button>
              </div>

              <div className="grid gap-2 min-[980px]:grid-cols-[minmax(150px,180px)_minmax(160px,190px)_minmax(0,1fr)]">
                <label className="grid gap-1 text-[0.83rem] font-bold uppercase tracking-[0.03em] text-[#3a6150]">
                  {text.userRoleLabel}
                  <select
                    className="rounded-[11px] border border-[#d4e4d3] bg-white px-2.5 py-2 text-[0.92rem] font-semibold text-[#244636] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                    value={draft.role}
                    onChange={(event) =>
                      setUserAccessDrafts((current) => ({
                        ...current,
                        [user.id]: {
                          ...draft,
                          role: event.target.value as UserRole
                        }
                      }))
                    }
                  >
                    <option value={UserRole.ADMIN}>ADMIN</option>
                    <option value={UserRole.MANAGER}>MANAGER</option>
                    <option value={UserRole.MEMBER}>MEMBER</option>
                  </select>
                </label>

                <label className="grid gap-1 text-[0.83rem] font-bold uppercase tracking-[0.03em] text-[#3a6150]">
                  {text.userApprovalLabel}
                  <select
                    className="rounded-[11px] border border-[#d4e4d3] bg-white px-2.5 py-2 text-[0.92rem] font-semibold text-[#244636] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                    value={draft.approvalStatus}
                    onChange={(event) =>
                      setUserAccessDrafts((current) => ({
                        ...current,
                        [user.id]: {
                          ...draft,
                          approvalStatus: event.target.value as UserApprovalStatus
                        }
                      }))
                    }
                  >
                    <option value={UserApprovalStatus.APPROVED}>{text.userApprovalApproved}</option>
                    <option value={UserApprovalStatus.PENDING}>{text.userApprovalPending}</option>
                  </select>
                </label>

                <div className="grid gap-1.5 rounded-[12px] border border-[#d4e4d3] bg-white/88 px-2.5 py-2">
                  <small className="text-[0.83rem] font-bold uppercase tracking-[0.03em] text-[#3a6150]">
                    {text.userPermissionsLabel}
                  </small>
                  <div className="flex flex-wrap gap-1.5">
                    <label className="inline-flex items-center gap-1.5 rounded-full border border-[#d8e8d8] bg-[#f5fff5] px-2 py-1 text-[0.83rem] font-semibold text-[#2f4d40]">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={draft.canCreatePostcard}
                        onChange={(event) =>
                          setUserAccessDrafts((current) => ({
                            ...current,
                            [user.id]: {
                              ...draft,
                              canCreatePostcard: event.target.checked
                            }
                          }))
                        }
                      />
                      {text.userPermissionCreate}
                    </label>
                    <label className="inline-flex items-center gap-1.5 rounded-full border border-[#d8e8d8] bg-[#f5fff5] px-2 py-1 text-[0.83rem] font-semibold text-[#2f4d40]">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={draft.canSubmitDetection}
                        onChange={(event) =>
                          setUserAccessDrafts((current) => ({
                            ...current,
                            [user.id]: {
                              ...draft,
                              canSubmitDetection: event.target.checked
                            }
                          }))
                        }
                      />
                      {text.userPermissionAiDetect}
                    </label>
                    <label className="inline-flex items-center gap-1.5 rounded-full border border-[#d8e8d8] bg-[#f5fff5] px-2 py-1 text-[0.83rem] font-semibold text-[#2f4d40]">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={draft.canVote}
                        onChange={(event) =>
                          setUserAccessDrafts((current) => ({
                            ...current,
                            [user.id]: {
                              ...draft,
                              canVote: event.target.checked
                            }
                          }))
                        }
                      />
                      {text.userPermissionVote}
                    </label>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
