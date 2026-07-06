import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson, ApiError } from "../../lib/api";
import { formatEwayEdocMessage, type EdocUiResult } from "../../lib/edocResultMessage";
import {
  ewayGeneratePath,
  ewayPrefillPath,
  type EwayBillKind,
  type EwayPrefill,
} from "../../lib/ewayBill";
import { buildEwayDistancePrefill } from "../../lib/ewayDistance";
import type { BrandEwayConsigneeOption } from "../../types/brandEwayConsignee";
import { EwayBillSuccessModal } from "./EwayBillSuccessModal";
import { inputClass } from "../../lib/uiForm";

type Props = {
  open: boolean;
  kind: EwayBillKind;
  resourceId: string;
  onClose: () => void;
  onSuccess: (edoc: EdocUiResult) => void;
  /** Print delivery challan / ODC after successful e-way generation. */
  onPrintDocument?: () => void;
  documentLabel?: string;
};

const DOCUMENT_LABEL_BY_KIND: Record<EwayBillKind, string> = {
  challan: "Delivery challan / ODC",
  brand: "Brand dispatch ODC",
  online_order: "Delivery challan",
};

const TRANSPORT_MODES = ["Road", "Rail", "Air", "Ship"] as const;

function consigneeLabel(c: BrandEwayConsigneeOption): string {
  return `${c.brandName} — ${c.locationName}`;
}

