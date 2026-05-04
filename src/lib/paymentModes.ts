/** Payment modes used across service flows (store billing, SRF advance, etc.). */
export const APP_PAYMENT_MODES = ["UPI", "Cash", "Card", "Bank Transfer"] as const;
export type AppPaymentMode = (typeof APP_PAYMENT_MODES)[number];

/** Indian note / coin breakdown for cash advance (counts except coinsInr = rupee value). */
export const ADVANCE_CASH_DENOMS: ReadonlyArray<{ key: keyof AdvanceCashDenominations; face: number; label: string }> = [
  { key: "n2000", face: 2000, label: "2000 ×" },
  { key: "n500", face: 500, label: "500 ×" },
  { key: "n200", face: 200, label: "200 ×" },
  { key: "n100", face: 100, label: "100 ×" },
  { key: "n50", face: 50, label: "50 ×" },
  { key: "n20", face: 20, label: "20 ×" },
  { key: "n10", face: 10, label: "10 ×" },
  { key: "n5", face: 5, label: "5 ×" },
];

export type AdvanceCashDenominations = {
  n2000?: number;
  n500?: number;
  n200?: number;
  n100?: number;
  n50?: number;
  n20?: number;
  n10?: number;
  n5?: number;
  /** Loose coins / small change total in INR */
  coinsInr?: number;
};

export type AdvancePaymentDetails = {
  /** UPI UTR, card auth ref, bank transfer ref, etc. */
  reference?: string;
  cash?: AdvanceCashDenominations;
};

function parseCount(raw: string): number {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseCoinsInr(raw: string): number {
  const n = Number.parseFloat(raw.trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Sum INR from denomination counts + coins field. */
export function sumAdvanceCashDenominations(cash: AdvanceCashDenominations | null | undefined): number {
  if (!cash) return 0;
  let sum = 0;
  for (const { key, face } of ADVANCE_CASH_DENOMS) {
    const qty = Number(cash[key]);
    if (Number.isFinite(qty) && qty > 0) sum += qty * face;
  }
  const coins = Number(cash.coinsInr);
  if (Number.isFinite(coins) && coins > 0) sum += coins;
  return sum;
}

/** Build details from form strings (empty = 0). */
export function emptyCashDenomStrings(): Record<keyof AdvanceCashDenominations, string> {
  return {
    n2000: "",
    n500: "",
    n200: "",
    n100: "",
    n50: "",
    n20: "",
    n10: "",
    n5: "",
    coinsInr: "",
  };
}

export function advanceDetailsFromFormStrings(
  mode: AppPaymentMode,
  cashStrings: Record<keyof AdvanceCashDenominations, string>,
  reference: string,
): AdvancePaymentDetails {
  if (mode === "Cash") {
    const cash: AdvanceCashDenominations = {};
    for (const { key } of ADVANCE_CASH_DENOMS) {
      const q = parseCount(cashStrings[key] ?? "0");
      if (q > 0) (cash as Record<string, number>)[key] = q;
    }
    const coins = parseCoinsInr(cashStrings.coinsInr ?? "0");
    if (coins > 0) cash.coinsInr = coins;
    return { cash };
  }
  const ref = reference.trim();
  return ref ? { reference: ref } : {};
}
