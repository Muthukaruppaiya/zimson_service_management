import { useMemo, useState } from "react";
import { useAuth, useVisibleUsers } from "../context/AuthContext";
import type { UserPatchInput } from "../context/AuthContext";
import { useRegions } from "../context/RegionsContext";
import { useToast } from "../components/ui/Toast";
import { ROLE_MODULE_ACCESS } from "../config/moduleAccess";
import {
  sanitizeAlphanumericInput,
  sanitizeEmailInput,
  sanitizeTextInput,
} from "../lib/inputSanitize";
import { ROLE_CREATION_META, creatableRolesForActor, isStoreRole } from "../lib/userCreationPolicy";
import { UserModuleAccessEditor } from "../components/users/UserModuleAccessEditor";
import { PageHeader } from "../components/ui/PageHeader";
import type { ModuleKey, SessionUser } from "../types/user";
import type { UserRole } from "../types/user";

// ── helpers ──────────────────────────────────────────────────────────────────

function roleLabel(role: UserRole) {
  return ROLE_CREATION_META.find((x) => x.value === role)?.label ?? role;
}
function displayEmployeeCode(code: string) {
  return String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

const inputCls =
  "mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/30 transition-colors";
const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-stone-500 mt-3";

// ── Edit Modal ────────────────────────────────────────────────────────────────

function UserEditModal({
  target,
  onClose,
  onSave,
}: {
  target: SessionUser;
  onClose: () => void;
  onSave: (patch: UserPatchInput) => Promise<void>;
}) {
  const { user } = useAuth();
  const { regions } = useRegions();

  const [displayName, setDisplayName] = useState(target.displayName);
  const [email, setEmail] = useState(target.email ?? "");
  const [employeeCode, setEmployeeCode] = useState(target.employeeCode ?? "");
  const [role, setRole] = useState<UserRole>(target.role);
  const [regionId, setRegionId] = useState(target.regionId ?? "");
  const [storeIds, setStoreIds] = useState<string[]>(target.storeIds ?? (target.storeId ? [target.storeId] : []));
  const hasModuleOverride = (target.moduleAccessOverride?.length ?? 0) > 0;
  const [useCustomModules, setUseCustomModules] = useState(hasModuleOverride);
  const [selectedModules, setSelectedModules] = useState<ModuleKey[]>(() =>
    hasModuleOverride ? [...(target.moduleAccessOverride as ModuleKey[])] : [...ROLE_MODULE_ACCESS[target.role]],
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const creatableRoles = useMemo(() => creatableRolesForActor(user?.role), [user?.role]);
  const storeRole = isStoreRole(role);
  const storesForRegion = useMemo(
    () => regions.find((r) => r.id === regionId)?.stores ?? [],
    [regions, regionId],
  );
  const regionOptions = useMemo(() => {
    if (!user) return [];
    if (user.role === "admin" && user.regionId) return regions.filter((r) => r.id === user.regionId);
    return regions;
  }, [user, regions]);

  async function handleSave() {
    if (!displayName.trim()) { setErr("Employee name is required."); return; }
    if (useCustomModules && selectedModules.length === 0) {
      setErr("Custom module list is empty — select at least one module.");
      return;
    }
    setSaving(true);
    setErr(null);
    await onSave({
      displayName: displayName.trim(),
      email: email.trim(),
      employeeCode: employeeCode.trim(),
      role,
      regionId: regionId || undefined,
      storeId: storeRole ? (storeIds[0] ?? null) : null,
      storeIds: storeRole ? storeIds : [],
      moduleAccessOverride: useCustomModules ? selectedModules : null,
    });
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between bg-rlx-green px-6 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-white">Edit User</h2>
            <p className="text-[11px] text-white/60 mt-0.5">{target.displayName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center border border-white/30 text-white hover:bg-white/10 text-lg"
            aria-label="Close"
          >×</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-1">
          <label htmlFor="edit-employee-name" className={labelCls}>Employee Name *</label>
          <input
            id="edit-employee-name"
            className={inputCls}
            value={displayName}
            onChange={(e) => setDisplayName(sanitizeTextInput(e.target.value, 240))}
            placeholder="Full name of the employee"
            autoComplete="name"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Employee No</label>
              <input
                className={inputCls}
                value={employeeCode}
                onChange={(e) => setEmployeeCode(sanitizeAlphanumericInput(e.target.value, 24).toUpperCase())}
              />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                className={inputCls}
                value={email}
                onChange={(e) => setEmail(sanitizeEmailInput(e.target.value))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Role</label>
              <select
                className={inputCls}
                value={role}
                onChange={(e) => { setRole(e.target.value as UserRole); setStoreIds([]); }}
              >
                {creatableRoles.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Region / HO</label>
              {user?.role === "admin" ? (
                <div className={inputCls + " bg-stone-50 text-stone-500"}>{regionOptions[0]?.name ?? "—"}</div>
              ) : (
                <select
                  className={inputCls}
                  value={regionId}
                  onChange={(e) => { setRegionId(e.target.value); setStoreIds([]); }}
                >
                  <option value="">— none —</option>
                  {regionOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
            </div>
          </div>

          {storeRole && (
            <div>
              <label className={labelCls}>Stores</label>
              <div className="mt-1 border border-rlx-rule bg-white max-h-40 overflow-y-auto">
                {storesForRegion.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-stone-400">No stores in selected region.</p>
                ) : storesForRegion.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2.5 border-b border-rlx-rule px-3 py-2 text-sm hover:bg-rlx-green/5 last:border-0"
                  >
                    <input
                      type="checkbox"
                      className="accent-rlx-green"
                      checked={storeIds.includes(s.id)}
                      onChange={(e) => {
                        setStoreIds((prev) =>
                          e.target.checked ? [...new Set([...prev, s.id])] : prev.filter((id) => id !== s.id),
                        );
                      }}
                    />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 border-t border-rlx-rule pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-500 mb-3">Navigation modules</p>
            <UserModuleAccessEditor
              role={role}
              useCustomModules={useCustomModules}
              onUseCustomModulesChange={setUseCustomModules}
              selectedModules={selectedModules}
              onSelectedModulesChange={setSelectedModules}
            />
          </div>

          {err && (
            <div className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{err}</div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-3 border-t border-rlx-rule bg-rlx-bg px-6 py-4">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="bg-rlx-green px-6 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-rlx-green/90 transition"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="border border-rlx-rule px-5 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-50 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function UsersListPage() {
  const { user, updateUser } = useAuth();
  const visibleUsers = useVisibleUsers();
  const { regions } = useRegions();
  const { success, error: toastError } = useToast();

  const [editTarget, setEditTarget] = useState<SessionUser | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<SessionUser | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const canManageUsers = user?.role === "super_admin" || user?.role === "admin";

  const directorySubtitle = useMemo(() => {
    if (user?.role === "admin") return "Users in your region";
    return "All users";
  }, [user?.role]);

  function resolveStoreName(u: SessionUser) {
    const allStores = regions.flatMap((r) => r.stores);
    const ids = u.storeIds && u.storeIds.length > 0 ? u.storeIds : u.storeId ? [u.storeId] : [];
    if (!ids.length) return "—";
    return ids.map((id) => allStores.find((s) => s.id === id)?.name ?? id).join(", ");
  }

  async function handleSaveEdit(patch: UserPatchInput) {
    if (!editTarget) return;
    const result = await updateUser(editTarget.id, patch);
    if (result.ok) {
      success("User updated", `"${editTarget.displayName}" has been saved.`);
      setEditTarget(null);
    } else {
      toastError("Update failed", result.message);
    }
  }

  async function handleToggleLogin(target: SessionUser) {
    const newVal = target.canLogin === false ? true : false;
    setDeactivating(true);
    const result = await updateUser(target.id, { canLogin: newVal });
    setDeactivating(false);
    setDeactivateTarget(null);
    if (result.ok) {
      success(
        newVal ? "User activated" : "User deactivated",
        `"${target.displayName}" login has been ${newVal ? "enabled" : "disabled"}.`,
      );
    } else {
      toastError("Failed", result.message);
    }
  }

  if (!canManageUsers || !user) {
    return (
      <div>
        <PageHeader title="User list" description="" />
        <div className="border border-rlx-rule bg-white px-6 py-8 text-center text-sm text-stone-400">
          You do not have permission to view the user directory.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="User List"
        description=""
      />

      {/* Table */}
      <div className="border border-rlx-rule bg-white shadow-sm">
        {/* Card header */}
        <div className="border-b border-rlx-rule bg-rlx-green px-5 py-3.5">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-white">User Directory</h2>
          <p className="text-[11px] text-white/60 mt-0.5">{directorySubtitle}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                <th className="px-4 py-3">Employee Name</th>
                <th className="px-4 py-3">Employee No</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Region</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3 text-center">Login</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((u, idx) => {
                const isInactive = u.canLogin === false;
                return (
                  <tr
                    key={u.id}
                    className={`border-b border-rlx-rule last:border-0 transition-colors ${
                      isInactive ? "bg-stone-50 opacity-60" : idx % 2 === 0 ? "bg-white" : "bg-stone-50/50"
                    }`}
                  >
                    <td className="px-4 py-3 font-semibold text-stone-800">{u.displayName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-stone-600">
                      {displayEmployeeCode(u.employeeCode ?? u.id)}
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="border border-rlx-rule bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-600">
                      {u.regionId ? (regions.find((r) => r.id === u.regionId)?.name ?? u.regionId) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-600">{resolveStoreName(u)}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          isInactive
                            ? "border border-stone-300 text-stone-400"
                            : "border border-blue-300 bg-blue-50 text-blue-700"
                        }`}
                      >
                        {isInactive ? "Off" : "Yes"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditTarget(u)}
                          className="border border-rlx-green px-3 py-1 text-[11px] font-semibold text-rlx-green hover:bg-rlx-green hover:text-white transition"
                        >
                          Edit
                        </button>
                        {u.id !== user.id && (
                          <button
                            type="button"
                            onClick={() => setDeactivateTarget(u)}
                            className={`border px-3 py-1 text-[11px] font-semibold transition ${
                              isInactive
                                ? "border-blue-400 text-blue-700 hover:bg-blue-50"
                                : "border-red-300 text-red-600 hover:bg-red-50"
                            }`}
                          >
                            {isInactive ? "Activate" : "Deactivate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {visibleUsers.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-stone-400">No users found.</div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editTarget && (
        <UserEditModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* Deactivate Confirmation Modal */}
      {deactivateTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDeactivateTarget(null); }}
        >
          <div className="w-full max-w-sm bg-white shadow-2xl overflow-hidden">
            <div className={`px-6 py-4 ${deactivateTarget.canLogin === false ? "bg-rlx-green" : "bg-red-600"}`}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white">
                {deactivateTarget.canLogin === false ? "Activate User" : "Deactivate User"}
              </h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-stone-700">
                {deactivateTarget.canLogin === false
                  ? <>Enable login for <strong>{deactivateTarget.displayName}</strong>? They will be able to sign in again.</>
                  : <>Disable login for <strong>{deactivateTarget.displayName}</strong>? They will not be able to sign in until reactivated.</>
                }
              </p>
            </div>
            <div className="flex gap-3 border-t border-rlx-rule bg-rlx-bg px-6 py-4">
              <button
                type="button"
                disabled={deactivating}
                onClick={() => void handleToggleLogin(deactivateTarget)}
                className={`px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 transition ${
                  deactivateTarget.canLogin === false ? "bg-rlx-green hover:bg-rlx-green/90" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {deactivating ? "Processing…" : deactivateTarget.canLogin === false ? "Yes, Activate" : "Yes, Deactivate"}
              </button>
              <button
                type="button"
                disabled={deactivating}
                onClick={() => setDeactivateTarget(null)}
                className="border border-rlx-rule px-5 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
