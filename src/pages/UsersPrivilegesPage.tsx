import { useMemo } from "react";
import { useAuth, useVisibleUsers } from "../context/AuthContext";
import { useRegions } from "../context/RegionsContext";
import { UserCreationPanel } from "../components/users/UserCreationPanel";
import { ROLE_CREATION_META } from "../lib/userCreationPolicy";
import type { UserRole } from "../types/user";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";

function roleLabel(role: UserRole) {
  return ROLE_CREATION_META.find((x) => x.value === role)?.label ?? role;
}

export function UsersPrivilegesPage() {
  const { user } = useAuth();
  const visibleUsers = useVisibleUsers();
  const { regions } = useRegions();

  const canManageUsers =
    user?.role === "super_admin" || user?.role === "regional_admin" || user?.role === "ho_admin";
  const canCreateUsers = user?.role === "super_admin" || user?.role === "ho_admin";

  const directorySubtitle = useMemo(() => {
    if (user?.role === "ho_admin") return "Users in your HO region only";
    if (user?.role === "regional_admin") return "Users in your region only";
    return "Roles, scope, and login state";
  }, [user?.role]);

  if (!canManageUsers || !user) {
    return (
      <div>
        <PageHeader title="Users & privileges" description="You do not have access to user management." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Users & privileges"
        description="Create accounts with clear HO vs store scope, optional custom navigation modules, and rules aligned with the server."
      />

      <div className="grid gap-8 lg:grid-cols-5">
        {canCreateUsers ? (
          <Card
            title="Create user"
            subtitle="Guided setup — policy, scope, identity, modules, live summary"
            className="lg:col-span-2"
          >
            <UserCreationPanel />
          </Card>
        ) : (
          <Card title="Create user" subtitle="Restricted" className="lg:col-span-2">
            <p className="text-sm text-stone-600">
              Only <strong className="font-semibold">Super Admin</strong> or <strong className="font-semibold">HO Admin</strong> can
              create new accounts. As a Regional Admin you can review the directory for your region on the right, but you cannot add
              users from this screen.
            </p>
            <p className="mt-3 text-xs text-stone-500">
              Ask an HO Admin in your region or Super Admin to create accounts, or use an HO Admin / Super Admin login to open this
              page.
            </p>
          </Card>
        )}

        <Card title="User directory" subtitle={directorySubtitle} className="lg:col-span-3">
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
                      {u.storeId ? regions.flatMap((r) => r.stores).find((s) => s.id === u.storeId)?.name ?? u.storeId : "—"}
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
