import type { Supplier, SupplierLocation } from "../../types/supplier";

export function supplierBranches(supplier: Supplier | null | undefined): Array<SupplierLocation & { id: string }> {
  return (supplier?.locations ?? []).filter((l): l is SupplierLocation & { id: string } => Boolean(l.id));
}

export function supplierNeedsBranch(supplier: Supplier | null | undefined): boolean {
  return supplierBranches(supplier).length > 1;
}

export function branchLabel(l: SupplierLocation, idx: number): string {
  const addr = [l.place, l.district, l.pinCode].filter(Boolean).join(", ");
  const name = l.branchName || `Branch ${idx + 1}`;
  return addr ? `${name} — ${addr}` : name;
}

export function findSupplierBranch(
  supplier: Supplier | null | undefined,
  branchId: string | null | undefined,
): SupplierLocation | null {
  if (!branchId) return null;
  return supplierBranches(supplier).find((l) => l.id === branchId) ?? null;
}

/** Rendered only when the supplier has more than one branch sharing its GSTIN. */
export function SupplierBranchSelect({
  supplier,
  value,
  onChange,
  className,
  labelClassName,
  disabled,
}: {
  supplier: Supplier | null | undefined;
  value: string;
  onChange: (branchId: string) => void;
  className?: string;
  labelClassName?: string;
  disabled?: boolean;
}) {
  const branches = supplierBranches(supplier);
  if (branches.length < 2) return null;
  return (
    <div>
      <label className={labelClassName ?? "block text-[11px] font-semibold uppercase tracking-widest text-stone-500"}>
        Supplier branch *
      </label>
      <select
        className={
          className ??
          "mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-rlx-green"
        }
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select branch…</option>
        {branches.map((b, i) => (
          <option key={b.id} value={b.id}>
            {branchLabel(b, i)}
          </option>
        ))}
      </select>
    </div>
  );
}
