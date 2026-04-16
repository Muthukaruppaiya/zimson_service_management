import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";

export function InventoryPurchaseRequestsPage() {
  const { user } = useAuth();
  const isStore = user?.role === "store_user";
  const isHo = user?.role === "regional_admin" || user?.role === "super_admin";

  return (
    <div>
      <InventoryBreadcrumb current="Purchase requests" />
      <PageHeader
        title="Purchase requests (PR)"
        description="Store raises material needs; HO receives them in the same regional bucket. No PO is created until HO converts an approved PR."
        actions={
          <Link
            to="/inventory"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Inventory home
          </Link>
        }
      />

      {isStore ? (
        <Card title="New PR from this store" subtitle="Lines will attach to vendor catalogue later" className="mb-8">
          <p className="text-sm text-stone-600">
            Submit spare lines with qty and reason; PR is sent to your <strong>regional HO</strong> only — other
            regions do not see it.
          </p>
          <div className="mt-4 rounded-xl border border-dashed border-zimson-300/80 bg-zimson-50/40 px-4 py-8 text-center text-sm text-stone-500">
            Form: lines · needed-by · notes — wireframe (Save as draft / Submit to HO)
          </div>
        </Card>
      ) : null}

      {isHo ? (
        <Card title="HO — PR inbox" subtitle="Approve, reject, or ask revision before PO">
          <p className="text-sm text-stone-600">
            Regional admin sees PRs from every store in their office. Super admin can filter by region. After
            approval, use <Link className="font-medium text-zimson-800 underline" to="/inventory/purchase-orders">Purchase orders</Link>{" "}
            to convert lines to a PO.
          </p>
          <div className="mt-4 rounded-xl border border-dashed border-zimson-300/80 bg-zimson-50/40 px-4 py-8 text-center text-sm text-stone-500">
            Queue: PR# · store · lines · status — wireframe placeholder
          </div>
        </Card>
      ) : null}

      {!isStore && !isHo ? (
        <Card title="Access">
          <p className="text-sm text-stone-600">
            Sign in as a store user to raise PRs, or as regional / super admin to review HO inbox.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
