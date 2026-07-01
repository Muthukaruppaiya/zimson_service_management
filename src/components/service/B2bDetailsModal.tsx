import { useState } from "react";
import { ApiError, apiJson } from "../../lib/api";
import {
  sanitizeGstPanInput,
} from "../../lib/inputSanitize";
import {
  isValidGstFormat,
  isValidPanFormat,
  panFromGstin,
} from "../../data/serviceSeed";
import { validateCustomerB2bGstin } from "../../lib/zimsonCompanyGst";
import { inputClass, inputClassReadOnly } from "../../lib/uiForm";
import { companyNameFromGstLookup, lookupCompanyByGstin } from "../../lib/gstLookupClient";

export type B2bDetailsSavedExtras = {
  address?: string;
  city?: string;
};

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
  onSaved: (company: string, gst: string, pan: string, extras?: B2bDetailsSavedExtras) => void;
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
  const [gstFetchBusy, setGstFetchBusy] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [fetchedAddress, setFetchedAddress] = useState<string | undefined>();
  const [fetchedCity, setFetchedCity] = useState<string | undefined>();
  /** After successful GST lookup, GSTIN / company / PAN are read-only. */
  const [gstLookupLocked, setGstLookupLocked] = useState(false);

  // Auto-fill PAN from GSTIN
  const resolvedPan = pan.trim() || panFromGstin(gst) || "";
  const fieldLocked = gstLookupLocked;

  async function fetchCompanyFromGst() {
    if (!isValidGstFormat(gst)) {
      setError("Enter a valid 15-character GSTIN before lookup.");
      return;
    }
    const zimsonErr = validateCustomerB2bGstin(gst);
    if (zimsonErr) {
      setError(zimsonErr);
      return;
    }
    setGstFetchBusy(true);
    setError(null);
    try {
      const out = await lookupCompanyByGstin(gst);
      const name = companyNameFromGstLookup(out);
      if (name) setCompany(name);
      const derivedPan = panFromGstin(gst);
      if (derivedPan) setPan(derivedPan);
      if (out.address?.trim()) setFetchedAddress(out.address.trim());
      if (out.city?.trim()) setFetchedCity(out.city.trim());
      setGstLookupLocked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch company from GSTIN.");
    } finally {
      setGstFetchBusy(false);
    }
  }

  async function handleSave() {
    setError(null);

    if (!gstLookupLocked) {
      setError("Fetch company from GST before saving.");
      return;
    }
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
            ...(fetchedAddress ? { address: fetchedAddress } : {}),
            ...(fetchedCity ? { city: fetchedCity } : {}),
          },
        },
      );
      const saved = resp.customer;
      const extras: B2bDetailsSavedExtras | undefined =
        fetchedAddress || fetchedCity
          ? { address: fetchedAddress, city: fetchedCity }
          : undefined;
      onSaved(
        saved.company ?? company.trim(),
        saved.gst    ?? gst.trim().toUpperCase(),
        saved.pan    ?? resolvedPan.trim().toUpperCase(),
        extras,
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

          {/* GSTIN — only editable field until lookup succeeds */}
          <div>
            <label htmlFor="b2b-gst" className="text-xs font-medium text-stone-700">
              GSTIN *
            </label>
            <div className="mt-0.5 flex flex-wrap items-end gap-2">
              <input
                id="b2b-gst"
                className={`${fieldLocked ? inputClassReadOnly : inputClass} min-w-[200px] flex-1`}
                value={gst}
                onChange={(e) => {
                  const val = sanitizeGstPanInput(e.target.value, 15);
                  setGst(val);
                  if (!fieldLocked) {
                    setCompany("");
                    const derived = panFromGstin(val);
                    setPan(derived || "");
                  }
                }}
                placeholder="15-character GSTIN"
                maxLength={15}
                disabled={busy || gstFetchBusy}
                readOnly={fieldLocked}
                autoFocus={!fieldLocked}
              />
              <button
                type="button"
                onClick={() => void fetchCompanyFromGst()}
                disabled={busy || gstFetchBusy || fieldLocked}
                className="rounded-xl border border-zimson-500 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm hover:bg-zimson-50 disabled:opacity-60"
              >
                {gstFetchBusy ? "…" : fieldLocked ? "Fetched from GST" : "Fetch company from GST"}
              </button>
            </div>
          </div>

          {/* Company — filled from GST lookup only */}
          <div>
            <label htmlFor="b2b-company" className="text-xs font-medium text-stone-700">
              Company / legal name *
            </label>
            <input
              id="b2b-company"
              className={inputClassReadOnly}
              value={company}
              placeholder="Fetched from GST lookup"
              readOnly
              tabIndex={-1}
            />
          </div>

          {/* PAN — derived from GST lookup / GSTIN only */}
          <div>
            <label htmlFor="b2b-pan" className="text-xs font-medium text-stone-700">
              PAN *
            </label>
            <input
              id="b2b-pan"
              className={inputClassReadOnly}
              value={resolvedPan}
              placeholder="Filled after GST lookup"
              readOnly
              tabIndex={-1}
            />
            {/* <p className="mt-1 text-[11px] text-stone-500">
              Taken from the GST registry or characters 3–12 of the GSTIN.
            </p> */}
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
