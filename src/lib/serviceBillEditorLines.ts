import { billableLineAmount, billableServiceChargeInr } from "./natureOfRepair";
import type { ServiceBillGstLine } from "./serviceBillGst";
import type { SrfJob } from "../types/srfJob";

export type ServiceBillEditorLine = {
  id: string;
  description: string;
  amount: string;
  spareId?: string;
  hsn?: string | null;
  /** From supervisor spares slip — read-only on billing screen. */
  locked?: boolean;
};

export function brandInvoiceToEditorLine(job: SrfJob, defaultSacHsn: string): ServiceBillEditorLine {
  const ref = (job.brandInvoiceRef ?? "").trim();
  const amt = Number(job.brandInvoiceAmountInr ?? 0);
  const desc = ref ? `Brand repair invoice (${ref})` : "Brand repair invoice charges";
  return {
    id: `brand-invoice-${job.id}`,
    description: desc,
    amount: amt > 0 ? String(amt) : "",
    hsn: defaultSacHsn,
    locked: true,
  };
}

export function usedSparesToEditorLines(
  job: SrfJob,
  resolveHsn: (spareId: string | null | undefined) => string | null,
): ServiceBillEditorLine[] {
  return (job.usedSpares ?? []).map((s, i) => {
    const lineTotal = Number(s.lineTotalInr ?? NaN);
    const qty = Number(s.qty ?? 0);
    const unit = Number(s.unitPriceInr ?? 0);
    const amtRaw = Number.isFinite(lineTotal)
      ? lineTotal
      : (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(unit) ? unit : 0);
    const desc = s.qty > 1 ? `${s.name} x ${s.qty}` : s.name;
    return {
      id: `slip-${job.id}-${i}`,
      description: desc,
      amount: amtRaw > 0 ? String(amtRaw) : "",
      spareId: s.spareId ?? undefined,
      hsn: resolveHsn(s.spareId) ?? null,
      locked: true,
    };
  });
}

export function editorLineAmountInr(line: ServiceBillEditorLine): number {
  const n = Number.parseFloat(line.amount);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function editorLinesBillableSubtotal(
  lines: ServiceBillEditorLine[],
  natureOfRepair: string | null | undefined,
  serviceChargeInr: string,
): number {
  const lineSum = lines.reduce((sum, l) => {
    return sum + billableLineAmount(natureOfRepair, editorLineAmountInr(l), l.spareId);
  }, 0);
  const svcRaw = Number.parseFloat(serviceChargeInr);
  const svc = billableServiceChargeInr(
    natureOfRepair,
    Number.isFinite(svcRaw) && svcRaw > 0 ? svcRaw : 0,
  );
  return lineSum + svc;
}

export function editorLinesToGstLines(
  lines: ServiceBillEditorLine[],
  natureOfRepair: string | null | undefined,
  serviceChargeBillable: number,
  defaultSacHsn: string,
): ServiceBillGstLine[] {
  const gstLines: ServiceBillGstLine[] = [];
  for (const l of lines) {
    const billable = billableLineAmount(natureOfRepair, editorLineAmountInr(l), l.spareId);
    if (billable <= 0) continue;
    gstLines.push({
      amountInr: billable,
      spareId: l.spareId ?? null,
      hsnSac: l.hsn?.trim() || defaultSacHsn,
    });
  }
  if (serviceChargeBillable > 0) {
    gstLines.push({
      amountInr: serviceChargeBillable,
      spareId: null,
      hsnSac: defaultSacHsn,
    });
  }
  return gstLines;
}

export type InvoiceBillLine = {
  description: string;
  amountInr: number;
  spareId?: string | null;
  hsnSac?: string | null;
};

/** HSN/SAC for printed invoice — prefers saved line code, then spare master, then default SAC. */
export function resolveInvoiceBillLineHsn(
  line: { hsnSac?: string | null; spareId?: string | null },
  defaultSacHsn: string,
  spareHsnLookup?: (spareId: string) => string | null | undefined,
): string {
  const preset = line.hsnSac?.trim();
  if (preset) return preset;
  const spareId = line.spareId?.trim();
  if (spareId && spareHsnLookup) {
    const fromMaster = spareHsnLookup(spareId)?.trim();
    if (fromMaster) return fromMaster;
  }
  return defaultSacHsn;
}

export function editorLinesToInvoiceBillLines(
  lines: ServiceBillEditorLine[],
  natureOfRepair: string | null | undefined,
  serviceChargeBillable: number,
  defaultSacHsn = "9987",
  spareHsnLookup?: (spareId: string) => string | null | undefined,
): InvoiceBillLine[] {
  const out: InvoiceBillLine[] = [];
  for (const l of lines) {
    const amt = billableLineAmount(natureOfRepair, editorLineAmountInr(l), l.spareId);
    if (amt > 0 && l.description.trim()) {
      const spareHsn =
        l.spareId && spareHsnLookup ? spareHsnLookup(l.spareId)?.trim() || null : null;
      out.push({
        description: l.description.trim(),
        amountInr: amt,
        spareId: l.spareId ?? null,
        hsnSac: l.hsn?.trim() || spareHsn || (l.spareId ? null : defaultSacHsn),
      });
    }
  }
  if (serviceChargeBillable > 0.02) {
    out.push({
      description: "Service / repair labour",
      amountInr: serviceChargeBillable,
      spareId: null,
      hsnSac: defaultSacHsn,
    });
  }
  return out;
}
