import type { EdocLine, EdocValueTotals } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Two-digit GST state code for IRP party / place-of-supply comparison. */
export function normGstStateCode(code: string | null | undefined): string {
  return String(code ?? "")
    .replace(/\D/g, "")
    .padStart(2, "0")
    .slice(0, 2);
}

/** Interstate when seller registration state ≠ buyer place of supply (IRP rule). */
export function isInterstateEdocSupply(sellerStateCode: string, placeOfSupplyStateCode: string): boolean {
  return normGstStateCode(sellerStateCode) !== normGstStateCode(placeOfSupplyStateCode);
}

/** IRP: interstate → IGST only; intrastate → CGST + SGST only (no IGST). */
export function splitTaxForEdocSupply(
  interstate: boolean,
  cgst: number,
  sgst: number,
  igst: number,
): { cgst: number; sgst: number; igst: number } {
  const totalTax = round2(cgst + sgst + igst);
  if (totalTax <= 0) return { cgst: 0, sgst: 0, igst: 0 };
  if (interstate) return { cgst: 0, sgst: 0, igst: totalTax };
  const half = round2(totalTax / 2);
  return { cgst: half, sgst: round2(totalTax - half), igst: 0 };
}

export function normalizeEdocLinesForSupply(
  lines: EdocLine[],
  interstate: boolean,
): EdocLine[] {
  return lines.map((ln) => {
    const tax = splitTaxForEdocSupply(interstate, ln.cgst, ln.sgst, ln.igst);
    return { ...ln, ...tax };
  });
}

export function normalizeEdocTotalsForSupply(
  totals: EdocValueTotals,
  interstate: boolean,
): EdocValueTotals {
  const tax = splitTaxForEdocSupply(interstate, totals.cgst, totals.sgst, totals.igst);
  return {
    ...totals,
    ...tax,
    isInterstate: interstate,
  };
}
