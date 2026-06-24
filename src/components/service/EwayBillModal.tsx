import { useEffect, useState } from "react";
import { apiJson, ApiError } from "../../lib/api";
import { formatEwayEdocMessage, type EdocUiResult } from "../../lib/edocResultMessage";
import {
  ewayGeneratePath,
  ewayPrefillPath,
  type EwayBillKind,
  type EwayPrefill,
} from "../../lib/ewayBill";
import { inputClass } from "../../lib/uiForm";

type Props = {
  open: boolean;
  kind: EwayBillKind;
  resourceId: string;
  onClose: () => void;
  onSuccess: (edoc: EdocUiResult) => void;
};

const TRANSPORT_MODES = ["Road", "Rail", "Air", "Ship"] as const;

export function EwayBillModal({ open, kind, resourceId, onClose, onSuccess }: Props) {
  const [prefill, setPrefill] = useState<EwayPrefill | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const [valueInr, setValueInr] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [distanceKm, setDistanceKm] = useState("0");
  const [transportMode, setTransportMode] = useState<(typeof TRANSPORT_MODES)[number]>("Road");
  const [transporterName, setTransporterName] = useState("");
  const [consigneeGstin, setConsigneeGstin] = useState("");
  const [consigneeName, setConsigneeName] = useState("");
  const [consigneeAddress, setConsigneeAddress] = useState("");
  const [consigneePlace, setConsigneePlace] = useState("");
  const [consigneePincode, setConsigneePincode] = useState("");
  const [sandboxNote, setSandboxNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void apiJson<{ effectiveEwayGstin?: string | null }>("/api/edoc/status")
      .then((s) => {
        if (cancelled || !s.effectiveEwayGstin) return;
        setSandboxNote(`E-way API userGstin: ${s.effectiveEwayGstin}`);
      })
      .catch(() => {
        if (!cancelled) setSandboxNote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !resourceId) return;
    let cancelled = false;
    setLoadErr(null);
    setPrefill(null);
    void apiJson<{ prefill: EwayPrefill }>(ewayPrefillPath(kind, resourceId))
      .then((out) => {
        if (cancelled) return;
        const p = out.prefill;
        setPrefill(p);
        setValueInr(String(p.defaultValueInr));
        setVehicleNumber(p.vehicleNumber);
        setDistanceKm("0");
        setTransportMode("Road");
        setTransporterName("");
        setConsigneeGstin(p.consigneeGstin);
        setConsigneeName("");
        setConsigneeAddress("");
        setConsigneePlace("");
        setConsigneePincode("");
        setSubmitErr(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadErr(e instanceof Error ? e.message : "Could not load e-way details.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, kind, resourceId]);

  if (!open) return null;

  async function handleSubmit() {
    if (!prefill) return;
    const taxableAmountInr = Number(valueInr);
    if (!Number.isFinite(taxableAmountInr) || taxableAmountInr <= 0) {
      setSubmitErr("Enter a valid goods / invoice value (INR).");
      return;
    }
    if (prefill.requiresConsigneeInput && !consigneeGstin.trim()) {
      setSubmitErr("Brand consignee GSTIN is required.");
      return;
    }
    setBusy(true);
    setSubmitErr(null);
    try {
      const out = await apiJson<{ edoc: EdocUiResult }>(ewayGeneratePath(kind, resourceId), {
        method: "POST",
        json: {
          taxableAmountInr,
          vehicleNumber: vehicleNumber.trim() || undefined,
          transportationDistanceKm: distanceKm.trim() || "0",
          transportationMode: transportMode,
          transporterName: transporterName.trim() || undefined,
          forceRegenerate: Boolean(prefill.existingEwayBillNo),
          consigneeGstin: consigneeGstin.trim() || undefined,
          consigneeLegalName: consigneeName.trim() || undefined,
          consigneeAddress: consigneeAddress.trim() || undefined,
          consigneePlace: consigneePlace.trim() || undefined,
          consigneePincode: consigneePincode.trim() || undefined,
        },
      });
      const edoc = out.edoc ?? {};
      if (!edoc.ok && !edoc.skipped) {
        setSubmitErr(formatEwayEdocMessage(edoc) ?? edoc.error ?? "Could not generate e-way bill.");
        return;
      }
      onSuccess(edoc);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        const body = e.body as { edoc?: EdocUiResult; error?: string } | null;
        const edoc = body?.edoc;
        setSubmitErr(
          formatEwayEdocMessage(edoc) ??
            edoc?.error ??
            body?.error ??
            e.message ??
            "Could not generate e-way bill.",
        );
      } else {
        setSubmitErr(e instanceof Error ? e.message : "Could not generate e-way bill.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-rlx-gold bg-white p-5 shadow-xl"
        role="dialog"
        aria-labelledby="eway-modal-title"
      >
        <h2 id="eway-modal-title" className="text-lg font-bold text-rlx-green-deep">
          Create e-way bill
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Enter transport details for Masters India e-way generation.
        </p>

        {loadErr ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{loadErr}</p>
        ) : null}

        {prefill ? (
          <div className="mt-4 space-y-4 text-sm">
            <div className="rounded-xl border border-rlx-rule bg-rlx-green-light/40 px-3 py-2.5 text-xs text-stone-700">
              <p>
                <span className="font-semibold text-stone-900">Document:</span>{" "}
                <span className="font-mono">{prefill.documentNumber}</span>
              </p>
              <p className="mt-1">
                <span className="font-semibold text-stone-900">Flow:</span> {prefill.flowLabel}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-stone-900">From:</span> {prefill.fromLabel}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-stone-900">To:</span> {prefill.toLabel}
              </p>
              {!prefill.requiresConsigneeInput ? (
                <p className="mt-1 text-stone-500">
                  Consignor GSTIN {prefill.consignorGstin || "—"} → Consignee GSTIN {prefill.consigneeGstin || "—"}
                  {prefill.interstate ? " (inter-state)" : " (intra-state)"}
                </p>
              ) : null}
              {sandboxNote ? <p className="mt-2 text-amber-800">{sandboxNote}</p> : null}
              {prefill.existingEwayBillNo ? (
                <p className="mt-2 font-mono text-amber-800">Existing: {prefill.existingEwayBillNo} — submit to regenerate.</p>
              ) : null}
            </div>

            <label className="block">
              Goods / invoice value (INR, taxable)
              <input
                type="number"
                min={1}
                step="0.01"
                className={inputClass}
                value={valueInr}
                onChange={(e) => setValueInr(e.target.value)}
              />
            </label>

            <label className="block">
              Vehicle number
              <input
                className={inputClass}
                placeholder="e.g. KA01AB1234 or courier ref from SRF"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                Distance (km)
                <input className={inputClass} value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
              </label>
              <label className="block">
                Transport mode
                <select
                  className={inputClass}
                  value={transportMode}
                  onChange={(e) => setTransportMode(e.target.value as (typeof TRANSPORT_MODES)[number])}
                >
                  {TRANSPORT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              Transporter name (optional)
              <input className={inputClass} value={transporterName} onChange={(e) => setTransporterName(e.target.value)} />
            </label>

            {prefill.requiresConsigneeInput ? (
              <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">Brand destination (consignee)</p>
                <label className="block">
                  Consignee GSTIN
                  <input className={inputClass} value={consigneeGstin} onChange={(e) => setConsigneeGstin(e.target.value.toUpperCase())} />
                </label>
                <label className="block">
                  Legal name
                  <input className={inputClass} value={consigneeName} onChange={(e) => setConsigneeName(e.target.value)} />
                </label>
                <label className="block">
                  Address
                  <input className={inputClass} value={consigneeAddress} onChange={(e) => setConsigneeAddress(e.target.value)} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    Place / city
                    <input className={inputClass} value={consigneePlace} onChange={(e) => setConsigneePlace(e.target.value)} />
                  </label>
                  <label className="block">
                    Pincode
                    <input className={inputClass} value={consigneePincode} onChange={(e) => setConsigneePincode(e.target.value)} />
                  </label>
                </div>
              </div>
            ) : null}

            {submitErr ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{submitErr}</p>
            ) : null}
          </div>
        ) : !loadErr ? (
          <p className="mt-4 text-sm text-stone-500">Loading…</p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-rlx-gold bg-white px-4 py-2 text-sm font-semibold text-rlx-green hover:bg-rlx-green-light disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !prefill}
            onClick={() => void handleSubmit()}
            className="rounded-xl bg-rlx-green px-4 py-2 text-sm font-semibold text-white hover:bg-rlx-green-deep disabled:opacity-50"
          >
            {busy ? "Generating…" : prefill?.existingEwayBillNo ? "Regenerate e-way bill" : "Create e-way bill"}
          </button>
        </div>
      </div>
    </div>
  );
}
