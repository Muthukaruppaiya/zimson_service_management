import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useToast } from "../ui/Toast";
import { ROLE_MODULE_ACCESS } from "../../config/moduleAccess";
import type { ModuleKey, UserRole } from "../../types/user";
import {
  isValidEmail,
  isValidUsername,
  sanitizeAlphanumericInput,
  sanitizeEmailInput,
  sanitizePasswordInput,
  sanitizePhoneDigits,
  sanitizeUsernameInput,
} from "../../lib/inputSanitize";
import {
  ALL_MODULE_KEYS,
  MODULE_LABELS,
  ROLE_CREATION_META,
  creatableRolesForActor,
  effectiveModuleAccess,
  isStoreRole,
} from "../../lib/userCreationPolicy";

// ── Shared style tokens ──────────────────────────────────────────────────────

const inputCls = "ui-field mt-1";

const labelCls = "ui-field-label mt-0";

function SectionHeader({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-rlx-rule pb-3 mb-4">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-rlx-green text-[11px] font-bold text-white">
        {step}
      </span>
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-700">{title}</h3>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function UserCreationPanel() {
  const { user, createUser } = useAuth();
  const { regions } = useRegions();
  const { success: toastSuccess } = useToast();

  const [email, setEmail] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("store_user");
  const [regionId, setRegionId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [canLogin, setCanLogin] = useState(true);
  const [phone, setPhone] = useState("");
  const [useCustomModules, setUseCustomModules] = useState(false);
  const [selectedModules, setSelectedModules] = useState<ModuleKey[]>(() => [...ROLE_MODULE_ACCESS["store_user"]]);
  const [formMessage, setFormMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [createdUser, setCreatedUser] = useState<{ name: string; employeeCode: string; role: string } | null>(null);

  const creatable = useMemo(() => creatableRolesForActor(user?.role), [user?.role]);
  const creatableSet = useMemo(() => new Set(creatable.map((r) => r.value)), [creatable]);

  useEffect(() => {
    if (!user) return;
    const allowed = creatableRolesForActor(user.role).map((r) => r.value);
    if (!allowed.includes(role)) setRole(allowed[0] ?? "store_user");
  }, [user, role]);

  useEffect(() => {
    if (user?.role === "admin" && user.regionId) setRegionId(user.regionId);
  }, [user?.role, user?.regionId]);

  useEffect(() => {
    if (role === "technician" || role === "delivery_boy") setCanLogin(false);
  }, [role]);

  useEffect(() => {
    if (!useCustomModules) setSelectedModules([...ROLE_MODULE_ACCESS[role]]);
  }, [role, useCustomModules]);

  const regionOptions = useMemo(() => {
    if (!user) return [];
    if (user.role === "admin" && user.regionId) return regions.filter((r) => r.id === user.regionId);
    return regions;
  }, [user, regions]);

  const storesForRegion = useMemo(
    () => regions.find((x) => x.id === regionId)?.stores ?? [],
    [regions, regionId],
  );

  const storeRole = isStoreRole(role);
  const activeMeta = ROLE_CREATION_META.find((m) => m.value === role);
  const effectiveMods = useMemo(
    () => effectiveModuleAccess(role, useCustomModules ? selectedModules : null),
    [role, useCustomModules, selectedModules],
  );
  const defaultMods = ROLE_MODULE_ACCESS[role];
  const customDiffersFromDefault =
    useCustomModules &&
    (selectedModules.length !== defaultMods.length ||
      !defaultMods.every((m) => selectedModules.includes(m)) ||
      !selectedModules.every((m) => defaultMods.includes(m)));

  const validateStoreBelongsToRegion = useCallback(() => {
    if (!storeRole || !regionId) return true;
    if (storeIds.length === 0) return false;
    const allowed = new Set(storesForRegion.map((s) => s.id));
    return storeIds.every((id) => allowed.has(id));
  }, [storeRole, storeIds, regionId, storesForRegion]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMessage(null);
    const actor = user;
    if (!actor) return;

    const resolvedRegionId = actor.role === "admin" ? (actor.regionId ?? "") : regionId;

    if (!resolvedRegionId) {
      setFormMessage({ type: "err", text: "Select a region (HO scope)." });
      return;
    }
    if (storeRole && storeIds.length === 0) {
      setFormMessage({ type: "err", text: "Store roles require at least one store." });
      return;
    }
    if (storeRole && !validateStoreBelongsToRegion()) {
      setFormMessage({ type: "err", text: "Selected store must belong to the selected region." });
      return;
    }
    if (!creatableSet.has(role)) {
      setFormMessage({ type: "err", text: "Your role is not allowed to create this account type." });
      return;
    }
    if (!displayName.trim()) {
      setFormMessage({ type: "err", text: "Username is required." });
      return;
    }
    if (!isValidUsername(displayName)) {
      setFormMessage({
        type: "err",
        text: "Username must contain only letters and digits (no spaces or special characters).",
      });
      return;
    }
    if (!email.trim() || !isValidEmail(email)) {
      setFormMessage({ type: "err", text: "A valid email address is required (must be unique in the system)." });
      return;
    }
    if (role === "delivery_boy" && sanitizePhoneDigits(phone).replace(/\D/g, "").slice(-10).length !== 10) {
      setFormMessage({ type: "err", text: "Delivery boy requires a valid 10-digit mobile for OTP." });
      return;
    }
    if (canLogin && (!employeeCode.trim() || password.length < 4)) {
      setFormMessage({
        type: "err",
        text: "Login-enabled users need an employee number (internal reference), password (min 4 chars). They sign in with username or work email.",
      });
      return;
    }
    if (useCustomModules && selectedModules.length === 0) {
      setFormMessage({ type: "err", text: "Custom module list is empty — select at least one module." });
      return;
    }

    const result = await createUser({
      employeeCode,
      email,
      displayName,
      password,
      role,
      regionId: resolvedRegionId,
      storeId: storeRole ? (storeIds[0] ?? null) : null,
      storeIds: storeRole ? storeIds : [],
      phone: phone.trim() || null,
      canLogin: role === "delivery_boy" ? false : canLogin,
      moduleAccessOverride: useCustomModules ? selectedModules : null,
    });

    if (result.ok) {
      const roleMeta = ROLE_CREATION_META.find((r) => r.value === role);
      setCreatedUser({
        name: displayName.trim(),
        employeeCode: employeeCode.trim() || "—",
        role: roleMeta?.label ?? role,
      });
      toastSuccess("User created", `${displayName.trim()} has been added.`);
      setEmail("");
      setEmployeeCode("");
      setDisplayName("");
      setPassword("");
      setPhone("");
      setStoreId("");
      setStoreIds([]);
      setStorePickerOpen(false);
      setUseCustomModules(false);
      setFormMessage(null);
    } else {
      setFormMessage({ type: "err", text: result.message });
    }
  };

  if (!user) return null;

  const adminBlocked = user.role === "admin" && !user.regionId;

  return (
    <div>
      {adminBlocked && (
        <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          This Admin account has no region assigned — user creation is disabled.
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-0">

        {/* ── Section 1: Role ── */}
        <div className="border border-rlx-rule bg-white p-5 mb-px">
          <SectionHeader step={1} title="Role" />
          <div className="ui-form-grid">
            <div>
              <label htmlFor="uc-role" className={labelCls}>Select Role</label>
              <select
                id="uc-role"
                value={role}
                onChange={(e) => {
                  const next = e.target.value as UserRole;
                  setRole(next);
                  setStoreId("");
                  setStoreIds([]);
                  setStorePickerOpen(false);
                }}
                className={inputCls}
              >
                {creatable.some((r) => r.group === "system") && (
                  <optgroup label="System">
                    {creatable.filter((r) => r.group === "system").map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="HO &amp; Service Centre">
                  {creatable.filter((r) => r.group === "ho").map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Store">
                  {creatable.filter((r) => r.group === "store").map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            {activeMeta && (
              <div className="flex items-start gap-3 border border-rlx-green/20 bg-rlx-green/5 px-4 py-3">
                <span className="mt-0.5 h-2 w-2 shrink-0 bg-rlx-green" />
                <p className="text-xs leading-relaxed text-stone-600">{activeMeta.summary}</p>
              </div>
            )}
          </div>

          {/* Module chips preview */}
          <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-rlx-rule">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mr-1 self-center">Default access:</span>
            {defaultMods.map((m) => (
              <span key={m} className="border border-rlx-rule bg-stone-50 px-2 py-0.5 text-[10px] font-mono text-stone-500">
                {MODULE_LABELS[m] ?? m}
              </span>
            ))}
          </div>
        </div>

        {/* ── Section 2: Org Scope ── */}
        <div className="border border-rlx-rule bg-white p-5 mb-px">
          <SectionHeader step={2} title="Organisation Scope" />
          <div className="ui-form-grid">
            {/* Region */}
            {user.role !== "admin" ? (
              <div>
                <label htmlFor="uc-region" className={labelCls}>Region / HO</label>
                <select
                  id="uc-region"
                  value={regionId}
                  onChange={(e) => {
                    setRegionId(e.target.value);
                    setStoreId("");
                    setStoreIds([]);
                    setStorePickerOpen(false);
                  }}
                  className={inputCls}
                >
                  <option value="">Select region</option>
                  {regionOptions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-stone-400">
                  Manage in{" "}
                  <Link to="/regions" className="font-semibold text-rlx-green underline">
                    Regions &amp; Stores
                  </Link>
                </p>
              </div>
            ) : (
              <div>
                <label className={labelCls}>Region / HO</label>
                <div className={inputCls + " bg-stone-50 text-stone-500 cursor-not-allowed"}>
                  {regionOptions[0]?.name ?? "—"}
                </div>
                <p className="mt-1 text-[11px] text-stone-400">Fixed to your assigned region.</p>
              </div>
            )}

            {/* Store */}
            {storeRole ? (
              <div>
                <label htmlFor="uc-store" className={labelCls}>Store(s)</label>
                <div className="relative">
                  <button
                    id="uc-store"
                    type="button"
                    onClick={() => setStorePickerOpen((prev) => !prev)}
                    className={inputCls + " flex items-center justify-between text-left"}
                  >
                    <span className="truncate text-sm text-stone-800">
                      {storeIds.length > 0
                        ? storeIds.map((id) => storesForRegion.find((s) => s.id === id)?.name ?? id).join(", ")
                        : "Select one or more stores"}
                    </span>
                    <span className="ml-3 text-xs text-stone-400">{storePickerOpen ? "▲" : "▼"}</span>
                  </button>
                  {storePickerOpen && (
                    <div className="absolute z-20 mt-0.5 max-h-52 w-full overflow-auto border border-rlx-rule bg-white shadow-lg">
                      {storesForRegion.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-stone-400">No stores in selected region.</p>
                      ) : (
                        storesForRegion.map((s) => {
                          const checked = storeIds.includes(s.id);
                          return (
                            <label
                              key={s.id}
                              className="flex cursor-pointer items-center gap-2.5 border-b border-rlx-rule px-3 py-2 text-sm text-stone-700 hover:bg-rlx-green/5 last:border-0"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? Array.from(new Set([...storeIds, s.id]))
                                    : storeIds.filter((id) => id !== s.id);
                                  setStoreIds(next);
                                  setStoreId(next[0] ?? "");
                                }}
                              />
                              <span>{s.name}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-stone-400">Multiple stores allowed for this role.</p>
              </div>
            ) : (
              <div className="flex items-center border border-dashed border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-400 self-start mt-5">
                This role is not store-bound — no store required.
              </div>
            )}
          </div>
        </div>

        {/* ── Section 3: Identity ── */}
        <div className="border border-rlx-rule bg-white p-5 mb-px">
          <SectionHeader step={3} title="Identity &amp; Sign-in" />

          <div className="ui-form-grid">
            <div className="ui-span-full">
              <label htmlFor="uc-username" className={labelCls}>Username *</label>
              <input
                id="uc-username"
                required
                value={displayName}
                onChange={(e) => setDisplayName(sanitizeUsernameInput(e.target.value, 32))}
                className={inputCls}
                placeholder="e.g. jsmith"
                autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-stone-400">Letters and digits only — no spaces or special characters.</p>
            </div>

            <div className="ui-span-full">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-rlx-green"
                  checked={canLogin}
                  onChange={(e) => setCanLogin(e.target.checked)}
                  disabled={role === "technician"}
                />
                <span className="text-sm font-semibold text-stone-700">
                  Login enabled
                  <span className="ml-2 text-[11px] font-normal text-stone-400">
                    (off = directory-only profile, cannot sign in)
                  </span>
                </span>
              </label>
            </div>

            <div className={canLogin ? "" : "ui-span-full"}>
              <label htmlFor="uc-email" className={labelCls}>Email *</label>
              <input
                id="uc-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(sanitizeEmailInput(e.target.value))}
                className={inputCls}
                autoComplete="off"
                placeholder="user@zimson.com"
              />
              <p className="mt-1 text-[11px] text-stone-400">Must be unique. Used for sign-in when login is enabled.</p>
            </div>

            {role === "delivery_boy" ? (
              <div className="ui-span-full">
                <label htmlFor="uc-phone" className={labelCls}>
                  Mobile (OTP) *
                </label>
                <input
                  id="uc-phone"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(sanitizePhoneDigits(e.target.value))}
                  className={inputCls}
                  placeholder="10-digit mobile"
                  maxLength={15}
                  required
                />
                <p className="mt-1 text-[11px] text-stone-400">
                  OTP for Store ↔ HO handoff is sent to this mobile and the email above.
                </p>
              </div>
            ) : null}

            {canLogin ? (
              <>
                <div>
                  <label htmlFor="uc-emp-code" className={labelCls}>Employee Number *</label>
                  <input
                    id="uc-emp-code"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(sanitizeAlphanumericInput(e.target.value, 24).toUpperCase())}
                    className={inputCls}
                    autoComplete="off"
                    placeholder="EMP001"
                  />
                  <p className="mt-1 text-[11px] text-stone-400">Sign in with username or work email (not employee number).</p>
                </div>
                <div>
                  <label htmlFor="uc-password" className={labelCls}>Initial Password *</label>
                  <input
                    id="uc-password"
                    type="password"
                    minLength={4}
                    value={password}
                    onChange={(e) => setPassword(sanitizePasswordInput(e.target.value))}
                    className={inputCls}
                    autoComplete="new-password"
                    placeholder="Minimum 4 characters"
                  />
                </div>
              </>
            ) : (
              <div className="ui-span-full border border-dashed border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-500">
                Directory-only profile — no employee number or password yet. Enable login later to allow sign-in with username or work email.
              </div>
            )}
          </div>
        </div>

        {/* ── Section 4: Modules ── */}
        <div className="border border-rlx-rule bg-white p-5 mb-px">
          <SectionHeader step={4} title="Navigation Modules" />

          <label className="flex items-center gap-2.5 cursor-pointer mb-4">
            <input
              type="checkbox"
              className="h-4 w-4 accent-rlx-green"
              checked={useCustomModules}
              onChange={(e) => {
                const on = e.target.checked;
                setUseCustomModules(on);
                if (on) setSelectedModules([...ROLE_MODULE_ACCESS[role]]);
              }}
            />
            <span className="text-sm font-semibold text-stone-700">
              Override with custom module list
              <span className="ml-2 text-[11px] font-normal text-stone-400">(leave unchecked to use role defaults)</span>
            </span>
          </label>

          {useCustomModules ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {ALL_MODULE_KEYS.map((m) => {
                const active = selectedModules.includes(m);
                return (
                  <label
                    key={m}
                    className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-xs transition ${
                      active
                        ? "border-rlx-green bg-rlx-green/8 text-rlx-green font-semibold"
                        : "border-rlx-rule bg-stone-50 text-stone-400"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-rlx-green"
                      checked={active}
                      onChange={(ev) =>
                        setSelectedModules((prev) =>
                          ev.target.checked
                            ? Array.from(new Set([...prev, m]))
                            : prev.filter((x) => x !== m),
                        )
                      }
                    />
                    <span>{MODULE_LABELS[m]}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {defaultMods.map((m) => (
                <span
                  key={m}
                  className="border border-rlx-green/30 bg-rlx-green/5 px-2.5 py-1 text-[11px] font-medium text-rlx-green"
                >
                  {MODULE_LABELS[m] ?? m}
                </span>
              ))}
            </div>
          )}

          {customDiffersFromDefault && (
            <p className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Custom module list differs from role default — confirm this is intentional before creating.
            </p>
          )}
        </div>

        {/* ── Message + Submit ── */}
        <div className="border border-rlx-rule bg-white p-5">
          {formMessage && formMessage.type === "err" && (
            <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              ✕ {formMessage.text}
            </div>
          )}
          <button
            type="submit"
            disabled={adminBlocked}
            className="w-full bg-rlx-green py-3 text-sm font-semibold uppercase tracking-widest text-white transition hover:bg-rlx-green/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create User
          </button>
        </div>

      </form>

      {/* ── Success Popup Modal ── */}
      {createdUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)" }}
        >
          <div className="w-full max-w-sm bg-white shadow-2xl overflow-hidden">
            {/* Top bar */}
            <div className="bg-rlx-green px-6 py-5 text-center">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/40 bg-white/10">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-7 w-7 text-white">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-base font-semibold uppercase tracking-[0.15em] text-white">User Created</h2>
            </div>
            {/* Body */}
            <div className="px-6 py-5 text-center">
              <p className="text-lg font-semibold text-stone-800">{createdUser.name}</p>
              <p className="mt-1 text-sm text-stone-500">Employee No: <span className="font-mono font-medium text-stone-700">{createdUser.employeeCode}</span></p>
              <p className="text-sm text-stone-500 mt-0.5">Role: <span className="font-medium text-stone-700">{createdUser.role}</span></p>
              <p className="mt-4 text-xs text-stone-400">The new account is ready. You can create another user or close this dialog.</p>
            </div>
            {/* Footer */}
            <div className="flex gap-3 border-t border-rlx-rule bg-rlx-bg px-6 py-4 justify-center">
              <button
                type="button"
                onClick={() => setCreatedUser(null)}
                className="bg-rlx-green px-8 py-2.5 text-sm font-semibold text-white hover:bg-rlx-green/90 transition"
              >
                Create Another
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
