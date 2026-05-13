import { useAuth } from "../context/AuthContext";
import { UserCreationPanel } from "../components/users/UserCreationPanel";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";

export function UsersPrivilegesPage() {
  const { user } = useAuth();
  const canCreateUsers = user?.role === "super_admin" || user?.role === "admin";

  if (!user) {
    return (
      <div>
        <PageHeader title="User creation" description="" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="User Creation"
        description="Create new staff accounts, assign roles and organisational scope."
      />
      {canCreateUsers ? (
        <UserCreationPanel />
      ) : (
        <div className="border border-rlx-rule bg-white px-6 py-8 text-center text-sm text-stone-500">
          Only Super Admin and Admin can create users.
        </div>
      )}
    </div>
  );
}
