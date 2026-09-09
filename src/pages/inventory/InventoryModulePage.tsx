import { FormPageShell } from "../../components/layout/FormPageShell";

export function InventoryModulePage() {
  return (
    <FormPageShell breadcrumb="Inventory" title="Inventory" description="Spares, stock, purchase orders, GRN, and HO-to-store transfer.">
      <p className="text-[11px] text-rlx-ink-muted">Use the sidebar to open inventory screens.</p>
    </FormPageShell>
  );
}
