export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computePoLineAmounts(input: {
  qty: number;
  purchasePrice: number;
  mrp: number;
  gstPercent: number;
  interstate: boolean;
}): {
  qty: number;
  purchasePrice: number;
  mrp: number;
  gstPercent: number;
  totalMrp: number;
  totalCost: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  finalCost: number;
} {
  const qty = Number.isFinite(input.qty) ? Math.max(0, input.qty) : 0;
  const purchasePrice = Number.isFinite(input.purchasePrice) ? Math.max(0, input.purchasePrice) : 0;
  const mrp = Number.isFinite(input.mrp) ? Math.max(0, input.mrp) : 0;
  const gstPercent = Number.isFinite(input.gstPercent) ? Math.max(0, input.gstPercent) : 0;
  const totalMrp = round2(qty * mrp);
  const totalCost = round2(qty * purchasePrice);
  const taxAmount = round2(totalCost * (gstPercent / 100));
  const half = round2(taxAmount / 2);
  const cgst = input.interstate ? 0 : half;
  const sgst = input.interstate ? 0 : round2(taxAmount - half);
  const igst = input.interstate ? taxAmount : 0;
  return {
    qty,
    purchasePrice,
    mrp,
    gstPercent,
    totalMrp,
    totalCost,
    taxAmount,
    cgst,
    sgst,
    igst,
    finalCost: round2(totalCost + taxAmount),
  };
}
