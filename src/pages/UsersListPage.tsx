import { useMemo } from "react";
import { useAuth, useVisibleUsers } from "../context/AuthContext";
import { useRegions } from "../context/RegionsContext";
import { ROLE_CREATION_META } from "../lib/userCreationPolicy";
import type { UserRole } from "../types/user";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";

function roleLabel(role: UserRole) {
  return ROLE_CREATION_META.find((x) => x.value === role)?.label ?? role;
}

function displayEmployeeCode(code: string) {
  return String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

export function UsersListPage() {
  const { user } = useAuth();
  const visibleUsers = useVisibleUsers();
  const { regions } = useRegions();
  const canManageUsers =
    user?.role === "super_admin" || user?.role === "regional_admin" || user?.role === "ho_admin";

  const directorySubtitle = useMemo(() => {
    if (user?.role === "ho_admin") return "Users in your HO region";
    if (user?.role === "regional_admin") return "Users in your region";
    return "All users";
  }, [user?.role]);

  if (!canManageUsers || !user) {
    return (
      <div>
        <PageHeader title="User list" description="" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="User list" description="" />
      <Card title="User directory" subtitle={directorySubtitle}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zimson-200 text-xs uppercase tracking-wide text-stone-500">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Employee No</th>
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
                  <td className="py-2 pr-3 font-mono text-xs text-stone-700">{displayEmployeeCode(u.employeeCode ?? u.id)}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-stone-600">{u.email}</td>
                  <td className="py-2 pr-3 text-stone-800">{roleLabel(u.role)}</td>
                  <td className="py-2 pr-3 text-stone-600">
                    {u.regionId ? regions.find((r) => r.id === u.regionId)?.name ?? u.regionId : "-"}
                  </td>
                  <td className="py-2 pr-3 text-stone-600">
                    {u.storeIds && u.storeIds.length > 0
                      ? u.storeIds
                          .map((storeId) => regions.flatMap((r) => r.stores).find((s) => s.id === storeId)?.name ?? storeId)
                          .join(", ")
                      : u.storeId
                        ? regions.flatMap((r) => r.stores).find((s) => s.id === u.storeId)?.name ?? u.storeId
                        : "-"}
                  </td>
                  <td className="py-2 pr-3 text-stone-600">{u.canLogin === false ? "No" : "Yes"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
