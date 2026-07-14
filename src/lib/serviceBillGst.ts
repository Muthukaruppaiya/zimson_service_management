import { isNatureOfRepairTaxable } from "./natureOfRepair";
import { formatPrintedHsnSac, gstRateFromHsn } from "./hsnGst";
import { isInterstateSupply, splitGstAmount } from "./gstSupply";
import type { ServiceInvoiceTaxRow } from "../types/serviceInvoice";
import { invoicePayableFromGstParts } from "./invoiceRoundOff";

export const DEFAULT_LINE_GST_PERCENT = 18;

export type ServiceBillGstLine = {
  amountInr: number;
  qty?: number;
  hsnSac?: string | null;
  spareId?: string | null;
  /** When set, overrides global `pricesTaxInclusive` for this line. */
  taxInclusive?: boolean;
};

export type ServiceBillGstResult = {
  isInterstate: boolean;
  lines: { hsnSac: string; ratePercent: number; taxable: number; tax: number }[];
  taxRows: ServiceInvoiceTaxRow[];
  grossTaxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  netPayable: number;
  /** Pre round-off total (taxable + tax). */
  preRoundOffPayable?: number;
  /** Round-off adjustment to whole rupees (e.g. -0.01). */
  roundOffInr?: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function lineHsn(
  line: ServiceBillGstLine,
  defaultHsnSac: string,
  spareHsnLookup?: (spareId: string) => string | null | undefined,
): string {
  if (line.hsnSac?.trim()) return formatPrintedHsnSac(line.hsnSac);
  if (line.spareId && spareHsnLookup) {
    const h = spareHsnLookup(line.spareId)?.trim();
    if (h) return formatPrintedHsnSac(h);
  }
  return formatPrintedHsnSac(defaultHsnSac);
}

/** GST % for a billing line — spare catalogue first, else labour SAC default. */
export function resolveLineGstPercent(params: {
  spareId?: string | null;
  defaultSacGstPercent: number;
  spareGstLookup?: (spareId: string) => number | null | undefined;
}): number {
  const { spareId, defaultSacGstPercent, spareGstLookup } = params;
  if (spareId && spareGstLookup) {
    const spareRate = spareGstLookup(spareId);
    if (spareRate != null && Number.isFinite(spareRate)) return spareRate;
  }
  return defaultSacGstPercent;
}

export function computeServiceBillGst(params: {
  lines: ServiceBillGstLine[];
  defaultHsnSac: string;
  spareHsnLookup?: (spareId: string) => string | null | undefined;
  spareGstLookup?: (spareId: string) => number | null | undefined;
  /** GST % for labour / service charge (default SAC). */
  defaultSacGstPercent?: number;
  /** @deprecated Ignored — use defaultSacGstPercent + spareGstLookup. */
  configuredGstPercent?: number;
  /** @deprecated Ignored */
  cgstRatePercent?: number;
  /** @deprecated Ignored */
  sgstRatePercent?: number;
  /** @deprecated Ignored */
  igstRatePercent?: number;
  /** @deprecated Ignored */
  hsnRateTable?: Record<string, number>;
  pricesTaxInclusive: boolean;
  natureOfRepair?: string | null;
  sellerStateCode: string;
  customerStateCode: string;
  billTotalInr: number;
}): ServiceBillGstResult {
  const {
    lines,
    defaultHsnSac,
    spareHsnLookup,
    spareGstLookup,
    defaultSacGstPercent,
    pricesTaxInclusive,
    natureOfRepair,
    sellerStateCode,
    customerStateCode,
    billTotalInr,
  } = params;

  const labourGstPercent = defaultSacGstPercent ?? DEFAULT_LINE_GST_PERCENT;
  const interstate = isInterstateSupply(sellerStateCode, customerStateCode);
  const taxableJob = isNatureOfRepairTaxable(natureOfRepair);

  type Bucket = { hsnSac: string; ratePercent: number; taxable: number };
  const buckets = new Map<string, Bucket>();

  for (const ln of lines) {
    const amt = Number(ln.amountInr) || 0;
    if (amt <= 0) continue;
    const hsn = lineHsn(ln, defaultHsnSac, spareHsnLookup);
    const resolvedHsn = ln.hsnSac?.trim();
    const spareRate =
      ln.spareId && spareGstLookup ? spareGstLookup(ln.spareId) : null;
    const rateFromSource = resolvedHsn
      ? spareRate ?? gstRateFromHsn(resolvedHsn)
      : resolveLineGstPercent({
          spareId: ln.spareId,
          defaultSacGstPercent: labourGstPercent,
          spareGstLookup,
        });
    const effectiveRate = taxableJob ? rateFromSource : 0;
    const key = `${hsn}|${effectiveRate}`;
    const g = effectiveRate / 100;
    let taxable = amt;
    const lineTaxInclusive = ln.taxInclusive ?? pricesTaxInclusive;
    if (lineTaxInclusive && g > 0) taxable = amt / (1 + g);
    const prev = buckets.get(key);
    if (prev) prev.taxable += taxable;
    else buckets.set(key, { hsnSac: hsn, ratePercent: effectiveRate, taxable });
  }

  let grossTaxable = 0;
  let totalTax = 0;
  const taxRows: ServiceInvoiceTaxRow[] = [];
  const previewLines: { hsnSac: string; ratePercent: number; taxable: number; tax: number }[] = [];

  for (const b of buckets.values()) {
    const taxable = round2(b.taxable);
    grossTaxable += taxable;
    const g = b.ratePercent / 100;
    const split = splitGstAmount(
      taxable,
      b.ratePercent,
      0,
      0,
      interstate,
    );
    const cgst = split.cgst;
    const sgst = split.sgst;
    const igst = split.igst;
    let tax = split.total;
    totalTax += tax;
    previewLines.push({ hsnSac: b.hsnSac, ratePercent: b.ratePercent, taxable, tax });
    if (tax > 0) {
      taxRows.push({
        description: interstate
          ? `${b.ratePercent}% IGST (HSN ${b.hsnSac})`
          : `${b.ratePercent}% CGST+SGST (HSN ${b.hsnSac})`,
        taxable,
        cgst,
        sgst,
        igst,
        total: tax,
      });
    }
  }

  grossTaxable = round2(grossTaxable);
  totalTax = round2(totalTax);
  let netPayable = round2(grossTaxable + totalTax);
  const target = round2(billTotalInr);
  /** Inclusive pricing: line total already contains GST — align tax with entered total. */
  const anyInclusive = lines.some((ln) => ln.taxInclusive ?? pricesTaxInclusive);
  if (
    anyInclusive &&
    Math.abs(netPayable - target) > 0.02 &&
    grossTaxable > 0
  ) {
    totalTax = round2(target - grossTaxable);
    netPayable = target;
    if (taxRows.length === 1) {
      const row = taxRows[0]!;
      row.total = totalTax;
      if (interstate) {
        row.igst = totalTax;
        row.cgst = 0;
        row.sgst = 0;
      } else {
        row.cgst = round2(totalTax / 2);
        row.sgst = round2(totalTax - row.cgst);
        row.igst = 0;
      }
    }
  }

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const r of taxRows) {
    cgst += r.cgst;
    sgst += r.sgst;
    igst += r.igst;
  }

  const payable = invoicePayableFromGstParts(grossTaxable, totalTax);

  return {
    isInterstate: interstate,
    lines: previewLines,
    taxRows,
    grossTaxable,
    cgst: round2(cgst),
    sgst: round2(sgst),
    igst: round2(igst),
    totalTax: round2(totalTax),
    preRoundOffPayable: payable.preRoundOffInr,
    roundOffInr: payable.roundOffInr,
    netPayable: payable.netPayableInr,
  };
}
