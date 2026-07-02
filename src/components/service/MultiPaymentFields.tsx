import { useEffect, useRef, useState } from "react";
import { CashChangeReturnModal } from "./CashChangeReturnModal";
import {
  ADVANCE_CASH_DENOMS,
  APP_PAYMENT_MODES,
  cashBillTargetInr,
  cashChangeDueInr,
  cashTotalFromFormRow,
  changeTotalFromFormRow,
  emptyCashDenomStrings,
  formatCashDenomStringsText,
  netCashAfterChangeInr,
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
      cashStrings: emptyCashDenomStrings(),
      changeReturnedStrings: emptyCashDenomStrings(),
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
  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const autoOpenedForTenderRef = useRef<number | null>(null);

  const cashRow = form.Cash;
  const cashTotal = cashRow.enabled ? cashTotalFromFormRow(cashRow) : 0;
  const cashBillTarget = cashRow.enabled ? cashBillTargetInr(form, targetInr) : 0;
  const changeDue = cashChangeDueInr(cashTotal, cashBillTarget);
  const changeRecorded = changeTotalFromFormRow(cashRow);
  const changeMatches = changeDue <= 0.02 || Math.abs(changeRecorded - changeDue) <= 0.02;
  const netDeposit = netCashAfterChangeInr(cashTotal, changeRecorded);
  const tenderBreakdownText = formatCashDenomStringsText(cashRow.cashStrings);

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

  useEffect(() => {
    if (!cashRow.enabled || cashBillTarget <= 0 || changeDue <= 0.02) {
      autoOpenedForTenderRef.current = null;
      return;
    }
    if (changeMatches) return;
    if (autoOpenedForTenderRef.current === cashTotal) return;
    autoOpenedForTenderRef.current = cashTotal;
    setChangeModalOpen(true);
  }, [cashRow.enabled, cashBillTarget, cashTotal, changeDue, changeMatches]);

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
        const rowCashTotal = mode === "Cash" ? cashTotalFromFormRow(row) : 0;
        const rowBillTarget = mode === "Cash" ? cashBillTargetInr(form, targetInr) : 0;
        const rowChangeDue = mode === "Cash" ? cashChangeDueInr(rowCashTotal, rowBillTarget) : 0;
        const rowChangeRecorded = mode === "Cash" ? changeTotalFromFormRow(row) : 0;
        const rowChangeOk = rowChangeDue <= 0.02 || Math.abs(rowChangeRecorded - rowChangeDue) <= 0.02;
        const exactCashMatch = rowBillTarget > 0 && Math.abs(rowCashTotal - rowBillTarget) <= 0.02;
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

            <div className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between ${mode === "Cash" ? "mt-2" : ""}`}>
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

            {mode === "Cash" ? (
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-zimson-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-zimson-900">Cash received from customer</p>
                    <button
                      type="button"
                      onClick={() =>
                        onChange(
                          patchRow(form, mode, {
                            cashStrings: emptyCashDenomStrings(),
                            changeReturnedStrings: emptyCashDenomStrings(),
                          }),
                        )
                      }
                      className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-900"
                    >
                      Clear
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    Enter all notes/coins the customer gave you (can be more than the bill).
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {ADVANCE_CASH_DENOMS.map(({ key, label }) => (
                      <label key={key} className="block min-w-0 text-xs text-stone-600">
                        <span className="mb-1 block">{label}</span>
                        <input
                          className={inputClass}
                          inputMode="numeric"
                          value={row.cashStrings[key]}
                          onChange={(e) =>
                            onChange(
                              patchRow(form, mode, {
                                cashStrings: { ...row.cashStrings, [key]: e.target.value.replace(/\D/g, "") },
                              }),
                            )
                          }
                        />
                      </label>
                    ))}
                    <label className="col-span-2 block min-w-0 text-xs text-stone-600 sm:col-span-2 lg:col-span-2">
                      <span className="mb-1 block">Coins / loose (INR)</span>
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        value={row.cashStrings.coinsInr}
                        onChange={(e) =>
                          onChange(
                            patchRow(form, mode, {
                              cashStrings: {
                                ...row.cashStrings,
                                coinsInr: e.target.value.replace(/[^0-9.]/g, ""),
                              },
                            }),
                          )
                        }
                        placeholder="0.00"
                      />
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-stone-600">
                    Total received:{" "}
                    <strong className="text-zimson-900">
                      {rowCashTotal.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                    </strong>
                    {rowBillTarget > 0 && exactCashMatch ? (
                      <span className="ml-2 text-emerald-700">(exact — no change)</span>
                    ) : rowBillTarget > 0 && rowChangeDue > 0.02 ? (
                      <span className="ml-2 text-amber-700">
                        → return{" "}
                        {rowChangeDue.toLocaleString(undefined, { style: "currency", currency: "INR" })} to customer
                      </span>
                    ) : rowBillTarget > 0 && rowCashTotal < rowBillTarget - 0.02 ? (
                      <span className="ml-2 text-amber-700">(short of bill amount)</span>
                    ) : null}
                  </p>
                </div>

                {rowChangeDue > 0.02 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
                    <p className="text-sm font-semibold text-amber-950">
                      Change to return:{" "}
                      {rowChangeDue.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                    </p>
                    <p className="mt-1 text-xs text-amber-900">
                      Record only the ₹{rowChangeDue.toFixed(2)} you give back — e.g. 1×₹100 note.
                    </p>
                    {rowChangeOk ? (
                      <p className="mt-1 text-xs text-emerald-800">
                        Change recorded:{" "}
                        {rowChangeRecorded.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                        {" · "}
                        Net for deposit:{" "}
                        {netCashAfterChangeInr(rowCashTotal, rowChangeRecorded).toLocaleString(undefined, {
                          style: "currency",
                          currency: "INR",
                        })}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-amber-800">Open popup to enter change denomination.</p>
                    )}
                    <button
                      type="button"
                      onClick={() => setChangeModalOpen(true)}
                      className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100"
                    >
                      {rowChangeOk ? "Edit change return" : "Record change return"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
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

      <CashChangeReturnModal
        open={changeModalOpen}
        billAmountInr={cashBillTarget}
        tenderTotalInr={cashTotal}
        tenderBreakdownText={tenderBreakdownText}
        changeDueInr={changeDue}
        initialStrings={cashRow.changeReturnedStrings}
        onClose={() => setChangeModalOpen(false)}
        onConfirm={(changeStrings) => {
          onChange(patchRow(form, "Cash", { changeReturnedStrings: changeStrings }));
          setChangeModalOpen(false);
        }}
      />
    </div>
  );
}