export function EwayBillModal({
  open,
  kind,
  resourceId,
  onClose,
  onSuccess,
  onPrintDocument,
  documentLabel,
}: Props) {
  const [prefill, setPrefill] = useState<EwayPrefill | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [successEdoc, setSuccessEdoc] = useState<EdocUiResult | null>(null);

  const [valueInr, setValueInr] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [transportMode, setTransportMode] = useState<(typeof TRANSPORT_MODES)[number]>("Road");
  const [transporterName, setTransporterName] = useState("");
  const [selectedConsigneeId, setSelectedConsigneeId] = useState("");
  const [sandboxNote, setSandboxNote] = useState<string | null>(null);

  const brandConsignees = prefill?.brandConsignees ?? [];
  const selectedConsignee = useMemo(
    () => brandConsignees.find((c) => c.id === selectedConsigneeId) ?? null,
    [brandConsignees, selectedConsigneeId],
  );

  const distanceDisplay = useMemo(() => {
    if (!prefill) return { km: 0, hint: "" };
    if (prefill.requiresConsigneeInput && selectedConsignee && prefill.consignorPincode) {
      const toPin = Number(selectedConsignee.pincode);
      const fromPin = Number(prefill.consignorPincode);
      if (fromPin && toPin) {
        const d = buildEwayDistancePrefill(fromPin, toPin);
        return { km: d.displayDistanceKm, hint: d.distanceHint };
      }
    }
    return {
      km: prefill.displayDistanceKm ?? 0,
      hint: prefill.distanceHint ?? "",
    };
  }, [prefill, selectedConsignee]);

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
    setSuccessEdoc(null);
    setSelectedConsigneeId("");
    void apiJson<{ prefill: EwayPrefill }>(ewayPrefillPath(kind, resourceId))
      .then((out) => {
        if (cancelled) return;
        const p = out.prefill;
        setPrefill(p);
        setValueInr(String(p.defaultValueInr));
        setVehicleNumber(p.vehicleNumber);
        setTransportMode("Road");
        setTransporterName("");
        if (p.requiresConsigneeInput && p.brandConsignees?.length) {
          const pick =
            p.brandConsignees.find((c) => c.id === p.defaultConsigneeId) ?? p.brandConsignees[0] ?? null;
          setSelectedConsigneeId(pick?.id ?? "");
        }
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

  const resolvedDocumentLabel = documentLabel ?? DOCUMENT_LABEL_BY_KIND[kind];

  function handleSuccessClose() {
    setSuccessEdoc(null);
    onClose();
  }

  if (successEdoc?.ewayBillNo) {
    return (
      <EwayBillSuccessModal
        open
        edoc={successEdoc}
        documentNumber={prefill?.documentNumber}
        documentLabel={resolvedDocumentLabel}
        onPrintDocument={onPrintDocument}
        onClose={handleSuccessClose}
      />
    );
  }

  async function handleSubmit() {
    if (!prefill) return;
    const taxableAmountInr = Number(valueInr);
    if (!Number.isFinite(taxableAmountInr) || taxableAmountInr <= 0) {
      setSubmitErr("Enter a valid goods / invoice value (INR).");
      return;
    }
    if (prefill.requiresConsigneeInput) {
      if (!brandConsignees.length) {
        setSubmitErr("No brand locations configured. Add consignees in Settings → Brand e-way consignees.");
        return;
      }
      if (!selectedConsignee) {
        setSubmitErr("Select brand and location for the consignee.");
        return;
      }
    }
    setBusy(true);
    setSubmitErr(null);
    try {
      const out = await apiJson<{ edoc: EdocUiResult }>(ewayGeneratePath(kind, resourceId), {
        method: "POST",
        json: {
          taxableAmountInr,
          vehicleNumber: vehicleNumber.trim() || undefined,
          transportationDistanceKm: prefill.distanceForApi ?? "0",
          transportationMode: transportMode,
          transporterName: transporterName.trim() || undefined,
          forceRegenerate: Boolean(prefill.existingEwayBillNo),
          consigneeGstin: (selectedConsignee?.gstin ?? prefill.consigneeGstin.trim()) || undefined,
          consigneeLegalName: selectedConsignee?.legalName ?? undefined,
          consigneeAddress: selectedConsignee?.address ?? undefined,
          consigneePlace: selectedConsignee?.city ?? undefined,
          consigneePincode: selectedConsignee?.pincode ?? undefined,
        },
      });
      const edoc = out.edoc ?? {};
      if (!edoc.ok && !edoc.skipped) {
        setSubmitErr(formatEwayEdocMessage(edoc) ?? edoc.error ?? "Could not generate e-way bill.");
        return;
      }
      if (edoc.ewayBillNo) {
        setSuccessEdoc(edoc);
        onSuccess(edoc);
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
                <span className="font-semibold text-stone-900">To:</span>{" "}
                {selectedConsignee ? consigneeLabel(selectedConsignee) : prefill.toLabel}
              </p>
              {!prefill.requiresConsigneeInput && prefill.consignorPincode && prefill.consigneePincode ? (
                <p className="mt-1 text-stone-500">
                  E-way PIN: {prefill.consignorPincode} → {prefill.consigneePincode}
                </p>
              ) : null}
              {!prefill.requiresConsigneeInput ? (
                <p className="mt-1 text-stone-500">
                  Consignor GSTIN {prefill.consignorGstin || "—"} → Consignee GSTIN {prefill.consigneeGstin || "—"}
                  {prefill.interstate ? " (inter-state)" : " (intra-state)"}
                </p>
              ) : null}
              <p className="mt-2 text-stone-500">
                Under GST, e-way bills apply to both intra-state and inter-state movement of goods when the consignment
                value meets the threshold — not only for state-to-state transfers.
              </p>
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
              {prefill.distanceAutoCalculated !== false ? (
                <label className="block">
                  Distance (km, approx.)
                  <input
                    className={`${inputClass} cursor-default bg-stone-100 text-stone-700`}
                    value={String(distanceDisplay.km)}
                    readOnly
                    tabIndex={-1}
                    aria-readonly="true"
                  />
                  {distanceDisplay.hint ? (
                    <span className="mt-1 block text-xs text-stone-500">{distanceDisplay.hint}</span>
                  ) : null}
                </label>
              ) : null}
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
                {prefill.watchBrand ? (
                  <p className="text-xs text-violet-900">
                    Watch brand: <span className="font-semibold">{prefill.watchBrand}</span>
                  </p>
                ) : null}
                {brandConsignees.length === 0 ? (
                  <p className="text-xs text-amber-900">
                    No brand locations configured.{" "}
                    <Link to="/settings/brand-eway-consignees" className="font-semibold underline" onClick={onClose}>
                      Add brand e-way consignees
                    </Link>{" "}
                    in Settings first.
                  </p>
                ) : (
                  <>
                    <label className="block text-xs font-semibold text-violet-900">
                      Brand & location
                      <select
                        className={inputClass}
                        value={selectedConsigneeId}
                        onChange={(e) => setSelectedConsigneeId(e.target.value)}
                      >
                        <option value="">Select brand and location…</option>
                        {brandConsignees.map((c) => (
                          <option key={c.id} value={c.id}>
                            {consigneeLabel(c)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedConsignee ? (
                      <dl className="grid gap-2 rounded-lg border border-violet-100 bg-white/80 p-3 text-xs text-stone-700">
                        <div>
                          <dt className="font-semibold text-stone-500">Legal name</dt>
                          <dd className="mt-0.5 text-stone-900">{selectedConsignee.legalName}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-stone-500">GSTIN</dt>
                          <dd className="mt-0.5 font-mono text-stone-900">{selectedConsignee.gstin}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-stone-500">Address</dt>
                          <dd className="mt-0.5 text-stone-900">{selectedConsignee.address}</dd>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <dt className="font-semibold text-stone-500">City / place</dt>
                            <dd className="mt-0.5 text-stone-900">{selectedConsignee.city}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-stone-500">Pincode</dt>
                            <dd className="mt-0.5 text-stone-900">{selectedConsignee.pincode}</dd>
                          </div>
                        </div>
                      </dl>
                    ) : null}
                  </>
                )}
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
