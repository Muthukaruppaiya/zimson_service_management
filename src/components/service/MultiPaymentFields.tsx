import { useEffect } from "react";
import {
  APP_PAYMENT_MODES,
  cashBillTargetInr,
  cashReceiptLimitError,
  sumMultiPaymentFormAmounts,
  type AppPaymentMode,
  type MultiPaymentFormState,
  type PaymentModeFormRow,
} from "../../lib/paymentModes";
import { sanitizeAlphanumericInput, sanitizeDecimalInput } from "../../lib/inputSanitize";
import { inputClass } from "../../lib/uiForm";

type Props = {
  idPrefix: string;
  /** Label for amount target, e.g. "bill" or "advance". */
  amountLabel: string;
  targetInr: number;
  form: MultiPaymentFormState;
  onChange: (next: MultiPaymentFormState) => void;
};

function toggleMode(form: MultiPaymentFormState, mode: AppPaymentMode, on: boolean): MultiPaymentFormState {
  const next = { ...form, [mode]: { ...form[mode], enabled: on } };
  if (!on) {
    next[mode] = {
      ...next[mode],
      amount: "",
      reference: "",
    };
  }
  return next;
}

function patchRow(
  form: MultiPaymentFormState,
  mode: AppPaymentMode,
  patch: Partial<PaymentModeFormRow>,
): MultiPaymentFormState {
  return { ...form, [mode]: { ...form[mode], ...patch } };
}

