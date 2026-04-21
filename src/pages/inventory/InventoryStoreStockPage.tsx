import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";

export function InventoryStoreStockPage() {
  const { user } = useAuth();

  return (
    <div>
      <InventoryBreadcrumb current="Store stock" />
      <PageHeader
        title="Store stock — spares & service watches"
        description={`Scoped to your store (${user?.displayName ?? "user"}).`}
        actions={
          <Link
            to="/inventory"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Inventory home
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Spares on hand" subtitle="By SKU / bin — store level">
          <p className="text-sm text-stone-600">
            Issue to technician jobs, reserve against open SRFs, and receive from PO inward or inter-store
            transfer. Negative stock blocked at save.
          </p>
          <div className="mt-4 rounded-xl border border-dashed border-zimson-300/80 bg-zimson-50/40 px-4 py-8 text-center text-sm text-stone-500">
            No stock rows to display.
          </div>
        </Card>

        <Card title="Service watches in custody" subtitle="Not for retail sale">
          <p className="text-sm text-stone-600">
            Watches at the counter for repair / waiting customer — tracked separately from showroom inventory
            and linked to service requests where applicable.
          </p>
          <div className="mt-4 rounded-xl border border-dashed border-zimson-300/80 bg-zimson-50/40 px-4 py-8 text-center text-sm text-stone-500">
            No watches in custody to display.
          </div>
        </Card>
      </div>
    </div>
  );
}
