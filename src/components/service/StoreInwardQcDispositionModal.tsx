import type { SrfJob } from "../../types/srfJob";
import { AppModal } from "../ui/AppModal";
import {
  modalBtnGold,
  modalBtnPrimary,
  modalBtnSecondary,
  modalFooterClass,
  modalTextareaClass,
} from "../../lib/appModalStyles";
import { formatApproxEstimateCurrency, ESTIMATE_LABEL_APPROX } from "../../lib/formatInr";

export type StoreInwardQcAction = "wait" | "return_to_ho";

type Props = {
  open: boolean;
  tdNumber: string;
  failedRows: SrfJob[];
  action: StoreInwardQcAction;
  remark: string;
  saving: boolean;
  onActionChange: (action: StoreInwardQcAction) => void;
  onRemarkChange: (remark: string) => void;
  onConfirm: () => void;
  onClose: () => void;
};

export function StoreInwardQcDispositionModal({
  open,
  tdNumber,
  failedRows,
  action,
  remark,
  saving,
  onActionChange,
  onRemarkChange,
  onConfirm,
  onClose,
}: Props) {
  const count = failedRows.length;
  const plural = count === 1 ? "" : "s";

  return (
    <AppModal
      open={open}
      onClose={onClose}
      eyebrow="Store QC — not accepted"
      title={`${count} watch${plural} did not pass QC`}
      description={`Transfer ${tdNumber} · Choose what happens to the unchecked SRF${plural} before completing inward.`}
      size="lg"
      zIndex={60}
      closeOnBackdrop={!saving}
      footer={
        <div className={modalFooterClass}>
          <button type="button" onClick={onClose} disabled={saving} className={modalBtnSecondary}>
            Back to review
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || (action === "return_to_ho" && !remark.trim())}
            className={action === "return_to_ho" ? modalBtnGold : modalBtnPrimary}
          >
            {saving
              ? "Processing…"
              : action === "return_to_ho"
                ? `Send to outward queue (${count})`
                : `Keep in inward pending (${count})`}
          </button>
        </div>
      }
    >
      <ul className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        {failedRows.map((j) => (
          <li key={j.id} className="rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2 text-sm">
            <span className="font-mono font-semibold text-zimson-900">{j.reference}</span>
            <span className="text-slate-600"> · {j.customerName}</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              {j.watchBrand} {j.watchModel} · {ESTIMATE_LABEL_APPROX}{" "}
              {formatApproxEstimateCurrency(j.estimateTotalInr)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onActionChange("wait")}
          className={`rounded-xl border p-4 text-left transition ${
            action === "wait"
              ? "border-zimson-500 bg-zimson-50 ring-2 ring-zimson-200"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <p className="text-sm font-bold text-zimson-900">Keep in inward pending</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Leave on this transfer document. You can inward later after HO re-sends or when QC is resolved.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onActionChange("return_to_ho")}
          className={`rounded-xl border p-4 text-left transition ${
            action === "return_to_ho"
              ? "border-rlx-gold/60 bg-rlx-gold-light/40 ring-2 ring-rlx-gold/30"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <p className="text-sm font-bold text-rlx-gold-dark">Send back to HO for re-repair</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Moves to store outward queue. Create a new transfer, delivery-boy handoff, and HO inward — normal flow.
          </p>
        </button>
      </div>

      {action === "return_to_ho" ? (
        <label className="mt-4 block text-sm font-medium text-slate-800">
          Remarks for HO (required)
          <textarea
            className={modalTextareaClass}
            rows={3}
            value={remark}
            onChange={(e) => onRemarkChange(e.target.value)}
            placeholder="Explain why the watch failed store QC and is being sent back for re-repair…"
            autoFocus
          />
        </label>
      ) : (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Selected OK watches will be inwarded now. Unchecked SRF{plural} stay on{" "}
          <span className="font-mono font-semibold">{tdNumber}</span> until you inward them later.
        </p>
      )}
    </AppModal>
  );
}