export function MultiPaymentFields({ idPrefix, amountLabel, targetInr, form, onChange }: Props) {
  const splitSum = sumMultiPaymentFormAmounts(form);
  const matchTarget = Math.abs(splitSum - targetInr) <= 0.02;

  const cashRow = form.Cash;
  const enabledModesKey = APP_PAYMENT_MODES.filter((m) => form[m].enabled).join(",");
  const otherModesAmountKey = APP_PAYMENT_MODES.filter((m) => m !== "Cash" && form[m].enabled)
    .map((m) => form[m].amount)
    .join("|");

  useEffect(() => {
    if (!cashRow.enabled || targetInr <= 0) return;
    const billCash = cashBillTargetInr(form, targetInr);
    if (billCash <= 0) return;
    const current = Number.parseFloat(cashRow.amount);
    const onlyCash = APP_PAYMENT_MODES.filter((m) => form[m].enabled).length === 1;
    const shouldSync = onlyCash || !cashRow.amount.trim();
    if (shouldSync && (!Number.isFinite(current) || Math.abs(current - billCash) > 0.02)) {
      onChange(patchRow(form, "Cash", { amount: String(billCash) }));
    }
  }, [cashRow.enabled, targetInr, enabledModesKey, otherModesAmountKey]);

  function fillRemaining(mode: AppPaymentMode) {
    let other = 0;
    for (const m of APP_PAYMENT_MODES) {
      if (m === mode || !form[m].enabled) continue;
      const n = Number.parseFloat(form[m].amount);
      if (Number.isFinite(n) && n > 0) other += n;
    }
    const remaining = Math.max(0, Math.round((targetInr - other) * 100) / 100);
    onChange(patchRow(form, mode, { amount: remaining > 0 ? String(remaining) : "" }));
  }

  return (
    <div className="w-full min-w-0 space-y-3">
      <p className="text-xs font-medium text-stone-600">
        Payment methods
      </p>
      <div className="flex flex-wrap gap-2">
        {APP_PAYMENT_MODES.map((mode) => {
          const on = Boolean(form[mode]?.enabled);
          return (
            <label
              key={mode}
              className={`relative inline-flex cursor-pointer select-none items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus-within:ring-2 focus-within:ring-zimson-200 ${
                on
                  ? "border-zimson-600 bg-zimson-600 text-white shadow-sm"
                  : "border-zimson-200 bg-white text-stone-700 hover:border-zimson-400 hover:bg-zimson-50"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={(e) => onChange(toggleMode(form, mode, e.target.checked))}
              />
              {on ? (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : null}
              {mode}
            </label>
          );
        })}
      </div>

        {APP_PAYMENT_MODES.filter((m) => form[m]?.enabled).map((mode) => {
        const row = form[mode];
        const rowBillTarget = mode === "Cash" ? cashBillTargetInr(form, targetInr) : 0;
        const onlyCash =
          mode === "Cash" && APP_PAYMENT_MODES.filter((m) => form[m].enabled).length === 1;

        return (
          <div key={mode} className="w-full min-w-0 rounded-xl border border-zimson-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded bg-zimson-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zimson-800">
                {mode}
              </span>
              {mode === "Cash" ? (
                <p className="text-xs text-stone-600">
                  Cash due{" "}
                  <strong className="tabular-nums text-zimson-900">
                    {rowBillTarget.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                  </strong>
                  {onlyCash && targetInr > 0 ? (
                    <span className="ml-1 text-stone-500">(from {amountLabel} total)</span>
                  ) : null}
                </p>
              ) : null}
            </div>

            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <label className="block min-w-0 flex-1 text-xs font-medium text-stone-600 sm:min-w-[12rem]">
                <span className="block">Amount (INR)</span>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={row.amount}
                  readOnly={mode === "Cash" && onlyCash}
                  onChange={(e) =>
                    onChange(patchRow(form, mode, { amount: sanitizeDecimalInput(e.target.value) }))
                  }
                  placeholder="0.00"
                />
                {mode === "Cash" && cashReceiptLimitError(Number.parseFloat(row.amount) || rowBillTarget) ? (
                  <span className="mt-1 block font-medium text-red-700">
                    {cashReceiptLimitError(Number.parseFloat(row.amount) || rowBillTarget)}
                  </span>
                ) : null}
              </label>
              {targetInr > 0 && !(mode === "Cash" && onlyCash) ? (
                <button
                  type="button"
                  onClick={() => fillRemaining(mode)}
                  className="rounded-lg border border-zimson-300 bg-white px-3 py-2 text-xs font-semibold text-zimson-800 transition hover:bg-zimson-50"
                >
                  Use remaining
                </button>
              ) : null}
            </div>

            {mode !== "Cash" ? (
              <label className="mt-3 block min-w-0 text-xs text-stone-600">
                <span className="mb-1 block">
                  {mode === "Razorpay"
                    ? "Razorpay payment id (filled after checkout)"
                    : mode === "UPI"
                      ? `${mode} reference (UTR / transaction id)`
                      : `${mode} reference (optional)`}
                </span>
                <input
                  id={`${idPrefix}-${mode}-ref`}
                  className={inputClass}
                  value={row.reference}
                  readOnly={mode === "Razorpay"}
                  onChange={(e) =>
                    onChange(patchRow(form, mode, { reference: sanitizeAlphanumericInput(e.target.value, 80) }))
                  }
                  placeholder={
                    mode === "Razorpay"
                      ? "pay_… after successful checkout"
                      : mode === "UPI"
                        ? "UPI UTR / transaction reference"
                        : mode === "Card"
                          ? "Auth code / last 4 digits"
                          : "Bank transfer reference"
                  }
                  maxLength={500}
                />
              </label>
            ) : null}
          </div>
        );
      })}

      {targetInr > 0 ? (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ${
            matchTarget ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
          }`}
        >
          <span>
            Collected{" "}
            <strong className="tabular-nums">
              {splitSum.toLocaleString(undefined, { style: "currency", currency: "INR" })}
            </strong>
            {" of "}
            <strong className="tabular-nums">
              {targetInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}
            </strong>
          </span>
          <span className="font-semibold">
            {matchTarget ? "✓ Matches" : `Must match ${amountLabel} total`}
          </span>
        </div>
      ) : null}
    </div>
  );
}
