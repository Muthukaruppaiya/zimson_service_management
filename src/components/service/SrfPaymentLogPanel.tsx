import { useCallback, useEffect, useMemo, useState } from "react";
import { MultiPaymentFields } from "./MultiPaymentFields";
import { AppModal } from "../ui/AppModal";
import { ApiError, apiJson } from "../../lib/api";
import { formatInr } from "../../lib/formatInr";
import { printSrfPaymentReceipt } from "../../lib/srfPaymentReceiptDoc";
import type { SrfPaymentReceiptView } from "../../types/srfPaymentReceipt";
import {
  buildMultiPaymentPayload,
  emptyMultiPaymentForm,
  formatPaymentSummary,
  validateMultiPaymentForm,
} from "../../lib/paymentModes";
import { sanitizeAlphanumericInput, sanitizeDecimalInput, sanitizeMultilineTextInput } from "../../lib/inputSanitize";
import {
  modalBtnPrimary,
  modalBtnSecondary,
  modalFooterClass,
  modalInputClass,
  modalTextareaClass,
} from "../../lib/appModalStyles";
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [form, setForm] = useState(emptyMultiPaymentForm);
  const [showCollect, setShowCollect] = useState(false);
  const [collectErr, setCollectErr] = useState<string | null>(null);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);

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

  async function printOne(paymentId: string) {
    setErr(null);
    try {
      const data = await apiJson<{ receipt: SrfPaymentReceiptView }>(
        `/api/service/srf-jobs/${encodeURIComponent(srfId)}/payments/${encodeURIComponent(paymentId)}/receipt`,
      );
      printSrfPaymentReceipt(data.receipt);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not open payment receipt.");
    }
  }

  async function sendSms(paymentId: string) {
    setErr(null);
    setStatusMsg(null);
    setBusyId(paymentId);
    try {
      const data = await apiJson<{
        smsSent: boolean;
        smsReason?: string | null;
        smsPin?: string | null;
        whatsappSent?: boolean;
        whatsappReason?: string | null;
        emailSent?: boolean;
        emailReason?: string | null;
      }>(
        `/api/service/srf-jobs/${encodeURIComponent(srfId)}/payments/${encodeURIComponent(paymentId)}/send-receipt`,
        { method: "POST" },
      );
      const parts: string[] = [];
      if (data.smsSent) parts.push(data.smsPin ? `SMS sent (code ${data.smsPin})` : "SMS sent");
      if (data.whatsappSent) parts.push("WhatsApp sent");
      if (data.emailSent) parts.push("Email sent");
      if (parts.length > 0) {
        setStatusMsg(`${parts.join(". ")}.`);
      } else {
        setErr(
          data.smsReason ||
            data.whatsappReason ||
            data.emailReason ||
            "Could not send receipt. You can still print it.",
        );
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not send receipt.");
    } finally {
      setBusyId(null);
    }
  }

  function closeCollect() {
    setShowCollect(false);
    setCollectErr(null);
    setAmount("");
    setRemarks("");
    setReferenceNo("");
    setForm(emptyMultiPaymentForm());
  }

  async function submit() {
    setCollectErr(null);
    if (!Number.isFinite(amountN) || amountN <= 0) {
      setCollectErr("Enter a valid additional amount.");
      return;
    }
    const payErr = validateMultiPaymentForm(form, amountN);
    if (payErr) {
      setCollectErr(payErr);
      return;
    }
    const payload = buildMultiPaymentPayload(form, amountN);
    if ("error" in payload) {
      setCollectErr(payload.error);
      return;
    }
    const paymentDetails = {
      ...payload.paymentDetails,
      ...(referenceNo.trim() ? { reference: referenceNo.trim() } : {}),
    };
    setBusy(true);
    try {
      const out = await apiJson<{
        amountInr?: number;
        receiptNo?: string;
        smsSent?: boolean;
        smsReason?: string | null;
        smsPin?: string | null;
        whatsappSent?: boolean;
        emailSent?: boolean;
        paymentId?: string;
      }>(`/api/service/srf-jobs/${encodeURIComponent(srfId)}/payments`, {
        method: "POST",
        json: {
          amountInr: amountN,
          paymentMode: payload.paymentMode,
          paymentDetails,
          note: remarks.trim(),
        },
      });
      closeCollect();
      await load();
      if (out.paymentId) {
        await printOne(out.paymentId);
      }
      if (out.smsSent || out.whatsappSent || out.emailSent) {
        const parts: string[] = [];
        if (out.smsSent) parts.push(out.smsPin ? `SMS (code ${out.smsPin})` : "SMS");
        if (out.whatsappSent) parts.push("WhatsApp");
        if (out.emailSent) parts.push("email");
        setStatusMsg(`Receipt sent on ${parts.join(", ")}.`);
      } else if (out.smsSent === false && out.smsReason) {
        setErr(out.smsReason);
      }
      onCollected?.();
    } catch (e) {
      setCollectErr(e instanceof ApiError ? e.message : "Could not record payment.");
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
          {statusMsg ? <p className="mb-2 text-xs text-rlx-green">{statusMsg}</p> : null}
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
                      {p.receiptNo ? ` · ${p.receiptNo}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      className="rounded border border-rlx-rule px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-rlx-green hover:border-rlx-green"
                      onClick={() => void printOne(p.id)}
                    >
                      Print
                    </button>
                    <button
                      type="button"
                      disabled={busyId === p.id}
                      className="rounded border border-rlx-rule px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-600 hover:border-stone-400 disabled:opacity-40"
                      onClick={() => void sendSms(p.id)}
                    >
                      {busyId === p.id ? "Sending…" : "Send"}
                    </button>
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
            <button
              type="button"
              className="mt-3 border border-dashed border-rlx-rule px-3 py-2 text-xs font-semibold uppercase tracking-widest text-rlx-green hover:border-rlx-green"
              onClick={() => {
                setCollectErr(null);
                setShowCollect(true);
              }}
            >
              + Additional payment
            </button>
          ) : null}
        </div>
      ) : null}

      <AppModal
        open={showCollect}
        onClose={closeCollect}
        eyebrow="SRF payment"
        title="Additional payment"
        description="Log the amount the customer paid now. It stays on this SRF."
        size="md"
        zIndex={80}
        footer={
          <div className={modalFooterClass}>
            <button type="button" className={modalBtnSecondary} onClick={closeCollect} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={modalBtnPrimary} disabled={busy} onClick={() => void submit()}>
              {busy ? "Saving…" : "Log payment"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {collectErr ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{collectErr}</p>
          ) : null}
          <label className="block text-xs font-semibold text-stone-700">
            Amount (₹)
            <input
              className={modalInputClass}
              value={amount}
              onChange={(e) => setAmount(sanitizeDecimalInput(e.target.value))}
              placeholder="0.00"
              autoFocus
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
          <label className="block text-xs font-semibold text-stone-700">
            Reference number
            <input
              className={modalInputClass}
              value={referenceNo}
              onChange={(e) => setReferenceNo(sanitizeAlphanumericInput(e.target.value, 80))}
              placeholder="UTR / txn / receipt reference"
              maxLength={80}
            />
          </label>
          <label className="block text-xs font-semibold text-stone-700">
            Remarks
            <textarea
              className={modalTextareaClass}
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(sanitizeMultilineTextInput(e.target.value, 400))}
              placeholder="e.g. Extra after revised estimate"
            />
          </label>
        </div>
      </AppModal>
    </div>
  );
}
