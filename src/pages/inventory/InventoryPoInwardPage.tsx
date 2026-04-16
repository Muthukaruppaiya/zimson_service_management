import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";

export function InventoryPoInwardPage() {
  return (
    <div>
      <InventoryBreadcrumb current="PO inward / GRN" />
      <PageHeader
        title="Goods receipt against PO"
        description="Post physical receipt to stock: capture supplier tax invoice where required, or use the without-bill fast path only when purchase value is within ₹10,000 and policy allows it."
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
        <Card title="With bill (tax invoice)" subtitle="GST / tax lines · HSN · ITC where applicable">
          <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
            <li>Select PO and vendor invoice number.</li>
            <li>Enter taxable value, CGST/SGST or IGST split per line.</li>
            <li>Attach scanned PDF; GRN updates store or HO stock as configured.</li>
          </ul>
          <div className="mt-4 rounded-xl border border-dashed border-zimson-300/80 bg-zimson-50/40 px-4 py-6 text-center text-sm text-stone-500">
            GRN + tax form — wireframe placeholder
          </div>
        </Card>

        <Card title="Without bill entry" subtitle="Capped at ₹10,000 — policy controlled">
          <p className="text-sm text-stone-600">
            For small local purchases where a formal tax invoice is not available: single voucher with reason
            code, approver, and <strong>hard ceiling ₹10,000</strong> per transaction (configurable later). Audit
            trail mandatory; no ITC claim path from this voucher.
          </p>
          <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-4 text-sm text-amber-950">
            UI will block save if line total or header total exceeds the cap. Regional rules may disable this
            path entirely.
          </div>
          <div className="mt-4 rounded-xl border border-dashed border-zimson-300/80 bg-zimson-50/40 px-4 py-6 text-center text-sm text-stone-500">
            Compact receipt form — wireframe placeholder
          </div>
        </Card>
      </div>

      <Card title="Stock impact" subtitle="Store vs HO receiving" className="mt-8">
        <p className="text-sm text-stone-600">
          Inward destination can be <strong>HO central stock</strong> or <strong>direct to store</strong> per PO
          line — each treated as a separate inventory bucket (same SKU, different location/owner).
        </p>
      </Card>
    </div>
  );
}
