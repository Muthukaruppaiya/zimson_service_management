import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, useVisibleUsers } from "../context/AuthContext";
import { useRegions } from "../context/RegionsContext";
import type { ModuleKey, UserRole } from "../types/user";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";

const ALL_MODULES: ModuleKey[] = [
  "dashboard",
  "service",
  "inventory",
  "service_centre",
  "regions",
  "users",
  "settings",
];

const ROLE_OPTIONS: Array<{ value: UserRole; label: string; scope: "HO" | "STORE" | "BOTH" }> = [
  { value: "ho_admin", label: "HO Admin (settings/admin)", scope: "HO" },
  { value: "ho_manager", label: "HO Manager (PR/PO/report/stock)", scope: "HO" },
  { value: "ho_supervisor", label: "HO Supervisor (DC receive/distribution)", scope: "HO" },
  { value: "ho_user", label: "HO User (PO conversion from PR)", scope: "HO" },
  { value: "ho_accounts", label: "HO Accounts", scope: "HO" },
  { value: "store_user", label: "Store User (quick bill, SRF, DC to HO)", scope: "STORE" },
  { value: "store_purchase_user", label: "Store Purchase User (PR + inward)", scope: "STORE" },
  { value: "store_manager", label: "Store Manager (PR approval + reports)", scope: "STORE" },
  { value: "store_accounts", label: "Store Accounts", scope: "STORE" },
  { value: "regional_admin", label: "Regional Admin (legacy)", scope: "BOTH" },
  { value: "super_admin", label: "Super Admin (legacy)", scope: "BOTH" },
  { value: "technician", label: "Technician (employee, no login)", scope: "HO" },
  { value: "service_centre_clerk", label: "Service centre clerk (logistics + desk)", scope: "HO" },
  { value: "service_centre_supervisor", label: "Service centre supervisor (assign / decisions)", scope: "HO" },
  { value: "service_centre_inward", label: "Service centre inward only (DC receive)", scope: "HO" },
  { value: "service_centre_outward", label: "Service centre outward only (ODC dispatch)", scope: "HO" },
];

function roleLabel(role: UserRole) {
  return ROLE_OPTIONS.find((x) => x.value === role)?.label ?? role;
}

const inputCls =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2";

