import { useEffect, useMemo, useState } from "react";
import {
  ADVANCE_CASH_DENOMS,
  advanceDetailsFromFormStrings,
  cashDenomStringsFromBreakdown,
  emptyCashDenomStrings,
  formatCashDenomSuggestionText,
  netCashAfterChangeInr,
  suggestCashDenominationsForAmount,
  sumAdvanceCashDenominations,
  type AdvanceCashDenominations,
} from "../../lib/paymentModes";
import { inputClass } from "../../lib/uiForm";

type Props = {
  open: boolean;
  billAmountInr: number;
  tenderTotalInr: number;
  tenderBreakdownText: string;
  changeDueInr: number;
  initialStrings?: Record<keyof AdvanceCashDenominations, string>;
  onClose: () => void;
  onConfirm: (changeStrings: Record<keyof AdvanceCashDenominations, string>) => void;
};

export function CashChangeReturnModal({
  open,
  billAmountInr,
  tenderTotalInr,
  tenderBreakdownText,
  changeDueInr,
  initialStrings,
  onClose,
  onConfirm,
}: Props) {
  const [changeStrings, setChangeStrings] = useState(emptyCashDenomStrings);

  const bill = Math.round(billAmountInr * 100) / 100;
  const tender = Math.round(tenderTotalInr * 100) / 100;
  const due = Math.round(changeDueInr * 100) / 100;
  const suggestedBreakdown = useMemo(
    () => (due > 0 ? suggestCashDenominationsForAmount(due) : {}),
    [due],
  );
  const suggestedText = useMemo(() => formatCashDenomSuggestionText(suggestedBreakdown), [suggestedBreakdown]);
  const suggestedStrings = useMemo(
    () => cashDenomStringsFromBreakdown(suggestedBreakdown),
    [suggestedBreakdown],
  );

  useEffect(() => {
    if (!open) return;
    setChangeStrings(initialStrings ?? emptyCashDenomStrings());
  }, [open, initialStrings]);

  if (!open) return null;

  const changeEntered = sumAdvanceCashDenominations(
    advanceDetailsFromFormStrings("Cash", changeStrings, "").cash,
  );
  const matches = Math.abs(changeEntered - due) <= 0.02;
  const netDeposit = netCashAfterChangeInr(tender, changeEntered);
  const netMatchesBill = Math.abs(netDeposit - bill) <= 0.02;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-zimson-200 bg-zimson-50 px-5 py-4">
          <h3 className="text-base font-bold text-zimson-900">Record change returned to customer</h3>
          <p className="mt-1 text-sm text-stone-600">
            Customer paid more than the bill. Enter only the notes/coins you are giving back — not what you received.
          </p>

          <div className="mt-3 space-y-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-stone-600">Bill cash amount</span>
              <strong className="text-zimson-900">
                {bill.toLocaleString(undefined, { style: "currency", currency: "INR" })}
              </strong>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-stone-600">Cash received</span>
              <strong className="text-zimson-900">
                {tender.toLocaleString(undefined, { style: "currency", currency: "INR" })}
              </strong>
            </div>
            {tenderBreakdownText !== "—" ? (
              <p className="text-xs text-stone-500">Received: {tenderBreakdownText}</p>
            ) : null}
            <div className="border-t border-stone-100 pt-2">
              <div className="flex justify-between gap-3">
                <span className="font-semibold text-amber-900">Change to return (only)</span>
                <strong className="font-mono text-lg text-amber-950">
                  {due.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                </strong>
              </div>
            </div>
            <div className="flex justify-between gap-3 border-t border-stone-100 pt-2">
              <span className="text-stone-600">Net for bank deposit</span>
              <strong className={netMatchesBill ? "text-emerald-800" : "text-amber-800"}>
                {netDeposit.toLocaleString(undefined, { style: "currency", currency: "INR" })}
              </strong>
            </div>
          </div>

          {due > 0 && suggestedText !== "—" ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-900/80">
                    Example for ₹{due.toFixed(2)} change
                  </p>
                  <p className="mt-1 text-sm font-semibold text-emerald-950">{suggestedText}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setChangeStrings(suggestedStrings)}
                  className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                >
                  Use example
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-zimson-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-zimson-900">
                Change returned — ₹{due.toFixed(2)} only
              </p>
              <button
                type="button"
                onClick={() => setChangeStrings(emptyCashDenomStrings())}
                className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-900"
              >
                Clear
              </button>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              e.g. bill ₹4,500, received 8×₹500 + 3×₹200 (₹4,600) → enter 1×₹100 here.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ADVANCE_CASH_DENOMS.map(({ key, label }) => (
                <label key={key} className="block min-w-0 text-xs text-stone-600">
                  <span className="mb-1 block">{label}</span>
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={changeStrings[key]}
                    onChange={(e) =>
                      setChangeStrings((prev) => ({ ...prev, [key]: e.target.value.replace(/\D/g, "") }))
                    }
                  />
                </label>
              ))}
              <label className="col-span-2 block min-w-0 text-xs text-stone-600 sm:col-span-3">
                <span className="mb-1 block">Coins / loose (INR)</span>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={changeStrings.coinsInr}
                  onChange={(e) =>
                    setChangeStrings((prev) => ({
                      ...prev,
                      coinsInr: e.target.value.replace(/[^0-9.]/g, ""),
                    }))
                  }
                  placeholder="0.00"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-stone-600">
              Change entered:{" "}
              <strong className={matches ? "text-emerald-700" : "text-amber-800"}>
                {changeEntered.toLocaleString(undefined, { style: "currency", currency: "INR" })}
              </strong>
              {!matches ? (
                <span className="ml-2 text-amber-700">(must be exactly ₹{due.toFixed(2)})</span>
              ) : (
                <span className="ml-2 text-emerald-700">(matches change due)</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zimson-200 bg-stone-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!matches}
            onClick={() => onConfirm(changeStrings)}
            className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm change return
          </button>
        </div>
      </div>
    </div>
  );
}
