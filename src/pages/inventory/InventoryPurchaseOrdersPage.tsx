import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";

export function InventoryPurchaseOrdersPage() {
  const { user } = useAuth();
  const isHo = user?.role === "regional_admin" || user?.role === "super_admin";

  return (
    <div>
      <InventoryBreadcrumb current="Purchase orders" />
      <PageHeader
        title="Purchase orders (PO)"
        description="HO-only: convert approved purchase request lines into a vendor PO. Stores do not issue POs."
        actions={
          <Link
            to="/inventory"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Inventory home
          </Link>
        }
      />

      {!isHo ? (
        <Card className="mb-6" title="Store view">
          <p className="text-sm text-stone-600">
            Purchase orders are created and released at HO. You can open this page to follow status; write
            actions appear for regional / super admin.
          </p>
        </Card>
      ) : null}

      <Card title="Create PO from PR" subtitle="Vendor · delivery address (HO or store) · terms">
        <p className="text-sm text-stone-600">
          Lines carry agreed rate and tax treatment; PO total feeds into{" "}
          <Link className="font-medium text-zimson-800 underline" to="/inventory/po-inward">
            goods receipt
          </Link>{" "}
          for three-way match (PO · GRN · invoice).
        </p>
        <div className="mt-4 rounded-xl border border-dashed border-zimson-300/80 bg-zimson-50/40 px-4 py-8 text-center text-sm text-stone-500">
          {isHo
            ? "Wizard: select PR → vendor → edit lines → release PO — wireframe placeholder"
            : "HO login required to use PO wizard in a later build."}
        </div>
      </Card>

      <Card title="Open & closed POs" className="mt-8">
        <div className="rounded-xl border border-dashed border-zimson-300/80 bg-zimson-50/40 px-4 py-8 text-center text-sm text-stone-500">
          List: PO# · vendor · status · received % — wireframe placeholder
        </div>
      </Card>
    </div>
  );
}
