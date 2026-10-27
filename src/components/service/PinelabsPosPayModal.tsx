import { useCallback, useEffect, useRef, useState } from "react";
import { AppModal } from "../ui/AppModal";
import { ApiError, apiJson } from "../../lib/api";
import { modalBtnDanger, modalBtnPrimary, modalBtnSecondary, modalFooterClass } from "../../lib/appModalStyles";
import type { PinelabsPosMode, PinelabsTxn } from "../../types/pinelabsPayment";

const POLL_MS = 3000;

type Props = {
  open: boolean;
  storeId: string | null;
  mode: PinelabsPosMode;
  amountInr: number;
  purpose: string;
  onClose: () => void;
  onApproved: (txn: PinelabsTxn) => void;
};

export function posReferenceFromTxn(txn: PinelabsTxn): string {
  return [
    `PL ${txn.ptrid ?? ""}`.trim(),
    txn.rrn ? `RRN ${txn.rrn}` : "",
    txn.approvalCode ? `AC ${txn.approvalCode}` : "",
    txn.cardLast4 ? `XX${txn.cardLast4}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function PinelabsPosPayModal({ open, storeId, mode, amountInr, purpose, onClose, onApproved }: Props) {
  const [txn, setTxn] = useState<PinelabsTxn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const onApprovedRef = useRef(onApproved);
  onApprovedRef.current = onApproved;

  const stopPolling = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const upload = useCallback(async () => {
    setBusy(true);
    setError(null);
    setTxn(null);
    try {
      const out = await apiJson<{ txn: PinelabsTxn }>("/api/payments/pinelabs/upload", {
        method: "POST",
        json: { storeId, mode, amountInr, purpose },
        silent: true,
      });
      setTxn(out.txn);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send the amount to the POS machine.");
    } finally {
      setBusy(false);
    }
  }, [storeId, mode, amountInr, purpose]);

  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      stopPolling();
      setTxn(null);
      setError(null);
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    void upload();
  }, [open, upload, stopPolling]);

  useEffect(() => {
    stopPolling();
    if (!open || !txn || txn.status !== "UPLOADED") return;
    const id = txn.id;
    pollRef.current = window.setInterval(() => {
      void apiJson<{ txn: PinelabsTxn }>(`/api/payments/pinelabs/${encodeURIComponent(id)}/status`, { silent: true })
        .then((out) => {
          setTxn(out.txn);
          if (out.txn.status === "APPROVED") {
            stopPolling();
            onApprovedRef.current(out.txn);
          } else if (out.txn.status !== "UPLOADED") {
            stopPolling();
          }
        })
        .catch(() => {
          /* keep polling — network blips are common on store Wi-Fi */
        });
    }, POLL_MS);
    return stopPolling;
  }, [open, txn?.id, txn?.status, stopPolling]);

  async function cancelOnMachine() {
    if (!txn || txn.status !== "UPLOADED") {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const out = await apiJson<{ txn: PinelabsTxn }>(`/api/payments/pinelabs/${encodeURIComponent(txn.id)}/cancel`, {
        method: "POST",
        silent: true,
      });
      setTxn(out.txn);
      stopPolling();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not cancel on the POS machine.");
    } finally {
      setBusy(false);
    }
  }

  const status = txn?.status;
  const amountLabel = amountInr.toLocaleString("en-IN", { style: "currency", currency: "INR" });

  return (
    <AppModal
      open={open}
      onClose={() => {
        if (status === "UPLOADED") return;
        onClose();
      }}
      eyebrow="Pine Labs POS"
      title={mode === "upi" ? "UPI on POS machine" : "Card on POS machine"}
      size="sm"
      zIndex={140}
      closeOnBackdrop={false}
      footer={
        <div className={modalFooterClass}>
          {status === "UPLOADED" ? (
            <button type="button" className={modalBtnDanger} disabled={busy} onClick={() => void cancelOnMachine()}>
              {busy ? "Cancelling…" : "Cancel on machine"}
            </button>
          ) : null}
          {status === "FAILED" || status === "CANCELLED" || (!txn && error) ? (
            <button type="button" className={modalBtnPrimary} disabled={busy} onClick={() => void upload()}>
              Send again
            </button>
          ) : null}
          {status !== "UPLOADED" ? (
            <button type="button" className={modalBtnSecondary} disabled={busy} onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-center text-2xl font-bold tabular-nums text-zimson-900">{amountLabel}</p>
        {busy && !txn ? <p className="text-center text-stone-600">Sending to POS machine…</p> : null}
        {status === "UPLOADED" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
            <p className="font-semibold text-amber-950">Complete the payment on the POS machine</p>
            <p className="mt-1 text-xs text-amber-900">
              Reference <span className="font-mono font-semibold">{txn?.ptrid}</span> · waiting for payment…
            </p>
            <span className="mx-auto mt-3 block h-1.5 w-24 animate-pulse bg-amber-400" aria-hidden />
          </div>
        ) : null}
        {status === "APPROVED" ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
            <p className="font-semibold text-emerald-900">Payment approved</p>
            <p className="mt-1 font-mono text-xs text-emerald-900">{txn ? posReferenceFromTxn(txn) : ""}</p>
          </div>
        ) : null}
        {status === "FAILED" || status === "CANCELLED" ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-rose-900">
            <p className="font-semibold">{status === "CANCELLED" ? "Cancelled" : "Payment not completed"}</p>
            {txn?.responseMessage ? <p className="mt-1 text-xs">{txn.responseMessage}</p> : null}
          </div>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>
        ) : null}
      </div>
    </AppModal>
  );
}
