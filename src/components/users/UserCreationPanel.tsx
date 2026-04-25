import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { ROLE_MODULE_ACCESS } from "../../config/moduleAccess";
import type { ModuleKey, UserRole } from "../../types/user";
import {
  ALL_MODULE_KEYS,
  CREATION_POLICY_BULLETS,
  MODULE_LABELS,
  ROLE_CREATION_META,
  creatableRolesForActor,
  effectiveModuleAccess,
  isStoreRole,
} from "../../lib/userCreationPolicy";

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
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("store_user");
  const [regionId, setRegionId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [canLogin, setCanLogin] = useState(true);
  const [useCustomModules, setUseCustomModules] = useState(false);
  const [selectedModules, setSelectedModules] = useState<ModuleKey[]>(() => [...ROLE_MODULE_ACCESS["store_user"]]);
  const [formMessage, setFormMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [policyOpen, setPolicyOpen] = useState(true);

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
    if (!storeRole || !storeId || !regionId) return true;
    return storesForRegion.some((s) => s.id === storeId);
  }, [storeRole, storeId, regionId, storesForRegion]);

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
    if (storeRole && !storeId) {
      setFormMessage({ type: "err", text: "Store roles require a store under that region." });
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
    if (canLogin && (!email.trim() || password.length < 4)) {
      setFormMessage({ type: "err", text: "Login-enabled users need a unique email and password (minimum 4 characters)." });
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
      email,
      displayName,
      password,
      role,
      regionId: resolvedRegionId,
      storeId: storeRole ? storeId : null,
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
      setDisplayName("");
      setPassword("");
      setStoreId("");
      setUseCustomModules(false);
    } else {
      setFormMessage({ type: "err", text: result.message });
    }
  };

  if (!user) return null;

  const hoAdminBlocked = user.role === "ho_admin" && !user.regionId;

  return (
    <div className="space-y-5">
      {hoAdminBlocked ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Your HO Admin profile has no <strong className="font-semibold">region</strong> assigned. The server will reject user
          creation until your account is linked to an HO region (see Super Admin / data setup).
        </div>
      ) : null}
      <div className="rounded-xl border border-amber-200/90 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
        <button
          type="button"
          onClick={() => setPolicyOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 text-left font-semibold text-amber-950"
        >
          <span>Who can create users &amp; what the app enforces</span>
          <span className="text-xs font-normal opacity-80">{policyOpen ? "Hide" : "Show"}</span>
        </button>
        {policyOpen ? (
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-amber-950/95">
            {CREATION_POLICY_BULLETS.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <form onSubmit={handleCreate} className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className={sectionCls}>
            <h3 className="text-sm font-semibold text-stone-900">1. Role &amp; description</h3>
            <p className="mt-1 text-xs text-stone-600">Pick a role first; scope and defaults follow from it.</p>
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
            <p className="mt-1 text-xs text-stone-600">
              {user.role === "ho_admin"
                ? "Your HO Admin account is fixed to your HO region; new users are created only in this region."
                : "Region is the HO boundary. Store roles also need a store in that region."}
            </p>
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
                <p className="mt-1 text-xs text-stone-500">
                  Manage master data in{" "}
                  <Link to="/regions" className="font-medium text-zimson-800 underline">
                    Regions &amp; stores
                  </Link>
                  .
                </p>
              </div>
            ) : null}

            {storeRole ? (
              <div className="mt-3">
                <label htmlFor="uc-store" className="text-xs font-medium text-stone-600">
                  Store
                </label>
                <select id="uc-store" value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputCls}>
                  <option value="">Select store</option>
                  {storesForRegion.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="mt-3 text-xs text-stone-500">This role is not store-bound; store stays empty.</p>
            )}
          </div>

          <div className={sectionCls}>
            <h3 className="text-sm font-semibold text-stone-900">3. Identity &amp; sign-in</h3>
            <div className="mt-3">
              <label htmlFor="uc-name" className="text-xs font-medium text-stone-600">
                Display name <span className="text-red-600">*</span>
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
                  <label htmlFor="uc-email" className="text-xs font-medium text-stone-600">
                    Email (unique) <span className="text-red-600">*</span>
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
                    Initial password <span className="text-red-600">*</span>
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
            <p className="mt-1 text-xs text-stone-600">
              Default behaviour matches <code className="rounded bg-stone-100 px-1">ROLE_MODULE_ACCESS</code> for the chosen role.
              Custom list <strong className="font-semibold">replaces</strong> that list (it is not merged on top).
            </p>
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
                <dd className="font-medium text-stone-900">{storeRole ? storeName : "— (not applicable)"}</dd>
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
