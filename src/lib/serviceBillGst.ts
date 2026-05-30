import { effectiveGstRatePercent } from "./natureOfRepair";
import { gstRateFromHsn, normalizeHsnCode } from "./hsnGst";
import { isInterstateSupply } from "./gstSupply";
import type { ServiceInvoiceTaxRow } from "../types/serviceInvoice";

export type ServiceBillGstLine = {
  amountInr: number;
  qty?: number;
  hsnSac?: string | null;
  spareId?: string | null;
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
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function lineHsn(
  line: ServiceBillGstLine,
  defaultHsnSac: string,
  spareHsnLookup?: (spareId: string) => string | null | undefined,
): string {
  if (line.hsnSac?.trim()) return normalizeHsnCode(line.hsnSac);
  if (line.spareId && spareHsnLookup) {
    const h = normalizeHsnCode(spareHsnLookup(line.spareId));
    if (h) return h;
  }
  return normalizeHsnCode(defaultHsnSac) || "9987";
}

export function computeServiceBillGst(params: {
  lines: ServiceBillGstLine[];
  defaultHsnSac: string;
  spareHsnLookup?: (spareId: string) => string | null | undefined;
  configuredGstPercent: number;
  cgstRatePercent: number;
  sgstRatePercent: number;
  igstRatePercent: number;
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
    configuredGstPercent,
    cgstRatePercent,
    sgstRatePercent,
    igstRatePercent,
    pricesTaxInclusive,
    natureOfRepair,
    sellerStateCode,
    customerStateCode,
    billTotalInr,
  } = params;

  const interstate = isInterstateSupply(sellerStateCode, customerStateCode);
  const baseRate = effectiveGstRatePercent(natureOfRepair, configuredGstPercent);

  type Bucket = { hsnSac: string; ratePercent: number; taxable: number };
  const buckets = new Map<string, Bucket>();

  for (const ln of lines) {
    const amt = Number(ln.amountInr) || 0;
    if (amt <= 0) continue;
    const hsn = lineHsn(ln, defaultHsnSac, spareHsnLookup);
    const rateFromHsn = gstRateFromHsn(hsn, configuredGstPercent);
    const effectiveRate = baseRate <= 0 ? 0 : rateFromHsn;
    const key = `${hsn}|${effectiveRate}`;
    const g = effectiveRate / 100;
    let taxable = amt;
    if (pricesTaxInclusive && g > 0) taxable = amt / (1 + g);
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
    let tax = g > 0 ? round2(taxable * g) : 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (tax > 0) {
      if (interstate) {
        igst = tax;
      } else {
        const cgstPct = cgstRatePercent > 0 ? cgstRatePercent : b.ratePercent / 2;
        const sgstPct = sgstRatePercent > 0 ? sgstRatePercent : b.ratePercent / 2;
        cgst = round2(taxable * (cgstPct / 100));
        sgst = round2(taxable * (sgstPct / 100));
        tax = round2(cgst + sgst);
        igst = 0;
      }
    }
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
  if (
    pricesTaxInclusive &&
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

  return {
    isInterstate: interstate,
    lines: previewLines,
    taxRows,
    grossTaxable,
    cgst: round2(cgst),
    sgst: round2(sgst),
    igst: round2(igst),
    totalTax: round2(totalTax),
    netPayable,
  };
}
