/** Payment modes used across service flows (store billing, SRF advance, etc.). */
export const APP_PAYMENT_MODES = ["UPI", "Cash", "Card", "Bank Transfer"] as const;
export type AppPaymentMode = (typeof APP_PAYMENT_MODES)[number];

export type AdvancePaymentDetails = {
  /** UPI UTR, card auth ref, bank transfer ref, etc. */
  reference?: string;
};

/** One leg of a split payment (Quick bill / SRF advance). */
export type PaymentSplit = {
  mode: AppPaymentMode;
  amountInr: number;
  reference?: string;
};

export type MultiPaymentDetails = AdvancePaymentDetails & {
  splits?: PaymentSplit[];
};

export type PaymentModeFormRow = {
  enabled: boolean;
  amount: string;
  reference: string;
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
      },
    ]),
  ) as MultiPaymentFormState;
}

export function formatPaymentModesLabel(modes: AppPaymentMode[]): string {
  return modes.join(" + ");
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

export function paymentSplitsFromDetails(
  paymentMode: string,
  details: AdvancePaymentDetails | MultiPaymentDetails | null | undefined,
  totalInr?: number,
): PaymentSplit[] {
  const splits = (details as MultiPaymentDetails | null | undefined)?.splits;
  if (Array.isArray(splits) && splits.length > 0) {
    return splits
      .filter((s) => s && APP_PAYMENT_MODES.includes(s.mode))
      .map((s) => ({
        mode: s.mode,
        amountInr: Math.round(Number(s.amountInr) * 100) / 100,
        reference: s.reference?.trim() || undefined,
      }));
  }
  const mode = APP_PAYMENT_MODES.find((m) => m === paymentMode);
  if (!mode) return [];
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
      splits.push({ mode, amountInr });
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
      return { paymentMode: only.mode, paymentDetails: {} };
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
        splits.push({ mode, amountInr });
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
    return {
      ok: true,
      value: { paymentMode: mode, paymentDetails: {} },
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
  if (split.mode === "Cash") return {};
  return split.reference ? { reference: split.reference } : {};
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
        const base = `${s.mode}: ₹${s.amountInr.toFixed(2)}`;
        return s.mode !== "Cash" && s.reference?.trim() ? `${base} (${s.reference.trim()})` : base;
      })
      .join(" · ");
  }
  const ref = details?.reference?.trim();
  return ref ? `${paymentMode} — ${ref}` : paymentMode;
}
