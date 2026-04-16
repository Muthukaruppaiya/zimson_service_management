import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ROLE_MODULE_ACCESS } from "../config/moduleAccess";
import { useAuth, useVisibleUsers } from "../context/AuthContext";
import { useRegions } from "../context/RegionsContext";
import type { UserRole } from "../types/user";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";

function roleLabel(role: UserRole) {
  switch (role) {
    case "super_admin":
      return "Super Admin";
    case "regional_admin":
      return "Regional Admin";
    case "store_user":
      return "Store user";
    case "service_centre_clerk":
      return "SC inward";
    case "service_centre_supervisor":
      return "SC supervisor";
    case "technician":
      return "Technician";
    default:
      return role;
  }
}

export function UsersPrivilegesPage() {
  const { user, createUser } = useAuth();
  const visibleUsers = useVisibleUsers();
  const { regions } = useRegions();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"regional_admin" | "store_user">("store_user");
  const [regionId, setRegionId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [formMessage, setFormMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  const canManageUsers = user?.role === "super_admin" || user?.role === "regional_admin";

  const regionOptions = useMemo(() => {
    if (!user) return [];
    if (user.role === "super_admin") return regions;
    if (user.role === "regional_admin" && user.regionId) {
      return regions.filter((r) => r.id === user.regionId);
    }
    return [];
  }, [user, regions]);

  const storesForRegion = useMemo(() => {
    const r = regions.find((x) => x.id === regionId);
    return r?.stores ?? [];
  }, [regions, regionId]);

  useEffect(() => {
    if (user?.role === "regional_admin" && user.regionId) {
      setRegionId(user.regionId);
    }
  }, [user]);

  if (!canManageUsers || !user) {
    return (
      <div>
        <PageHeader
          title="Users & privileges"
          description="You do not have access to user management."
        />
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setFormMessage(null);
    const newRole = user.role === "regional_admin" ? "store_user" : role;
    const resolvedRegionId =
      user.role === "regional_admin" ? user.regionId! : regionId;
    if (user.role === "super_admin" && !resolvedRegionId.trim()) {
      setFormMessage({ type: "err", text: "Select a region." });
      return;
    }
    const resolvedStoreId = newRole === "store_user" ? storeId : null;
    const result = await createUser({
      email,
      displayName,
      password,
      role: newRole,
      regionId: resolvedRegionId,
      storeId: resolvedStoreId,
    });
    if (result.ok) {
      setFormMessage({ type: "ok", text: "User created. They can sign in with the password you set." });
      setEmail("");
      setDisplayName("");
      setPassword("");
      setStoreId("");
      if (user.role === "super_admin") setRole("store_user");
    } else {
      setFormMessage({ type: "err", text: result.message });
    }
  }

  const showRolePicker = user.role === "super_admin";
  const effectiveRole = user.role === "regional_admin" ? "store_user" : role;

  return (
    <div>
      <PageHeader
        title="Users & privileges"
        description={
          user.role === "super_admin"
            ? "Create Regional Admins and store users. Module access per role is driven by src/config/moduleAccess.ts."
            : "Create store users for your regional office only."
        }
      />

      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <Card title="Super Admin" subtitle="Seeded + full access">
          <p className="text-sm text-stone-600">
            All modules:{" "}
            {ROLE_MODULE_ACCESS.super_admin.map((m) => (
              <code key={m} className="mr-1 rounded bg-zimson-100 px-1 text-xs">
                {m}
              </code>
            ))}
          </p>
        </Card>
        <Card title="Regional Admin" subtitle="Office scope">
          <p className="text-sm text-stone-600">
            Modules:{" "}
            {ROLE_MODULE_ACCESS.regional_admin.map((m) => (
              <code key={m} className="mr-1 rounded bg-zimson-100 px-1 text-xs">
                {m}
              </code>
            ))}
          </p>
        </Card>
        <Card title="Store user" subtitle="Counter / staff">
          <p className="text-sm text-stone-600">
            Modules:{" "}
            {ROLE_MODULE_ACCESS.store_user.map((m) => (
              <code key={m} className="mr-1 rounded bg-zimson-100 px-1 text-xs">
                {m}
              </code>
            ))}
          </p>
          <p className="mt-2 text-xs text-stone-500">
            Adjust these lists when you define per-user modules — start from{" "}
            <code className="rounded bg-zimson-50 px-1">moduleAccess.ts</code>.
          </p>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        <Card
          title="Create user"
          subtitle={
            user.role === "super_admin"
              ? "Regional Admin or Store user"
              : "Store user only, in your region"
          }
          className="lg:col-span-2"
        >
          <form onSubmit={handleCreate} className="space-y-4">
            {showRolePicker ? (
              <div>
                <label htmlFor="new-role" className="text-xs font-medium text-stone-600">
                  Role
                </label>
                <select
                  id="new-role"
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value as "regional_admin" | "store_user")
                  }
                  className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2"
                >
                  <option value="regional_admin">Regional Admin</option>
                  <option value="store_user">Store user</option>
                </select>
              </div>
            ) : null}

            {user.role === "super_admin" ? (
              <div>
                <label htmlFor="new-region" className="text-xs font-medium text-stone-600">
                  Region
                </label>
                <select
                  id="new-region"
                  required
                  value={regionId}
                  onChange={(e) => {
                    setRegionId(e.target.value);
                    setStoreId("");
                  }}
                  className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2"
                >
                  <option value="">Select region</option>
                  {regionOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-stone-500">
                  Need a new office?{" "}
                  <Link to="/regions" className="font-medium text-zimson-800 underline">
                    Regions &amp; stores
                  </Link>
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-zimson-200 bg-zimson-50/60 px-3 py-2 text-sm text-stone-700">
                Region:{" "}
                <span className="font-semibold">
                  {regions.find((r) => r.id === user.regionId)?.name ?? user.regionId}
                </span>
              </div>
            )}

            {effectiveRole === "store_user" ? (
              <div>
                <label htmlFor="new-store" className="text-xs font-medium text-stone-600">
                  Store
                </label>
                <select
                  id="new-store"
                  required
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2"
                >
                  <option value="">Select store</option>
                  {(user.role === "regional_admin" ? regionOptions.find((r) => r.id === user.regionId)?.stores : storesForRegion)?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label htmlFor="new-email" className="text-xs font-medium text-stone-600">
                Email (login)
              </label>
              <input
                id="new-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2"
                placeholder="name@store.com"
              />
            </div>
            <div>
              <label htmlFor="new-name" className="text-xs font-medium text-stone-600">
                Display name
              </label>
              <input
                id="new-name"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2"
                placeholder="Full name"
              />
            </div>
            <div>
              <label htmlFor="new-password" className="text-xs font-medium text-stone-600">
                Initial password
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={4}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2"
                placeholder="Min 4 characters (demo)"
              />
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
              className="w-full rounded-xl bg-zimson-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Create user
            </button>
          </form>
        </Card>

        <Card
          title="User directory"
          subtitle="User directory"
          className="lg:col-span-3"
        >
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
            This table is a <strong>temporary</strong> demo. No server sync, no edit/delete, no privilege
            matrix yet. When your Node service is ready, swap this block for paginated search and role
            assignments.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zimson-200 text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Region</th>
                  <th className="py-2 font-medium">Store</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((u) => (
                  <tr key={u.id} className="border-b border-zimson-100 last:border-0">
                    <td className="py-2 pr-3 font-medium text-stone-900">{u.displayName}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-stone-600">{u.email}</td>
                    <td className="py-2 pr-3 text-stone-800">{roleLabel(u.role)}</td>
                    <td className="py-2 pr-3 text-stone-600">
                      {u.regionId
                        ? regions.find((r) => r.id === u.regionId)?.name ?? u.regionId
                        : "—"}
                    </td>
                    <td className="py-2 text-stone-600">
                      {u.storeId
                        ? regions
                            .flatMap((r) => r.stores.map((s) => ({ ...s, regionId: r.id })))
                            .find((s) => s.id === u.storeId)?.name ?? u.storeId
                        : "—"}
                    </td>
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
