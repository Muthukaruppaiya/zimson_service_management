import { useAuth } from "../context/AuthContext";
import { UserCreationPanel } from "../components/users/UserCreationPanel";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";

export function UsersPrivilegesPage() {
  const { user } = useAuth();
  const canCreateUsers = user?.role === "super_admin" || user?.role === "ho_admin";

  if (!user) {
    return (
      <div>
        <PageHeader title="User creation" description="" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="User creation" description="" />
      {canCreateUsers ? (
        <Card title="Create user">
          <UserCreationPanel />
        </Card>
      ) : (
        <Card title="Create user">
          <p className="text-sm text-stone-600">Only Super Admin and HO Admin can create users.</p>
        </Card>
      )}
    </div>
  );
}
