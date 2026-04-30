import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { ROLE_MODULE_ACCESS } from "../../config/moduleAccess";
import type { ModuleKey, UserRole } from "../../types/user";
import { ALL_MODULE_KEYS, MODULE_LABELS, ROLE_CREATION_META, creatableRolesForActor, effectiveModuleAccess, isStoreRole } from "../../lib/userCreationPolicy";

const inputCls =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2";

const sectionCls = "rounded-xl border border-zimson-200/80 bg-white/60 p-4 shadow-sm";

function roleLabel(role: UserRole) {
  return ROLE_CREATION_META.find((x) => x.value === role)?.label ?? role;
}

export function UserCreationPanel() {
  const { user, createUser } = useAuth();
  const { regions } = useRegions();

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
  const [useCustomModules, setUseCustomModules] = useState(false);
  const [selectedModules, setSelectedModules] = useState<ModuleKey[]>(() => [...ROLE_MODULE_ACCESS["store_user"]]);
  const [formMessage, setFormMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const creatable = useMemo(() => creatableRolesForActor(user?.role), [user?.role]);
  const creatableSet = useMemo(() => new Set(creatable.map((r) => r.value)), [creatable]);

  useEffect(() => {
    if (!user) return;
    const allowed = creatableRolesForActor(user.role).map((r) => r.value);
    if (!allowed.includes(role)) {
      setRole(allowed[0] ?? "store_user");
    }
  }, [user, role]);

  useEffect(() => {
    if (user?.role === "ho_admin" && user.regionId) {
      setRegionId(user.regionId);
    }
  }, [user?.role, user?.regionId]);

  useEffect(() => {
    if (user?.role === "regional_admin" && user.regionId) setRegionId(user.regionId);
  }, [user?.role, user?.regionId]);

  useEffect(() => {
    if (role === "technician") {
      setCanLogin(false);
    }
  }, [role]);

  useEffect(() => {
    if (!useCustomModules) {
      setSelectedModules([...ROLE_MODULE_ACCESS[role]]);
    }
  }, [role, useCustomModules]);

  const regionOptions = useMemo(() => {
    if (!user) return [];
    if (user.role === "regional_admin" && user.regionId) return regions.filter((r) => r.id === user.regionId);
    if (user.role === "ho_admin" && user.regionId) return regions.filter((r) => r.id === user.regionId);
    return regions;
  }, [user, regions]);

  const storesForRegion = useMemo(() => regions.find((x) => x.id === regionId)?.stores ?? [], [regions, regionId]);

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

  const regionName = regionId ? regions.find((r) => r.id === regionId)?.name ?? regionId : "—";
  const storeName = storeId ? storesForRegion.find((s) => s.id === storeId)?.name ?? storeId : "—";

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

    const resolvedRegionId =
      actor.role === "regional_admin" ? actor.regionId ?? "" : actor.role === "ho_admin" ? actor.regionId ?? regionId : regionId;

    if (!resolvedRegionId) {
      setFormMessage({ type: "err", text: "Select a region (HO scope)." });
      return;
    }
    if (storeRole && storeIds.length === 0) {
      setFormMessage({ type: "err", text: "Store roles require at least one store under that region." });
      return;
    }
    if (storeRole && !validateStoreBelongsToRegion()) {
      setFormMessage({ type: "err", text: "The selected store must belong to the selected region." });
      return;
    }
    if (!creatableSet.has(role)) {
      setFormMessage({ type: "err", text: "Your role is not allowed to create this account type." });
      return;
    }
    if (canLogin && (!employeeCode.trim() || password.length < 4)) {
      setFormMessage({ type: "err", text: "Login-enabled users need employee number and password (minimum 4 characters)." });
      return;
    }
    if (useCustomModules && selectedModules.length === 0) {
      setFormMessage({
        type: "err",
        text: "Custom module list is empty. Either pick at least one module or switch back to “Role default”.",
      });
      return;
    }

    const moduleAccessOverride = useCustomModules ? selectedModules : null;

    const result = await createUser({
        employeeCode,
      email,
      displayName,
      password,
      role,
      regionId: resolvedRegionId,
        storeId: storeRole ? storeIds[0] ?? null : null,
        storeIds: storeRole ? storeIds : [],
      canLogin,
      moduleAccessOverride,
    });
    if (result.ok) {
      setFormMessage({
        type: "ok",
        text: useCustomModules
          ? "User created with a custom module list (replaces role defaults)."
          : "User created using role default modules.",
      });
      setEmail("");
      setEmployeeCode("");
      setDisplayName("");
      setPassword("");
      setStoreId("");
      setStoreIds([]);
      setStorePickerOpen(false);
      setUseCustomModules(false);
    } else {
      setFormMessage({ type: "err", text: result.message });
    }
  };

  if (!user) return null;

  const hoAdminBlocked = user.role === "ho_admin" && !user.regionId;

  return (
    <div className="space-y-5">
      {hoAdminBlocked ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">Region is not mapped for this HO admin account.</div> : null}

      <form onSubmit={handleCreate} className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className={sectionCls}>
            <h3 className="text-sm font-semibold text-stone-900">1. Role &amp; description</h3>
            <label htmlFor="uc-role" className="mt-3 block text-xs font-medium text-stone-600">
              Role
            </label>
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
              {creatable.some((r) => r.group === "system") ? (
                <optgroup label="System (Super Admin only)">
                  {creatable
                    .filter((r) => r.group === "system")
                    .map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                </optgroup>
              ) : null}
              <optgroup label="HO &amp; service centre">
                {creatable
                  .filter((r) => r.group === "ho")
                  .map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Store">
                {creatable
                  .filter((r) => r.group === "store")
                  .map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
              </optgroup>
            </select>
            {activeMeta ? <p className="mt-2 text-xs leading-relaxed text-stone-700">{activeMeta.summary}</p> : null}
          </div>

          <div className={sectionCls}>
            <h3 className="text-sm font-semibold text-stone-900">2. Organisation scope</h3>
            {user.role !== "regional_admin" ? (
              <div className="mt-3">
                <label htmlFor="uc-region" className="text-xs font-medium text-stone-600">
                  Region (HO)
                </label>
                <select
                  id="uc-region"
                  value={regionId}
                  disabled={user.role === "ho_admin" && !!user.regionId}
                  onChange={(e) => {
                    setRegionId(e.target.value);
                    setStoreId("");
                    setStoreIds([]);
                    setStorePickerOpen(false);
                  }}
                  className={inputCls + (user.role === "ho_admin" && user.regionId ? " opacity-80" : "")}
                >
                  <option value="">Select region</option>
                  {regionOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-stone-500">Manage regions and stores in <Link to="/regions" className="font-medium text-zimson-800 underline">Regions &amp; stores</Link>.</p>
              </div>
            ) : null}

            {storeRole ? (
              <div className="mt-3">
                <label htmlFor="uc-store" className="text-xs font-medium text-stone-600">
                  Stores (multiple allowed)
                </label>
                <div className="relative mt-1">
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
                    <span className="ml-3 text-xs text-stone-500">{storePickerOpen ? "Close" : "Open"}</span>
                  </button>
                  {storePickerOpen ? (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-zimson-200 bg-white p-2 shadow-lg">
                      {storesForRegion.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-stone-500">No stores available in selected region.</p>
                      ) : (
                        storesForRegion.map((s) => {
                          const checked = storeIds.includes(s.id);
                          return (
                            <label
                              key={s.id}
                              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-stone-700 hover:bg-zimson-50"
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
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-stone-500">Dropdown multi-select enabled. Tick required stores.</p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-stone-500">This role is not store-bound; store stays empty.</p>
            )}
          </div>

          <div className={sectionCls}>
            <h3 className="text-sm font-semibold text-stone-900">3. Identity &amp; sign-in</h3>
            <div className="mt-3">
              <label htmlFor="uc-name" className="text-xs font-medium text-stone-600">
                Display name
              </label>
              <input
                id="uc-name"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={inputCls}
                placeholder="As it should appear in the directory"
              />
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={canLogin}
                onChange={(e) => setCanLogin(e.target.checked)}
                disabled={role === "technician"}
              />
              <span>
                <span className="font-medium">Login enabled</span>
                <span className="block text-xs text-stone-500">
                  Off = directory-only (no sign-in). Technician always has login off in this app.
                </span>
              </span>
            </label>
            {canLogin ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="uc-emp-code" className="text-xs font-medium text-stone-600">
                    Employee number
                  </label>
                  <input
                    id="uc-emp-code"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    className={inputCls}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="uc-email" className="text-xs font-medium text-stone-600">
                    Email (optional)
                  </label>
                  <input
                    id="uc-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="uc-password" className="text-xs font-medium text-stone-600">
                    Initial password
                  </label>
                  <input
                    id="uc-password"
                    type="password"
                    minLength={4}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-stone-500">No email or password required; the server assigns a placeholder email.</p>
            )}
          </div>

          <div className={sectionCls}>
            <h3 className="text-sm font-semibold text-stone-900">4. Navigation (modules)</h3>
            <label className="mt-3 flex items-start gap-2 text-sm text-stone-800">
              <input
                type="checkbox"
                className="mt-1"
                checked={useCustomModules}
                onChange={(e) => {
                  const on = e.target.checked;
                  setUseCustomModules(on);
                  if (on) setSelectedModules([...ROLE_MODULE_ACCESS[role]]);
                }}
              />
              <span>
                <span className="font-medium">Use custom module list</span>
                <span className="block text-xs font-normal text-stone-500">Leave unchecked to keep role defaults (recommended).</span>
              </span>
            </label>
            {useCustomModules ? (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ALL_MODULE_KEYS.map((m) => (
                  <label
                    key={m}
                    className="flex items-center gap-2 rounded-lg border border-zimson-200 bg-zimson-50/60 px-2 py-2 text-xs text-stone-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedModules.includes(m)}
                      onChange={(ev) =>
                        setSelectedModules((prev) =>
                          ev.target.checked ? Array.from(new Set([...prev, m])) : prev.filter((x) => x !== m),
                        )
                      }
                    />
                    <span>{MODULE_LABELS[m]}</span>
                    <span className="ml-auto font-mono text-[10px] text-stone-400">{m}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-stone-600">
                Effective modules:{" "}
                {defaultMods.map((m) => (
                  <span key={m} className="mr-1 inline-block rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-700">
                    {m}
                  </span>
                ))}
              </p>
            )}
            {customDiffersFromDefault ? (
              <p className="mt-2 text-xs text-amber-800">
                Custom list differs from the role default — confirm this is intentional before creating the user.
              </p>
            ) : null}
          </div>

          {formMessage ? (
            <p
              className={
                formMessage.type === "ok"
                  ? "rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200"
                  : "rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200"
              }
            >
              {formMessage.text}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={hoAdminBlocked}
            className="w-full rounded-xl bg-zimson-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create user
          </button>
        </div>

        <aside className="lg:col-span-2">
          <div className="sticky top-4 space-y-3 rounded-xl border border-zimson-200 bg-zimson-50/40 p-4 text-sm text-stone-800">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Summary</h3>
            <dl className="space-y-2 text-xs">
              <div>
                <dt className="text-stone-500">Role</dt>
                <dd className="font-medium text-stone-900">{roleLabel(role)}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Region</dt>
                <dd className="font-medium text-stone-900">{regionName}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Store</dt>
                <dd className="font-medium text-stone-900">
                  {storeRole
                    ? storeIds.length > 0
                      ? storeIds.map((id) => storesForRegion.find((s) => s.id === id)?.name ?? id).join(", ")
                      : storeName
                    : "— (not applicable)"}
                </dd>
              </div>
              <div>
                <dt className="text-stone-500">Login</dt>
                <dd className="font-medium text-stone-900">{canLogin ? "Yes" : "No (directory only)"}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Modules</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {effectiveMods.map((m) => (
                    <span
                      key={m}
                      className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-stone-700 ring-1 ring-stone-200"
                      title={MODULE_LABELS[m]}
                    >
                      {m}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
            <p className="border-t border-zimson-200/80 pt-2 text-[11px] leading-relaxed text-stone-600">
              After creation, the user appears in the directory. HO Admins only see users in their region. Super Admin sees everyone.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
