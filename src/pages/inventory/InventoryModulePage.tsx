import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";

const primary =
  "inline-flex w-full items-center justify-center rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 sm:w-auto";
const secondary =
  "inline-flex w-full items-center justify-center rounded-xl border border-zimson-300 bg-zimson-50 py-2.5 text-sm font-semibold text-zimson-900 transition hover:bg-zimson-100 sm:w-auto";

const flowSteps = [
  "Store maintains spares + customer service watches at store level.",
  "Store raises a purchase request (PR) → received at HO for the region.",
  "HO converts approved PR lines into a purchase order (PO) to vendor.",
  "Goods receipt: inward quantities against the PO — with tax invoice, or bill-free entry capped at ₹10,000 per policy.",
  "Spare selling / issue rates: maintained in the regional price-fixing screen (same SKU, different region).",
];

export function InventoryModulePage() {
  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Spares and service watches at store; procurement chain PR → PO → inward with GST-compliant bills or small-value without-bill caps; regional spare price lists."
        actions={
          <Link
            to="/"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Dashboard
          </Link>
        }
      />

      <Card title="End-to-end flow" subtitle="Inventory movement and controls" className="mb-8">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-stone-700">
          {flowSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Spare catalogue" subtitle="Master data + add new SKU">
          <p className="text-sm text-stone-600">Central spare master used by PR/PO, price fixing, and stock.</p>
          <Link to="/inventory/spares" className={`${primary} mt-4`}>
            Open spare master
          </Link>
        </Card>

        <Card title="Store stock" subtitle="Spares + service watches">
          <p className="text-sm text-stone-600">
            On-hand spares by bin/location and watches held for service (separate from saleable stock).
          </p>
          <Link to="/inventory/store-stock" className={`${secondary} mt-4`}>
            Open store stock
          </Link>
        </Card>

        <Card title="Stock & prices by location" subtitle="Spare-wise HO/store quantities and regional brand prices">
          <p className="text-sm text-stone-600">
            Read-only overview: each spare shows stock rows by location and price lines for your region (super admin
            can filter region).
          </p>
          <Link to="/inventory/stock-prices" className={`${primary} mt-4`}>
            Open stock &amp; prices
          </Link>
        </Card>

        <Card title="Purchase requests" subtitle="Store → HO">
          <p className="text-sm text-stone-600">
            Store users submit PRs; HO inbox shows all PRs for that regional office.
          </p>
          <Link to="/inventory/purchase-requests" className={`${primary} mt-4`}>
            Purchase requests
          </Link>
        </Card>

        <Card title="Suppliers" subtitle="Vendor master for PO">
          <p className="text-sm text-stone-600">Add and edit suppliers; PO creation picks an active supplier.</p>
          <Link to="/inventory/suppliers" className={`${secondary} mt-4`}>
            Suppliers
          </Link>
        </Card>

        <Card title="Purchase orders" subtitle="HO converts PR → PO">
          <p className="text-sm text-stone-600">
            Approve vendor, quantities, and rates; PO is the legal document for inward and GRN matching.
          </p>
          <Link to="/inventory/purchase-orders" className={`${primary} mt-4`}>
            Purchase orders
          </Link>
        </Card>

        <Card title="PO inward / GRN" subtitle="Bill + tax vs without bill ≤ ₹10k">
          <p className="text-sm text-stone-600">
            Post goods against PO lines: full tax invoice capture, or a controlled without-bill path for purchases under ₹10,000.
          </p>
          <Link to="/inventory/po-inward" className={`${primary} mt-4`}>
            Goods receipt
          </Link>
        </Card>

        <Card title="Spare price fixing" subtitle="Per regional HO — uses catalogue SKUs">
          <p className="text-sm text-stone-600">
            List price, issue price to store, and tax class can differ by region for each spare row from the
            catalogue.
          </p>
          <Link to="/inventory/spare-price-fixing" className={`${secondary} mt-4`}>
            Regional prices
          </Link>
        </Card>
      </div>
    </div>
  );
}
