import type { ServiceInvoiceLineView, ServiceInvoiceViewModel } from "../types/serviceInvoice";
import { formatPrintedHsnSac } from "./hsnGst";

const NON_SPARE_DESC_RE = /labour|service\s*\/\s*repair|service charge|brand repair/i;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function spareDisplayName(line: ServiceInvoiceLineView): string {
  const raw = line.description.trim();
  const withoutCode = raw.replace(/\s*\(([^)]+)\)\s*$/, "").trim();
  return withoutCode || raw;
}

/** Spare part lines are collapsed on the customer copy; labour / other charges stay separate. */
export function isSpareInvoiceLine(line: ServiceInvoiceLineView): boolean {
  if (line.lineKind === "service") return false;
  if (line.lineKind === "spare") return true;
  if (line.isSpareLine === false) return false;
  if (NON_SPARE_DESC_RE.test(line.description)) return false;
  if (line.isSpareLine === true) return true;
  if (line.spareCode?.trim()) return true;
  // Quick Bill + SRF: any remaining billed item is a part line (not labour).
  return true;
}

function collapseSpareLines(spareLines: ServiceInvoiceLineView[]): ServiceInvoiceLineView {
  const names = spareLines.map(spareDisplayName).filter(Boolean);
  const hsns: string[] = [];
  const seen = new Set<string>();
  for (const line of spareLines) {
    const raw = String(line.hsnSac ?? "").trim();
    const parts = raw.includes(",") ? raw.split(",") : [raw];
    for (const part of parts) {
      const h = formatPrintedHsnSac(part.trim());
      if (!h || seen.has(h)) continue;
      seen.add(h);
      hsns.push(h);
    }
  }
  const grossValue = round2(spareLines.reduce((sum, l) => sum + (Number(l.grossValue) || 0), 0));
  return {
    slNo: 1,
    spareCode: null,
    description: names.join(", "),
    hsnSac: hsns.join(", "),
    unitPrice: grossValue,
    qty: 1,
    grossValue,
    isSpareLine: true,
    lineKind: "spare",
  };
}

function renumberLines(lines: ServiceInvoiceLineView[]): ServiceInvoiceLineView[] {
  return lines.map((line, i) => ({ ...line, slNo: i + 1 }));
}

export function toInternalCopyInvoiceVm(vm: ServiceInvoiceViewModel): ServiceInvoiceViewModel {
  return { ...vm, copyKind: "internal" };
}

/**
 * Customer copy: all spare lines become one S.No row (names comma-separated, price cumulative).
 * Labour and other charges stay as their own rows. Tax totals are unchanged.
 */
export function toCustomerCopyInvoiceVm(vm: ServiceInvoiceViewModel): ServiceInvoiceViewModel {
  if (vm.copyKind === "customer") return vm;

  const spareLines = vm.lines.filter(isSpareInvoiceLine);
  const displayLines =
    spareLines.length === 0
      ? vm.lines
      : (() => {
          const collapsed = collapseSpareLines(spareLines);
          const out: ServiceInvoiceLineView[] = [];
          let inserted = false;
          for (const line of vm.lines) {
            if (isSpareInvoiceLine(line)) {
              if (!inserted) {
                out.push(collapsed);
                inserted = true;
              }
              continue;
            }
            out.push(line);
          }
          return out;
        })();

  const lines = renumberLines(displayLines);
  return {
    ...vm,
    copyKind: "customer",
    lines,
    totalQty: lines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0),
  };
}
