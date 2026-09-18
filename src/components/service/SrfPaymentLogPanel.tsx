import { useCallback, useEffect, useMemo, useState } from "react";
import { MultiPaymentFields } from "./MultiPaymentFields";
import { ApiError, apiJson } from "../../lib/api";
import { formatInr } from "../../lib/formatInr";
import {
  buildMultiPaymentPayload,
  emptyMultiPaymentForm,
  formatPaymentSummary,
  validateMultiPaymentForm,
} from "../../lib/paymentModes";
import { sanitizeDecimalInput } from "../../lib/inputSanitize";
import type { SrfPaymentRecord } from "../../types/srfJob";

function kindLabel(kind: string): string {
  return kind === "booking_advance" ? "Booking advance" : "Additional";
}

export function SrfPaymentLogPanel({
  srfId,
  estimateInr,
  paidInr,
  allowCollect,
  defaultOpen = true,
  onCollected,
}: {
  srfId: string;
  estimateInr: number;
  paidInr: number;
  allowCollect?: boolean;
  defaultOpen?: boolean;
  onCollected?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [payments, setPayments] = useState<SrfPaymentRecord[]>([]);
  const [loadedPaid, setLoadedPaid] = useState(paidInr);
  const [loadedEstimate, setLoadedEstimate] = useState(estimateInr);
  const [status, setStatus] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [form, setForm] = useState(emptyMultiPaymentForm);
  const [showCollect, setShowCollect] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<{
        payments: SrfPaymentRecord[];
        paidInr: number;
        estimateInr: number;
        status: string;
      }>(`/api/service/srf-jobs/${encodeURIComponent(srfId)}/payments`);
      setPayments(data.payments ?? []);
      setLoadedPaid(Number(data.paidInr ?? 0));
      setLoadedEstimate(Number(data.estimateInr ?? estimateInr));
      setStatus(data.status ?? "");
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load payments.");
    }
  }, [srfId, estimateInr]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const amountN = Number.parseFloat(amount) || 0;
  const remaining = Math.max(0, Math.round(((loadedEstimate || estimateInr) - loadedPaid) * 100) / 100);
  const closed = status === "closed" || status === "cancelled";
  const canCollect = Boolean(allowCollect) && !closed;

  const rows = useMemo(() => payments, [payments]);

  async function submit() {
    setErr(null);
    if (!Number.isFinite(amountN) || amountN <= 0) {
      setErr("Enter a valid additional amount.");
      return;
    }
    const payErr = validateMultiPaymentForm(form, amountN);
    if (payErr) {
      setErr(payErr);
      return;
    }
    const payload = buildMultiPaymentPayload(form, amountN);
    if ("error" in payload) {
      setErr(payload.error);
      return;
    }
    setBusy(true);
    try {
      await apiJson(`/api/service/srf-jobs/${encodeURIComponent(srfId)}/payments`, {
        method: "POST",
        json: {
          amountInr: amountN,
          paymentMode: payload.paymentMode,
          paymentDetails: payload.paymentDetails,
          note,
        },
      });
      setAmount("");
      setNote("");
      setForm(emptyMultiPaymentForm());
      setShowCollect(false);
      await load();
      onCollected?.();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not record payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-rlx-rule bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
          Payments against this SRF
        </span>
        <span className="text-sm font-semibold tabular-nums text-rlx-green">
          {formatInr(open ? loadedPaid : paidInr)}
          {(open ? loadedEstimate : estimateInr) > 0 ? (
            <span className="ml-1 font-normal text-stone-400">/ {formatInr(open ? loadedEstimate : estimateInr)}</span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div className="border-t border-rlx-rule px-3 py-3">
          {err ? <p className="mb-2 text-xs text-rose-700">{err}</p> : null}
          {rows.length === 0 ? (
            <p className="text-xs text-stone-400">No customer payments logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-stone-100 pb-2 text-xs last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-800">
                      {kindLabel(p.kind)} · {formatInr(p.amountInr)}
                    </p>
                    <p className="text-stone-500">
                      {formatPaymentSummary(p.paymentMode, p.paymentDetails)}
                      {p.note ? ` · ${p.note}` : ""}
                    </p>
                    <p className="text-[11px] text-stone-400">
                      {new Date(p.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {p.collectedByName ? ` · ${p.collectedByName}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-stone-600">
            Total paid <span className="font-semibold text-stone-800">{formatInr(loadedPaid)}</span>
            {remaining > 0 ? (
              <>
                {" "}
                · Remaining vs estimate <span className="font-semibold">{formatInr(remaining)}</span>
              </>
            ) : (loadedEstimate || estimateInr) > 0 ? (
              <> · Estimate covered</>
            ) : null}
          </p>
          {canCollect ? (
            showCollect ? (
              <div className="mt-3 space-y-3 border-t border-dashed border-rlx-rule pt-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
                  Additional payment
                </p>
                <p className="text-[11px] text-stone-500">
                  After discussing a higher estimate, log what the customer paid now. It stays on this SRF.
                </p>
                <label className="block text-xs font-medium text-stone-600">
                  Amount (₹)
                  <input
                    className="mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm outline-none focus:border-rlx-green"
                    value={amount}
                    onChange={(e) => setAmount(sanitizeDecimalInput(e.target.value))}
                    placeholder="0.00"
                  />
                </label>
                {amountN > 0 ? (
                  <MultiPaymentFields
                    idPrefix={`srf-pay-${srfId}`}
                    amountLabel="payment"
                    targetInr={amountN}
                    form={form}
                    onChange={setForm}
                  />
                ) : null}
                <label className="block text-xs font-medium text-stone-600">
                  Note
                  <input
                    className="mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm outline-none focus:border-rlx-green"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Extra after revised estimate"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submit()}
                    className="bg-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white disabled:opacity-40"
                  >
                    {busy ? "Saving…" : "Log payment"}
                  </button>
                  <button
                    type="button"
                    className="border border-rlx-rule px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-500"
                    onClick={() => setShowCollect(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="mt-3 border border-dashed border-rlx-rule px-3 py-2 text-xs font-semibold uppercase tracking-widest text-rlx-green hover:border-rlx-green"
                onClick={() => setShowCollect(true)}
              >
                + Additional payment
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
