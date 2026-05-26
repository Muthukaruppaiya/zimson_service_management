import {
  ADVANCE_CASH_DENOMS,
  APP_PAYMENT_MODES,
  cashTotalFromFormRow,
  emptyCashDenomStrings,
  sumMultiPaymentFormAmounts,
  type AppPaymentMode,
  type MultiPaymentFormState,
  type PaymentModeFormRow,
} from "../../lib/paymentModes";
import { sanitizeAlphanumericInput, sanitizeDecimalInput } from "../../lib/inputSanitize";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none ring-zimson-400/40 placeholder:text-stone-400 transition focus:border-zimson-500 focus:ring-2";

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
      cashStrings: emptyCashDenomStrings(),
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
    <div className="min-w-0 space-y-3">
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
        const cashTotal = mode === "Cash" ? cashTotalFromFormRow(row) : 0;
        const rowAmount = Number.parseFloat(row.amount);
        const rowAmt = Number.isFinite(rowAmount) ? rowAmount : 0;

        return (
          <div key={mode} className="rounded-xl border border-zimson-200/90 bg-zimson-50/40 p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="min-w-[140px] flex-1 text-xs font-semibold text-zimson-900">
                {mode} amount (INR)
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(e) =>
                    onChange(patchRow(form, mode, { amount: sanitizeDecimalInput(e.target.value) }))
                  }
                  placeholder="0.00"
                />
              </label>
              {targetInr > 0 ? (
                <button
                  type="button"
                  onClick={() => fillRemaining(mode)}
                  className="rounded-lg border border-zimson-300 bg-white px-2 py-1 text-xs font-semibold text-zimson-800 hover:bg-zimson-50"
                >
                  Use remaining
                </button>
              ) : null}
            </div>

            {mode === "Cash" ? (
              <div className="mt-3 rounded-xl border border-zimson-200 bg-white p-3">
                <p className="text-xs font-semibold text-zimson-900">Cash denomination</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {ADVANCE_CASH_DENOMS.map(({ key, label }) => (
                    <label key={key} className="text-xs text-stone-600">
                      {label}
                      <input
                        className={inputClass}
                        inputMode="numeric"
                        value={row.cashStrings[key]}
                        onChange={(e) =>
                          onChange(
                            patchRow(form, mode, {
                              cashStrings: { ...row.cashStrings, [key]: e.target.value },
                            }),
                          )
                        }
                      />
                    </label>
                  ))}
                  <label className="text-xs text-stone-600 sm:col-span-2">
                    Coins / loose (INR)
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={row.cashStrings.coinsInr}
                      onChange={(e) =>
                        onChange(
                          patchRow(form, mode, {
                            cashStrings: { ...row.cashStrings, coinsInr: e.target.value },
                          }),
                        )
                      }
                      placeholder="0.00"
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs text-stone-600">
                  Denomination total:{" "}
                  <strong className="text-zimson-900">
                    {cashTotal.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                  </strong>
                  {rowAmt > 0 && Math.abs(cashTotal - rowAmt) > 0.02 ? (
                    <span className="ml-2 text-amber-700">(must match {mode} amount)</span>
                  ) : rowAmt > 0 ? (
                    <span className="ml-2 text-emerald-700">(matches {mode} amount)</span>
                  ) : null}
                </p>
              </div>
            ) : (
              <label className="mt-3 block text-xs text-stone-600">
                {mode} reference {mode === "UPI" ? "(UTR / transaction id)" : "(optional)"}
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
            )}
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
