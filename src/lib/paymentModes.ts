/** Payment modes used across service flows (store billing, SRF advance, etc.). */
export const APP_PAYMENT_MODES = ["UPI", "Cash", "Card", "Bank Transfer"] as const;
export type AppPaymentMode = (typeof APP_PAYMENT_MODES)[number];

/** Indian note / coin breakdown for cash advance (counts except coinsInr = rupee value). */
export const ADVANCE_CASH_DENOMS: ReadonlyArray<{ key: keyof AdvanceCashDenominations; face: number; label: string }> = [
  { key: "n500", face: 500, label: "500 ×" },
  { key: "n200", face: 200, label: "200 ×" },
  { key: "n100", face: 100, label: "100 ×" },
  { key: "n50", face: 50, label: "50 ×" },
  { key: "n20", face: 20, label: "20 ×" },
  { key: "n10", face: 10, label: "10 ×" },
  { key: "n5", face: 5, label: "5 ×" },
];

export type AdvanceCashDenominations = {
  /** Legacy field — no longer shown in UI; still counted when loading old payments. */
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
  /** Cash received from customer (tender). */
  cash?: AdvanceCashDenominations;
  /** Notes/coins returned to customer when tender exceeds bill amount. */
  changeReturned?: AdvanceCashDenominations;
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
  const legacy2000 = Number(cash.n2000);
  if (Number.isFinite(legacy2000) && legacy2000 > 0) sum += legacy2000 * 2000;
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

/** Greedy note breakdown for a target INR amount (remainder goes to coins). */
export function suggestCashDenominationsForAmount(amountInr: number): AdvanceCashDenominations {
  let remaining = Math.round(Math.max(0, amountInr) * 100) / 100;
  const result: AdvanceCashDenominations = {};
  for (const { key, face } of ADVANCE_CASH_DENOMS) {
    const count = Math.floor(remaining / face);
    if (count > 0) {
      (result as Record<string, number>)[key] = count;
      remaining = Math.round((remaining - count * face) * 100) / 100;
    }
  }
  if (remaining > 0) {
    result.coinsInr = remaining;
  }
  return result;
}

export function cashDenomStringsFromBreakdown(
  cash: AdvanceCashDenominations,
): Record<keyof AdvanceCashDenominations, string> {
  const strings = emptyCashDenomStrings();
  for (const { key } of ADVANCE_CASH_DENOMS) {
    const qty = Number(cash[key]);
    if (Number.isFinite(qty) && qty > 0) strings[key] = String(qty);
  }
  const coins = Number(cash.coinsInr);
  if (Number.isFinite(coins) && coins > 0) {
    strings.coinsInr = coins % 1 === 0 ? String(coins) : coins.toFixed(2);
  }
  return strings;
}

/** Human-readable suggestion, e.g. "1 × ₹200, 1 × ₹50". */
export function formatCashDenomSuggestionText(cash: AdvanceCashDenominations): string {
  const parts: string[] = [];
  for (const { key, face } of ADVANCE_CASH_DENOMS) {
    const qty = Number(cash[key]);
    if (Number.isFinite(qty) && qty > 0) parts.push(`${qty} × ₹${face}`);
  }
  const coins = Number(cash.coinsInr);
  if (Number.isFinite(coins) && coins > 0) {
    parts.push(`coins ₹${coins.toFixed(2)}`);
  }
  return parts.length > 0 ? parts.join(", ") : "—";
}

export function formatCashDenomStringsText(
  strings: Record<keyof AdvanceCashDenominations, string>,
): string {
  return formatCashDenomSuggestionText(advanceDetailsFromFormStrings("Cash", strings, "").cash ?? {});
}

/** Sum of enabled payment modes except one (default Cash). */
export function otherPaymentModesTotal(
  form: MultiPaymentFormState,
  exclude: AppPaymentMode = "Cash",
): number {
  let sum = 0;
  for (const mode of APP_PAYMENT_MODES) {
    if (mode === exclude || !form[mode].enabled) continue;
    const n = Number.parseFloat(form[mode].amount);
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return Math.round(sum * 100) / 100;
}

/** Cash leg of the bill (bill total minus other payment modes). */
export function cashBillTargetInr(form: MultiPaymentFormState, totalInr: number): number {
  if (!form.Cash.enabled) return 0;
  const fromBill = Math.round(Math.max(0, totalInr - otherPaymentModesTotal(form, "Cash")) * 100) / 100;
  const enabledCount = APP_PAYMENT_MODES.filter((m) => form[m].enabled).length;
  const onlyCash = enabledCount === 1;
  if (onlyCash) return fromBill;
  const entered = Number.parseFloat(form.Cash.amount);
  if (Number.isFinite(entered) && entered > 0) return Math.round(entered * 100) / 100;
  return fromBill;
}

/** Net cash retained after returning change (for bank deposit). */
export function netCashAfterChangeInr(tenderInr: number, changeInr: number): number {
  return Math.round(Math.max(0, tenderInr - changeInr) * 100) / 100;
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

/** One leg of a split payment (Quick bill / SRF advance). */
export type PaymentSplit = {
  mode: AppPaymentMode;
  amountInr: number;
  reference?: string;
  /** Cash tendered by customer. */
  cash?: AdvanceCashDenominations;
  /** Change returned to customer (denomination breakdown). */
  changeReturned?: AdvanceCashDenominations;
};

export type MultiPaymentDetails = AdvancePaymentDetails & {
  splits?: PaymentSplit[];
};

export type PaymentModeFormRow = {
  enabled: boolean;
  amount: string;
  reference: string;
  cashStrings: Record<keyof AdvanceCashDenominations, string>;
  changeReturnedStrings: Record<keyof AdvanceCashDenominations, string>;
};

export type MultiPaymentFormState = Record<AppPaymentMode, PaymentModeFormRow>;

export function emptyMultiPaymentForm(defaultEnabled: AppPaymentMode = "Cash"): MultiPaymentFormState {
  return Object.fromEntries(
    APP_PAYMENT_MODES.map((mode) => [
      mode,
      {
        enabled: mode === defaultEnabled,
        amount: "",
        reference: "",
        cashStrings: emptyCashDenomStrings(),
        changeReturnedStrings: emptyCashDenomStrings(),
      },
    ]),
  ) as MultiPaymentFormState;
}

export function formatPaymentModesLabel(modes: AppPaymentMode[]): string {
  return modes.join(" + ");
}

export function paymentSplitsFromDetails(
  paymentMode: string,
  details: AdvancePaymentDetails | MultiPaymentDetails | null | undefined,
  totalInr?: number,
): PaymentSplit[] {
  const splits = (details as MultiPaymentDetails | null | undefined)?.splits;
  if (Array.isArray(splits) && splits.length > 0) {
    return splits.filter((s) => s && APP_PAYMENT_MODES.includes(s.mode));
  }
  const mode = APP_PAYMENT_MODES.find((m) => m === paymentMode);
  if (!mode) return [];
  if (mode === "Cash" && details?.cash) {
    const tender = sumAdvanceCashDenominations(details.cash);
    const change = sumAdvanceCashDenominations(details.changeReturned);
    const amountInr =
      totalInr != null && Number.isFinite(totalInr)
        ? Math.round(totalInr * 100) / 100
        : Math.round((tender - change) * 100) / 100;
    return [{ mode, amountInr, cash: details.cash, changeReturned: details.changeReturned }];
  }
  const amountInr = Math.round((totalInr ?? 0) * 100) / 100;
  if (details?.reference?.trim()) {
    return [{ mode, amountInr, reference: details.reference.trim() }];
  }
  return amountInr > 0 ? [{ mode, amountInr }] : [{ mode, amountInr: 0 }];
}

export function sumMultiPaymentFormAmounts(form: MultiPaymentFormState): number {
  let sum = 0;
  for (const mode of APP_PAYMENT_MODES) {
    if (!form[mode].enabled) continue;
    const n = Number.parseFloat(form[mode].amount);
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return Math.round(sum * 100) / 100;
}

export function cashTotalFromFormRow(row: PaymentModeFormRow): number {
  return sumAdvanceCashDenominations(advanceDetailsFromFormStrings("Cash", row.cashStrings, "").cash);
}

export function changeTotalFromFormRow(row: PaymentModeFormRow): number {
  return sumAdvanceCashDenominations(
    advanceDetailsFromFormStrings("Cash", row.changeReturnedStrings, "").cash,
  );
}

/** Change due when customer tenders more cash than the bill leg amount. */
export function cashChangeDueInr(tenderSumInr: number, billAmountInr: number): number {
  return Math.round(Math.max(0, tenderSumInr - billAmountInr) * 100) / 100;
}

function validateCashLeg(
  amountInr: number,
  cash: AdvanceCashDenominations | undefined,
  changeReturned: AdvanceCashDenominations | undefined,
): { ok: true } | { ok: false; error: string } {
  const cashSum = sumAdvanceCashDenominations(cash);
  const changeSum = sumAdvanceCashDenominations(changeReturned);
  const net = Math.round((cashSum - changeSum) * 100) / 100;

  if (cashSum > amountInr + 0.02) {
    const due = cashChangeDueInr(cashSum, amountInr);
    if (changeSum <= 0) {
      return {
        ok: false,
        error: `Customer paid INR ${cashSum.toFixed(2)} in cash but bill cash leg is INR ${amountInr.toFixed(2)}. Record INR ${due.toFixed(2)} change returned.`,
      };
    }
    if (Math.abs(changeSum - due) > 0.02) {
      return {
        ok: false,
        error: `Change returned must total INR ${due.toFixed(2)} (current: INR ${changeSum.toFixed(2)}).`,
      };
    }
    if (Math.abs(net - amountInr) > 0.02) {
      return {
        ok: false,
        error: `Cash tender minus change must equal INR ${amountInr.toFixed(2)} (tender INR ${cashSum.toFixed(2)}, change INR ${changeSum.toFixed(2)}).`,
      };
    }
    return { ok: true };
  }

  if (Math.abs(cashSum - amountInr) > 0.02) {
    return {
      ok: false,
      error: `Cash denominations must total INR ${amountInr.toFixed(2)} (current: INR ${cashSum.toFixed(2)}).`,
    };
  }
  if (changeSum > 0.02) {
    return { ok: false, error: "Change return is not needed when cash tender matches the bill amount." };
  }
  return { ok: true };
}

export function buildMultiPaymentPayload(
  form: MultiPaymentFormState,
  totalInr: number,
): { paymentMode: string; paymentDetails: MultiPaymentDetails } | { error: string } {
  const enabled = APP_PAYMENT_MODES.filter((m) => form[m].enabled);
  if (enabled.length === 0) {
    return { error: "Select at least one payment method." };
  }

  const splits: PaymentSplit[] = [];
  let sum = 0;

  for (const mode of enabled) {
    const row = form[mode];
    const amountInr = Math.round(Number.parseFloat(row.amount) * 100) / 100;
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      return { error: `Enter a valid amount for ${mode}.` };
    }
    sum += amountInr;

    if (mode === "Cash") {
      const cash = advanceDetailsFromFormStrings("Cash", row.cashStrings, "").cash;
      const changeReturned = advanceDetailsFromFormStrings("Cash", row.changeReturnedStrings, "").cash;
      const validation = validateCashLeg(amountInr, cash, changeReturned);
      if (!validation.ok) {
        return { error: validation.error };
      }
      const changeSum = sumAdvanceCashDenominations(changeReturned);
      splits.push({
        mode,
        amountInr,
        cash: cash ?? undefined,
        changeReturned: changeSum > 0 ? changeReturned : undefined,
      });
    } else {
      const ref = row.reference.trim();
      if (ref.length > 500) {
        return { error: `${mode} reference is too long (max 500 characters).` };
      }
      splits.push({ mode, amountInr, reference: ref || undefined });
    }
  }

  sum = Math.round(sum * 100) / 100;
  const target = Math.round(totalInr * 100) / 100;
  if (Math.abs(sum - target) > 0.02) {
    return {
      error: `Payment split total INR ${sum.toFixed(2)} must match amount INR ${target.toFixed(2)}.`,
    };
  }

  if (enabled.length === 1) {
    const only = splits[0]!;
    if (only.mode === "Cash") {
      return {
        paymentMode: only.mode,
        paymentDetails: {
          cash: only.cash,
          ...(only.changeReturned ? { changeReturned: only.changeReturned } : {}),
        },
      };
    }
    return {
      paymentMode: only.mode,
      paymentDetails: only.reference ? { reference: only.reference } : {},
    };
  }

  return {
    paymentMode: formatPaymentModesLabel(enabled),
    paymentDetails: { splits },
  };
}

export type NormalizedPayment = {
  paymentMode: string;
  paymentDetails: MultiPaymentDetails;
};

/** Server + client: validate single or split payment against a target total. */
export function normalizePaymentForTotal(
  totalInr: number,
  paymentModeRaw: string,
  paymentDetailsRaw: unknown,
): { ok: true; value: NormalizedPayment } | { ok: false; error: string } {
  const target = Math.round(totalInr * 100) / 100;
  if (target <= 0) {
    return { ok: false, error: "Total amount must be greater than zero." };
  }

  const pd =
    paymentDetailsRaw && typeof paymentDetailsRaw === "object" && !Array.isArray(paymentDetailsRaw)
      ? (paymentDetailsRaw as MultiPaymentDetails)
      : {};

  const rawSplits = pd.splits;
  if (Array.isArray(rawSplits) && rawSplits.length > 0) {
    const splits: PaymentSplit[] = [];
    let sum = 0;
    for (const row of rawSplits) {
      const mode = String((row as PaymentSplit).mode ?? "") as AppPaymentMode;
      if (!APP_PAYMENT_MODES.includes(mode)) {
        return { ok: false, error: "Invalid payment mode in split." };
      }
      const amountInr = Math.round(Number((row as PaymentSplit).amountInr) * 100) / 100;
      if (!Number.isFinite(amountInr) || amountInr <= 0) {
        return { ok: false, error: `Invalid amount for ${mode}.` };
      }
      sum += amountInr;
      if (mode === "Cash") {
        const cash = (row as PaymentSplit).cash;
        const changeReturned = (row as PaymentSplit).changeReturned;
        const validation = validateCashLeg(amountInr, cash, changeReturned);
        if (!validation.ok) {
          return { ok: false, error: validation.error };
        }
        const changeSum = sumAdvanceCashDenominations(changeReturned);
        splits.push({
          mode,
          amountInr,
          cash: cash ?? undefined,
          changeReturned: changeSum > 0 ? changeReturned : undefined,
        });
      } else {
        const ref = String((row as PaymentSplit).reference ?? "").trim();
        if (ref.length > 500) {
          return { ok: false, error: "Payment reference is too long (max 500 characters)." };
        }
        splits.push({ mode, amountInr, reference: ref || undefined });
      }
    }
    sum = Math.round(sum * 100) / 100;
    if (Math.abs(sum - target) > 0.02) {
      return {
        ok: false,
        error: `Payment splits must total INR ${target.toFixed(2)} (current: INR ${sum.toFixed(2)}).`,
      };
    }
    const modes = splits.map((s) => s.mode);
    return {
      ok: true,
      value: {
        paymentMode: formatPaymentModesLabel(modes),
        paymentDetails: splits.length === 1 ? legacyDetailsFromSplit(splits[0]!) : { splits },
      },
    };
  }

  const paymentMode = String(paymentModeRaw ?? "Cash").trim();
  if (!APP_PAYMENT_MODES.includes(paymentMode as AppPaymentMode)) {
    if (paymentMode.includes("+")) {
      return { ok: false, error: "Multi-payment requires paymentDetails.splits array." };
    }
    return { ok: false, error: "paymentMode must be Cash, Card, UPI, or Bank Transfer." };
  }
  const mode = paymentMode as AppPaymentMode;

  if (mode === "Cash") {
    const validation = validateCashLeg(target, pd.cash, pd.changeReturned);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }
    const details: MultiPaymentDetails = {};
    if (pd.cash) details.cash = pd.cash;
    if (pd.changeReturned) details.changeReturned = pd.changeReturned;
    return {
      ok: true,
      value: { paymentMode: mode, paymentDetails: details },
    };
  }
  const ref = String(pd.reference ?? "").trim();
  if (ref.length > 500) {
    return { ok: false, error: "Payment reference is too long (max 500 characters)." };
  }
  return {
    ok: true,
    value: { paymentMode: mode, paymentDetails: ref ? { reference: ref } : {} },
  };
}

function legacyDetailsFromSplit(split: PaymentSplit): MultiPaymentDetails {
  if (split.mode === "Cash") {
    const details: MultiPaymentDetails = {};
    if (split.cash) details.cash = split.cash;
    if (split.changeReturned) details.changeReturned = split.changeReturned;
    return details;
  }
  return split.reference ? { reference: split.reference } : {};
}

function formatCashPaymentLine(amountInr: number, cash?: AdvanceCashDenominations, changeReturned?: AdvanceCashDenominations): string {
  const base = `Cash: ₹${amountInr.toFixed(2)}`;
  const tender = sumAdvanceCashDenominations(cash);
  const change = sumAdvanceCashDenominations(changeReturned);
  if (change > 0) {
    return `${base} (tendered ₹${tender.toFixed(2)}, change ₹${change.toFixed(2)})`;
  }
  if (tender > 0 && Math.abs(tender - amountInr) > 0.02) {
    return `${base} (tendered ₹${tender.toFixed(2)})`;
  }
  return base;
}

export function validateMultiPaymentForm(
  form: MultiPaymentFormState,
  totalInr: number,
): string | null {
  const out = buildMultiPaymentPayload(form, totalInr);
  return "error" in out ? out.error : null;
}

/** Human-readable payment summary for review tables / receipts. */
export function formatPaymentSummary(
  paymentMode: string,
  details: MultiPaymentDetails | AdvancePaymentDetails | null | undefined,
): string {
  const splits = (details as MultiPaymentDetails | undefined)?.splits;
  if (Array.isArray(splits) && splits.length > 0) {
    return splits
      .map((s) => {
        if (s.mode === "Cash") return formatCashPaymentLine(s.amountInr, s.cash, s.changeReturned);
        const base = `${s.mode}: ₹${s.amountInr.toFixed(2)}`;
        return s.reference?.trim() ? `${base} (${s.reference.trim()})` : base;
      })
      .join(" · ");
  }
  if (paymentMode === "Cash" && details?.cash) {
    const amount =
      details.changeReturned != null
        ? Math.round(
            (sumAdvanceCashDenominations(details.cash) - sumAdvanceCashDenominations(details.changeReturned)) *
              100,
          ) / 100
        : sumAdvanceCashDenominations(details.cash);
    return formatCashPaymentLine(amount, details.cash, details.changeReturned);
  }
  const ref = details?.reference?.trim();
  return ref ? `${paymentMode} — ${ref}` : paymentMode;
}
