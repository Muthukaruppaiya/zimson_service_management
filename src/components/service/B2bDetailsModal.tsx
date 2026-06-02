import { useState } from "react";
import { ApiError, apiJson } from "../../lib/api";
import {
  sanitizeGstPanInput,
  sanitizeTextInput,
} from "../../lib/inputSanitize";
import {
  isValidGstFormat,
  isValidPanFormat,
  panFromGstin,
} from "../../data/serviceSeed";
import { validateCustomerB2bGstin, ZIMSON_OWN_GSTIN_FIELD_HINT } from "../../lib/zimsonCompanyGst";
import { inputClass } from "../../lib/uiForm";

type Props = {
  /** Customer id in the master — used for PUT /api/customers/:id */
  customerId: string;
  customerName: string;
  phone: string;
  email: string;
  /** Pre-fill from what's already in state (may be empty) */
  initialCompany: string;
  initialGst: string;
  initialPan: string;
  onSaved: (company: string, gst: string, pan: string) => void;
  onCancel: () => void;
};

export function B2bDetailsModal({
  customerId,
  customerName,
  phone,
  email,
  initialCompany,
  initialGst,
  initialPan,
  onSaved,
  onCancel,
}: Props) {
  const [company, setCompany] = useState(initialCompany);
  const [gst, setGst]         = useState(initialGst);
  const [pan, setPan]         = useState(initialPan);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Auto-fill PAN from GSTIN
  const resolvedPan = pan.trim() || panFromGstin(gst) || "";

  async function handleSave() {
    setError(null);

    if (!company.trim()) {
      setError("Company / legal name is required.");
      return;
    }
    if (!isValidGstFormat(gst)) {
      setError("Enter a valid 15-character GSTIN.");
      return;
    }
    const zimsonErr = validateCustomerB2bGstin(gst);
    if (zimsonErr) {
      setError(zimsonErr);
      return;
    }
    if (!isValidPanFormat(resolvedPan)) {
      setError("Enter a valid PAN (e.g. ABCDE1234F), or enter a GSTIN that contains a valid PAN.");
      return;
    }

    setBusy(true);
    try {
      const resp = await apiJson<{ customer: { company?: string; gst?: string; pan?: string } }>(
        `/api/customers/${encodeURIComponent(customerId)}`,
        {
          method: "PUT",
          json: {
            displayName: customerName,
            phone,
            email,
            customerKind: "B2B",
            company: company.trim(),
            gst: gst.trim().toUpperCase(),
            pan: resolvedPan.trim().toUpperCase(),
          },
        },
      );
      const saved = resp.customer;
      onSaved(
        saved.company ?? company.trim(),
        saved.gst    ?? gst.trim().toUpperCase(),
        saved.pan    ?? resolvedPan.trim().toUpperCase(),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save B2B details. Check connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="b2b-modal-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-zimson-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="rounded-t-2xl border-b border-zimson-100 bg-zimson-700 px-5 py-4">
          <h2 id="b2b-modal-title" className="text-base font-bold text-white">
            B2B billing details required
          </h2>
          <p className="mt-0.5 text-xs text-white/75">
            These details will be saved to the customer master and used on the invoice.
          </p>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-5">
          {error ? (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-sm text-rose-900" role="alert">
              {error}
            </div>
          ) : null}

          {/* Company */}
          <div>
            <label htmlFor="b2b-company" className="text-xs font-medium text-stone-700">
              Company / legal name *
            </label>
            <input
              id="b2b-company"
              className={inputClass}
              value={company}
              onChange={(e) => setCompany(sanitizeTextInput(e.target.value, 240))}
              placeholder="Registered business name"
              disabled={busy}
              autoFocus
            />
          </div>

          {/* GSTIN */}
          <div>
            <label htmlFor="b2b-gst" className="text-xs font-medium text-stone-700">
              GSTIN *
            </label>
            <input
              id="b2b-gst"
              className={inputClass}
              value={gst}
              onChange={(e) => {
                const val = sanitizeGstPanInput(e.target.value, 15);
                setGst(val);
                // auto-fill PAN if not manually entered
                if (!pan.trim()) {
                  const derived = panFromGstin(val);
                  if (derived) setPan(derived);
                }
              }}
              placeholder="15-character GSTIN"
              maxLength={15}
              disabled={busy}
            />
            <p className="mt-1 text-[11px] leading-snug text-amber-900/90">
              {ZIMSON_OWN_GSTIN_FIELD_HINT}
            </p>
          </div>

          {/* PAN */}
          <div>
            <label htmlFor="b2b-pan" className="text-xs font-medium text-stone-700">
              PAN *
            </label>
            <input
              id="b2b-pan"
              className={inputClass}
              value={pan}
              onChange={(e) => setPan(sanitizeGstPanInput(e.target.value, 10))}
              placeholder="ABCDE1234F"
              maxLength={10}
              disabled={busy}
            />
            {resolvedPan && resolvedPan !== pan.trim() ? (
              <p className="mt-0.5 text-[11px] text-stone-500">
                Auto-filled from GSTIN: {resolvedPan}
              </p>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 rounded-b-2xl border-t border-stone-100 bg-stone-50 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className="rounded-xl bg-zimson-700 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zimson-800 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save & switch to B2B"}
          </button>
        </div>
      </div>
    </div>
  );
}
