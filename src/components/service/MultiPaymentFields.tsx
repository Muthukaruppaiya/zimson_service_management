import { useEffect } from "react";
import {
  APP_PAYMENT_MODES,
  cashBillTargetInr,
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
        Payment methods <span className="font-normal text-stone-500">(select one or more)</span>
      </p>
      <div className="flex flex-wrap gap-3">
        {APP_PAYMENT_MODES.map((mode) => (
          <label
            key={mode}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zimson-200 bg-white px-3 py-2 text-sm shadow-sm"
          >
            <input
              type="checkbox"
              checked={form[mode].enabled}
              onChange={(e) => onChange(toggleMode(form, mode, e.target.checked))}
            />
            <span className="font-medium text-stone-800">{mode}</span>
          </label>
        ))}
      </div>

      {APP_PAYMENT_MODES.filter((m) => form[m].enabled).map((mode) => {
        const row = form[mode];
        const rowBillTarget = mode === "Cash" ? cashBillTargetInr(form, targetInr) : 0;
        const onlyCash =
          mode === "Cash" && APP_PAYMENT_MODES.filter((m) => form[m].enabled).length === 1;

        return (
          <div key={mode} className="w-full min-w-0 rounded-xl border border-zimson-200/90 bg-zimson-50/40 p-3">
            {mode === "Cash" ? (
              <p className="text-xs text-stone-600">
                Bill cash due:{" "}
                <strong className="text-zimson-900">
                  {rowBillTarget.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                </strong>
                {onlyCash && targetInr > 0 ? (
                  <span className="ml-2 text-stone-500">(from {amountLabel} total)</span>
                ) : null}
              </p>
            ) : null}

            <div
              className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between ${mode === "Cash" ? "mt-2" : ""}`}
            >
              <label className="block min-w-0 flex-1 text-xs font-semibold text-zimson-900 sm:min-w-[12rem]">
                <span className="mb-1 block">
                  {mode === "Cash" ? "Cash bill amount (INR)" : `${mode} amount (INR)`}
                </span>
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
              </label>
              {targetInr > 0 && !(mode === "Cash" && onlyCash) ? (
                <button
                  type="button"
                  onClick={() => fillRemaining(mode)}
                  className="rounded-lg border border-zimson-300 bg-white px-2 py-1 text-xs font-semibold text-zimson-800 hover:bg-zimson-50"
                >
                  Use remaining
                </button>
              ) : null}
            </div>

            {mode !== "Cash" ? (
              <label className="mt-3 block min-w-0 text-xs text-stone-600">
                <span className="mb-1 block">
                  {mode} reference {mode === "UPI" ? "(UTR / transaction id)" : "(optional)"}
                </span>
                <input
                  id={`${idPrefix}-${mode}-ref`}
                  className={inputClass}
                  value={row.reference}
                  onChange={(e) =>
                    onChange(patchRow(form, mode, { reference: sanitizeAlphanumericInput(e.target.value, 80) }))
                  }
                  placeholder={
                    mode === "UPI"
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
        <p className="text-xs text-stone-600">
          Split total for {amountLabel}:{" "}
          <strong className="text-zimson-900">
            {splitSum.toLocaleString(undefined, { style: "currency", currency: "INR" })}
          </strong>
          {" / "}
          <strong>{targetInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}</strong>
          {matchTarget ? (
            <span className="ml-2 text-emerald-700">(matches)</span>
          ) : (
            <span className="ml-2 text-amber-700">(must match {amountLabel} total)</span>
          )}
        </p>
      ) : null}
    </div>
  );
}