export function UsersPrivilegesPage() {
  const { user, createUser } = useAuth();
  const visibleUsers = useVisibleUsers();
  const { regions } = useRegions();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("store_user");
  const [regionId, setRegionId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [canLogin, setCanLogin] = useState(true);
  const [selectedModules, setSelectedModules] = useState<ModuleKey[]>(["dashboard", "service", "inventory"]);
  const [formMessage, setFormMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const canManageUsers =
    user?.role === "super_admin" || user?.role === "regional_admin" || user?.role === "ho_admin";
  const canCreateUsers = user?.role === "super_admin" || user?.role === "ho_admin";
  const isStoreRole = role.startsWith("store_");

  const regionOptions = useMemo(() => {
    if (!user) return [];
    if (user.role === "regional_admin" && user.regionId) return regions.filter((r) => r.id === user.regionId);
    return regions;
  }, [user, regions]);

  const storesForRegion = useMemo(
    () => regions.find((x) => x.id === regionId)?.stores ?? [],
    [regions, regionId],
  );

  useEffect(() => {
    if (user?.role === "regional_admin" && user.regionId) setRegionId(user.regionId);
  }, [user]);

  useEffect(() => {
    if (role === "technician") {
      setCanLogin(false);
      setSelectedModules(["dashboard"]);
    }
  }, [role]);

  if (!canManageUsers || !user) {
    return (
      <div>
        <PageHeader title="Users & privileges" description="You do not have access to user management." />
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormMessage(null);
    const actor = user;
    if (!actor) return;
    const resolvedRegionId = actor.role === "regional_admin" ? actor.regionId ?? "" : regionId;
    if (!resolvedRegionId) {
      setFormMessage({ type: "err", text: "Select a region." });
      return;
    }
    if (isStoreRole && !storeId) {
      setFormMessage({ type: "err", text: "Select a store for store roles." });
      return;
    }
    if (canLogin && (!email.trim() || password.length < 4)) {
      setFormMessage({ type: "err", text: "Login users need email and password (min 4)." });
      return;
    }
    const result = await createUser({
      email,
      displayName,
      password,
      role,
      regionId: resolvedRegionId,
      storeId: isStoreRole ? storeId : null,
      canLogin,
      moduleAccessOverride: selectedModules,
    });
    if (result.ok) {
      setFormMessage({ type: "ok", text: "User created with role + module access customization." });
      setEmail("");
      setDisplayName("");
      setPassword("");
      setStoreId("");
    } else {
      setFormMessage({ type: "err", text: result.message });
    }
  }

  return (
    <div>
      <PageHeader
        title="Users & privileges"
        description="Create HO and Store roles, set login/no-login profile, and customize module access per user."
      />

      <div className="grid gap-8 lg:grid-cols-5">
        {canCreateUsers ? (
        <Card title="Create user" subtitle="Role + module customization" className="lg:col-span-2">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="new-role" className="text-xs font-medium text-stone-600">
                Role
              </label>
              <select id="new-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={inputCls}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {user.role !== "regional_admin" ? (
              <div>
                <label htmlFor="new-region" className="text-xs font-medium text-stone-600">Region</label>
                <select
                  id="new-region"
                  value={regionId}
                  onChange={(e) => {
                    setRegionId(e.target.value);
                    setStoreId("");
                  }}
                  className={inputCls}
                >
                  <option value="">Select region</option>
                  {regionOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-stone-500">
                  Need setup? <Link to="/regions" className="font-medium text-zimson-800 underline">Regions &amp; stores</Link>
                </p>
              </div>
            ) : null}

            {isStoreRole ? (
              <div>
                <label htmlFor="new-store" className="text-xs font-medium text-stone-600">Store</label>
                <select id="new-store" value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputCls}>
                  <option value="">Select store</option>
                  {storesForRegion.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label htmlFor="new-name" className="text-xs font-medium text-stone-600">Display name</label>
              <input id="new-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} />
            </div>

            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={canLogin} onChange={(e) => setCanLogin(e.target.checked)} disabled={role === "technician"} />
              Login enabled (disable for employee-only profile)
            </label>

            {canLogin ? (
              <>
                <div>
                  <label htmlFor="new-email" className="text-xs font-medium text-stone-600">Email (login)</label>
                  <input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="new-password" className="text-xs font-medium text-stone-600">Initial password</label>
                  <input id="new-password" type="password" minLength={4} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
                </div>
              </>
            ) : null}

            <div>
              <p className="text-xs font-medium text-stone-600">Module access customization</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {ALL_MODULES.map((m) => (
                  <label key={m} className="flex items-center gap-2 rounded-lg border border-zimson-200 bg-zimson-50/60 px-2 py-1.5 text-xs text-stone-700">
                    <input
                      type="checkbox"
                      checked={selectedModules.includes(m)}
                      onChange={(e) =>
                        setSelectedModules((prev) =>
                          e.target.checked ? Array.from(new Set([...prev, m])) : prev.filter((x) => x !== m),
                        )
                      }
                    />
                    {m}
                  </label>
                ))}
              </div>
            </div>

            {formMessage ? (
              <p className={formMessage.type === "ok" ? "rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200" : "rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200"}>
                {formMessage.text}
              </p>
            ) : null}

            <button type="submit" className="w-full rounded-xl bg-zimson-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700">
              Create user
            </button>
          </form>
        </Card>
        ) : (
          <Card title="Create user" subtitle="Restricted" className="lg:col-span-2">
            <p className="text-sm text-stone-600">
              Only Super Admin or HO Admin can create new accounts. You can still review the directory on the right.
            </p>
          </Card>
        )}

        <Card title="User directory" subtitle="Roles + scope + login state" className="lg:col-span-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zimson-200 text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Region</th>
                  <th className="py-2 pr-3 font-medium">Store</th>
                  <th className="py-2 pr-3 font-medium">Login</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((u) => (
                  <tr key={u.id} className="border-b border-zimson-100 last:border-0">
                    <td className="py-2 pr-3 font-medium text-stone-900">{u.displayName}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-stone-600">{u.email}</td>
                    <td className="py-2 pr-3 text-stone-800">{roleLabel(u.role)}</td>
                    <td className="py-2 pr-3 text-stone-600">{u.regionId ? regions.find((r) => r.id === u.regionId)?.name ?? u.regionId : "—"}</td>
                    <td className="py-2 pr-3 text-stone-600">
                      {u.storeId
                        ? regions.flatMap((r) => r.stores).find((s) => s.id === u.storeId)?.name ?? u.storeId
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 text-stone-600">{u.canLogin === false ? "No" : "Yes"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

