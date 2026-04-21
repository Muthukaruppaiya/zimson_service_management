import { Link } from "react-router-dom";
import { InventoryNavBar } from "../../components/inventory/InventoryNavBar";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";

const primary =
  "inline-flex w-full items-center justify-center rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 sm:w-auto";

const flowSteps = [
  "Store maintains spares + customer service watches at store level.",
  "Store raises a purchase request (PR) → received at HO for the region.",
  "HO converts approved PR lines into a purchase order (PO) to vendor.",
  "Goods receipt: inward quantities against the PO — with tax invoice, or bill-free entry capped at ₹10,000 per policy.",
  "Spare selling / issue rates: maintained in the regional price-fixing screen (same SKU, different region).",
];

const quickTiles = [
  { to: "/inventory/spares", title: "Spare catalogue", hint: "Master data + SKU setup", cta: "Open spare master" },
  { to: "/inventory/bulk-import", title: "Bulk import", hint: "Excel template → validate → import", cta: "Bulk import" },
  { to: "/inventory/brands", title: "Brands", hint: "Watch brands used across modules", cta: "Manage brands" },
  { to: "/inventory/store-stock", title: "Store stock", hint: "HO/store on-hand quantity", cta: "Open store stock" },
  { to: "/inventory/purchase-requests", title: "Purchase requests", hint: "Store to HO pipeline", cta: "Open PRs" },
  { to: "/inventory/purchase-orders", title: "Purchase orders", hint: "HO to supplier ordering", cta: "Open POs" },
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

      <InventoryNavBar />

      <Card
        title="Inventory command center"
        subtitle="Fast actions and visibility for stock, procurement and pricing"
        className="mb-6 overflow-hidden"
      >
        <div className="rounded-2xl bg-gradient-to-r from-zimson-900 via-zimson-800 to-zimson-700 p-5 text-zimson-50">
          <p className="text-sm/6">
            Use the inventory navbar for direct navigation. Keep stock healthy with bulk import, PR → PO → GRN flow,
            and region-wise pricing controls.
          </p>
        </div>
      </Card>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {quickTiles.map((tile) => (
          <Card key={tile.to} title={tile.title} subtitle={tile.hint}>
            <Link to={tile.to} className={`${primary} mt-4`}>
              {tile.cta}
            </Link>
          </Card>
        ))}
      </div>

      <Card title="End-to-end flow" subtitle="Inventory movement and controls" className="mb-8">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-stone-700">
          {flowSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Use navbar for navigation" subtitle="All inventory menus are now pinned at the top">
          <p className="text-sm text-stone-600">
            You can switch directly between Spares, Bulk Import, PR, PO, GRN, Suppliers, Allocation, and Pricing
            from the horizontal inventory navbar.
          </p>
        </Card>
        <Card title="Recommended daily order" subtitle="Quick working sequence">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-stone-700">
            <li>Maintain or import spare masters.</li>
            <li>Update region-wise prices and stock.</li>
            <li>Process PR → PO → GRN.</li>
            <li>Run allocation review for pending store demand.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
