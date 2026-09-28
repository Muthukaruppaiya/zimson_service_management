import { isValidPanFormat, panFromGstin } from "../data/serviceSeed";

/**
 * TCS on luxury goods / motor vehicle (s.206C): 1% when sale consideration of a
 * TCS-eligible item is over ₹10 lakh. Without buyer PAN, 5% (s.206CC).
 */
export const TCS_LUXURY_THRESHOLD_INR = 10_00_000;
export const TCS_RATE_WITH_PAN_PERCENT = 1;
export const TCS_RATE_WITHOUT_PAN_PERCENT = 5;

export type TcsEligibleFlag = 0 | 1;

export function parseTcsEligibleFlag(
  raw: unknown,
  opts?: { required?: boolean },
): { ok: true; value: TcsEligibleFlag } | { ok: false; error: string } {
  if (raw == null || String(raw).trim() === "") {
    if (opts?.required) {
      return { ok: false, error: "TCS eligible must be 0 or 1." };
    }
    return { ok: true, value: 0 };
  }
  const s = String(raw).trim();
  if (s === "0" || s === "1") {
    return { ok: true, value: Number(s) as TcsEligibleFlag };
  }
  const n = Number(s);
  if (n === 0 || n === 1) {
    return { ok: true, value: n as TcsEligibleFlag };
  }
  return { ok: false, error: "TCS eligible must be 0 or 1." };
}

export function isTcsEligibleFlag(value: unknown): boolean {
  const parsed = parseTcsEligibleFlag(value);
  return parsed.ok && parsed.value === 1;
}

/** PAN typed on the form, or PAN embedded in GSTIN. */
export function resolveBuyerPanForTcs(
  pan?: string | null,
  gstin?: string | null,
): string | null {
  const typed = String(pan ?? "").trim().toUpperCase();
  if (isValidPanFormat(typed)) return typed;
  return panFromGstin(String(gstin ?? "")) || null;
}

export function buyerHasPanForTcs(pan?: string | null, gstin?: string | null): boolean {
  return Boolean(resolveBuyerPanForTcs(pan, gstin));
}

export function tcsRatePercentForBuyer(buyerPan?: string | null, gstin?: string | null): number {
  return buyerHasPanForTcs(buyerPan, gstin) ? TCS_RATE_WITH_PAN_PERCENT : TCS_RATE_WITHOUT_PAN_PERCENT;
}

/** TCS on one TCS-eligible item. Zero unless consideration is over ₹10 lakh. */
export function tcsOnConsiderationInr(
  considerationInr: number,
  buyerPan?: string | null,
  gstin?: string | null,
): number {
  const amt = Number(considerationInr);
  if (!Number.isFinite(amt) || amt <= TCS_LUXURY_THRESHOLD_INR) return 0;
  const rate = tcsRatePercentForBuyer(buyerPan, gstin);
  return Math.round(amt * (rate / 100) * 100) / 100;
}

export function tcsInvoiceLabel(ratePercent?: number | null): string {
  const rate =
    ratePercent != null && Number.isFinite(ratePercent) && ratePercent > 0
      ? ratePercent
      : TCS_RATE_WITH_PAN_PERCENT;
  return `TCS @ ${rate}%`;
}

export const TCS_DEPOSIT_NOTE =
  "Deposit TCS with the government by the 7th of the following month and file quarterly Form 27EQ.";
