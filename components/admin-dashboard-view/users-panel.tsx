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

      <div className="grid gap-2">
        {users.map((user) => {
          const draft = userAccessDrafts[user.id] ?? buildUserAccessDraft(user);
          return (
            <article key={user.id} className="grid gap-1.5 rounded-[14px] border border-[#e2eee0] bg-[#f8fffc] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{user.displayName?.trim() || user.email}</strong>
                <small className={mutedTextClassName}>{user.email}</small>
              </div>
              <small className={mutedTextClassName}>
                {new Date(user.createdAt).toLocaleDateString(dateLocale)} · {user.postcardCount} postcards
              </small>
              <div className="flex flex-wrap items-center gap-2">
                <label className="grid gap-1 text-[0.86rem] font-bold text-[#39604f]">
                  {text.userRoleLabel}
                  <select
                    className="rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-1.5"
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
                <label className="grid gap-1 text-[0.86rem] font-bold text-[#39604f]">
                  {text.userApprovalLabel}
                  <select
                    className="rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-1.5"
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
                <div className="grid gap-1 rounded-[10px] border border-[#d8e6d5] bg-white px-2.5 py-2">
                  <small className="font-bold text-[#39604f]">{text.userPermissionsLabel}</small>
                  <label className="flex items-center gap-1.5 text-[0.85rem] font-semibold text-[#2f4d40]">
                    <input
                      type="checkbox"
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
                  <label className="flex items-center gap-1.5 text-[0.85rem] font-semibold text-[#2f4d40]">
                    <input
                      type="checkbox"
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
                  <label className="flex items-center gap-1.5 text-[0.85rem] font-semibold text-[#2f4d40]">
                    <input
                      type="checkbox"
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
                <button
                  type="button"
                  className="rounded-[10px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-3 py-1.5 text-[0.83rem] font-bold text-white disabled:opacity-60"
                  disabled={savingUserAccessId === user.id}
                  onClick={() => onSaveUserAccess(user)}
                >
                  {savingUserAccessId === user.id ? text.savingRole : text.saveRole}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
