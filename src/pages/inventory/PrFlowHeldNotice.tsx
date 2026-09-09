import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";

export function PrFlowHeldNotice({ title }: { title: string }) {
  return (
    <div>
      <InventoryBreadcrumb current={title} />
      <PageHeader title={title} description="Purchase request flow is temporarily on hold." />
      <div className="border border-amber-200 bg-amber-50 px-6 py-8 text-sm text-amber-900">
        <p className="font-semibold">Store PR is not in use right now.</p>
        <p className="mt-2 text-amber-800">
          HO Purchase creates the PO first, posts GRN into HO stock, then transfers from HO to the store. Transfers are
          not against a PR.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/inventory/purchase-orders" className="font-semibold text-rlx-green hover:underline">
            New PO →
          </Link>
          <Link to="/inventory/po-inward" className="font-semibold text-rlx-green hover:underline">
            Post GRN →
          </Link>
          <Link to="/inventory/ho-transfer" className="font-semibold text-rlx-green hover:underline">
            Transfer to store →
          </Link>
        </div>
      </div>
    </div>
  );
}
