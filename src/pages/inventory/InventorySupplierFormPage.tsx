import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { ApiError, apiJson } from "../../lib/api";
import { isValidGstFormat } from "../../data/serviceSeed";
import { companyNameFromGstLookup, lookupCompanyByGstin } from "../../lib/gstLookupClient";
import { sanitizeGstPanInput } from "../../lib/inputSanitize";
import {
  locationFromGstLookup,
  suggestedSupplierCodeFromGst,
  taxPersonTypeFromGstin,
} from "../../lib/supplierGstFill";
import { validateCustomerB2bGstin } from "../../lib/zimsonCompanyGst";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";
import type { Supplier, SupplierLocation } from "../../types/supplier";
import { CustomFieldsSection } from "../../components/customFields/CustomFieldsSection";
import { useCustomFields } from "../../hooks/useCustomFields";
import { parseCustomFieldValues, requiredCustomFieldError } from "../../lib/customFields";
import type { CustomFieldValues } from "../../types/customField";

// ── Styles ─────────────────────────────────────────────────────────────────

const inputCls =
  "mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/30 transition-colors";
const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-stone-500";

const emptyLocation: SupplierLocation = { doorNo: "", street: "", place: "", district: "", state: "Tamil Nadu", pinCode: "" };

const emptyForm = {
  supplierCode: "", name: "", contactName: "", email: "", phone: "",
  gst: "", taxPersonType: "",
  locations: [{ ...emptyLocation }] as SupplierLocation[],
};

// ── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-rlx-rule bg-rlx-green px-5 py-4">
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">{title}</h3>
    </div>
  );
}

// ── Success Modal ───────────────────────────────────────────────────────────

function SuccessModal({ message, onViewMaster, onCreateAnother }: {
  message: string;
  onViewMaster: () => void;
  onCreateAnother: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="w-full max-w-sm bg-white shadow-2xl overflow-hidden">
        <div className="bg-rlx-green px-6 py-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/30 bg-white/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" className="h-7 w-7">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-base font-semibold uppercase tracking-[0.15em] text-white">Supplier Saved</h2>
        </div>
        <div className="px-6 py-5 text-center">
          <p className="text-sm text-stone-600">{message}</p>
        </div>
        <div className="flex gap-2 border-t border-rlx-rule bg-rlx-bg px-6 py-4">
          <button type="button" onClick={onViewMaster}
            className="flex-1 border border-rlx-rule bg-white py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition">
            View Supplier Master
          </button>
          <button type="button" onClick={onCreateAnother}
            className="flex-1 bg-rlx-green py-2 text-sm font-semibold text-white hover:bg-rlx-green/90 transition">
            Add Another
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function InventorySupplierFormPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();
  const isEditing = Boolean(editId);

  const canEdit =
    user?.role === "super_admin" || user?.role === "admin" ||
    user?.role === "ho_manager" || user?.role === "ho_purchase";

  const [form, setForm] = useState(emptyForm);
  const [customFields, setCustomFields] = useState<CustomFieldValues>({});
  const { fields: extraFieldDefs } = useCustomFields("supplier");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [err, setErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [gstFetchBusy, setGstFetchBusy] = useState(false);
  const [gstFilled, setGstFilled] = useState(false);
  const [existingSuppliers, setExistingSuppliers] = useState<Supplier[]>([]);
  const [taxPersonTypeOptions, setTaxPersonTypeOptions] = useState([
    "INTRASTATE_TAXABLE_PERSON", "INTERSTATE_TAXABLE_PERSON",
  ]);

  const hoGstin = useMemo(() => {
    const region = regions.find((r) => r.id === user?.regionId) ?? regions[0];
    return region?.gst?.trim() || null;
  }, [regions, user?.regionId]);

  // Load tax options + existing suppliers (duplicate GST / code checks)
  useEffect(() => {
    apiJson<{ settings: ServiceTaxSettings }>("/api/settings/tax")
      .then((data) => {
        const opts = (data.settings.supplierTaxPersonTypes ?? []).map((x) => x.trim()).filter(Boolean);
        if (opts.length > 0) setTaxPersonTypeOptions(opts);
      })
      .catch(() => {});
    apiJson<{ suppliers: Supplier[] }>("/api/inventory/suppliers")
      .then((data) => setExistingSuppliers(data.suppliers ?? []))
      .catch(() => {});
  }, []);

  // Load existing supplier for edit
  useEffect(() => {
    if (!editId) return;
    void (async () => {
      setLoading(true);
      try {
        const data = await apiJson<{ suppliers: Supplier[] }>("/api/inventory/suppliers");
        const s = data.suppliers.find((x) => x.id === editId);
        if (!s) { setErr("Supplier not found."); return; }
        setForm({
          supplierCode: s.supplierCode,
          name: s.name,
          contactName: s.contactName ?? "",
          email: s.email ?? "",
          phone: s.phone ?? "",
          gst: s.gst ?? "",
          taxPersonType: s.taxPersonType ?? "",
          locations: s.locations && s.locations.length > 0 ? s.locations : [{ ...emptyLocation }],
        });
        setCustomFields(parseCustomFieldValues(s.customFields));
        setGstFilled(Boolean(s.gst));
      } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not load supplier."); }
      finally { setLoading(false); }
    })();
  }, [editId]);

  function resetForm() {
    setForm(emptyForm);
    setCustomFields({});
    setErr(null);
    setSuccessMsg(null);
    setGstFilled(false);
  }

  async function allocateSupplierCode(preferred: string): Promise<string> {
    const qs = preferred ? `?preferred=${encodeURIComponent(preferred)}` : "";
    try {
      const data = await apiJson<{ supplierCode: string }>(`/api/inventory/suppliers/next-code${qs}`);
      return data.supplierCode;
    } catch {
      return preferred;
    }
  }

  async function fetchGstDetails() {
    const gstin = form.gst.trim().toUpperCase();
    if (!isValidGstFormat(gstin)) {
      setErr("Enter a valid 15-character GSTIN before lookup.");
      return;
    }
    const zimsonErr = validateCustomerB2bGstin(gstin);
    if (zimsonErr) {
      setErr(zimsonErr.replace("customer's GSTIN", "supplier's GSTIN"));
      return;
    }
    const dup = existingSuppliers.find(
      (s) => (s.gst ?? "").trim().toUpperCase() === gstin && s.id !== editId,
    );
    if (dup) {
      setErr(`GSTIN already registered for supplier ${dup.supplierCode} (${dup.name}).`);
      return;
    }
    setGstFetchBusy(true);
    setErr(null);
    try {
      const out = await lookupCompanyByGstin(gstin);
      const name = companyNameFromGstLookup(out);
      const loc = locationFromGstLookup(out, gstin);
      const taxPersonType = taxPersonTypeFromGstin(gstin, hoGstin);
      const existingCodes = new Set(
        existingSuppliers
          .filter((s) => s.id !== editId)
          .map((s) => s.supplierCode.toUpperCase()),
      );
      let supplierCode = form.supplierCode.trim().toUpperCase();
      if (!isEditing || !supplierCode) {
        const preferred = suggestedSupplierCodeFromGst(gstin, existingCodes);
        supplierCode = preferred
          ? await allocateSupplierCode(preferred)
          : await allocateSupplierCode("");
      }
      setForm((f) => ({
        ...f,
        gst: gstin,
        name: name || f.name,
        supplierCode: supplierCode || f.supplierCode,
        taxPersonType: taxPersonTypeOptions.includes(taxPersonType) ? taxPersonType : f.taxPersonType,
        locations: [loc],
      }));
      setGstFilled(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not fetch GST details.");
    } finally {
      setGstFetchBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.name.trim()) { setErr("Supplier name is required."); return; }
    if (form.gst.trim() && !isValidGstFormat(form.gst)) {
      setErr("Enter a valid 15-character GSTIN or leave GSTIN blank.");
      return;
    }
    const customErr = requiredCustomFieldError(extraFieldDefs, customFields);
    if (customErr) { setErr(customErr); return; }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      supplierCode: form.supplierCode.trim().toUpperCase() || undefined,
      contactName: form.contactName.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      locations: form.locations,
      gst: form.gst.trim().toUpperCase() || null,
      taxPersonType: form.taxPersonType.trim() || null,
      customFields,
    };
    try {
      if (isEditing) {
        await apiJson(`/api/inventory/suppliers/${encodeURIComponent(editId!)}`, { method: "PATCH", json: payload });
        setSuccessMsg(`${form.name} has been updated successfully.`);
      } else {
        const data = await apiJson<{ supplier: Supplier }>("/api/inventory/suppliers", { method: "POST", json: payload });
        const created = data.supplier;
        if (created) {
          setExistingSuppliers((prev) => [...prev, created]);
          setSuccessMsg(`${created.name} has been created as ${created.supplierCode}.`);
        } else {
          setSuccessMsg(`${form.name} has been created successfully.`);
        }
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Save failed.");
    } finally { setBusy(false); }
  }

  if (!canEdit) {
    return (
      <div>
        <InventoryBreadcrumb current="Supplier Form" />
        <PageHeader title="Supplier Form" description="Access restricted." />
        <div className="border border-rlx-rule bg-white px-6 py-8 text-center text-sm text-stone-400">
          Supplier maintenance requires Admin or HO Manager access.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <InventoryBreadcrumb current={isEditing ? "Edit Supplier" : "Add Supplier"} />
        <PageHeader title={isEditing ? "Edit Supplier" : "Add Supplier"} description="" />
        <div className="py-12 text-center text-sm text-stone-400">Loading…</div>
      </div>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb current={isEditing ? "Edit Supplier" : "Add Supplier"} />
      <PageHeader
        title={isEditing ? "Edit Supplier" : "Add New Supplier"}
        description={isEditing ? "Update supplier details below." : "Verify GSTIN to auto-fill name, address, tax type, and supplier code."}
        actions={
          <div className="flex gap-2">
            <button type="button" onClick={() => navigate("/inventory/suppliers")}
              className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition">
              ← Supplier Master
            </button>
          </div>
        }
      />

      {err && <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* GST verification — first, like customer B2B */}
        <div className="border border-rlx-rule bg-white shadow-sm">
          <SectionHeader
            title="GST verification"
            subtitle="Enter GSTIN and fetch registry details to fill supplier name, address, tax type, and code."
          />
          <div className="p-5 space-y-2">
            <label className={labelCls}>GSTIN</label>
            <div className="flex flex-wrap items-end gap-2">
              <input
                className={`${inputCls} mt-0 min-w-[220px] flex-1 font-mono uppercase`}
                value={form.gst}
                onChange={(e) => {
                  const val = sanitizeGstPanInput(e.target.value, 15);
                  setGstFilled(false);
                  setForm((f) => ({ ...f, gst: val }));
                }}
                placeholder="15-character GSTIN"
                maxLength={15}
                disabled={gstFetchBusy || busy}
              />
              <button
                type="button"
                onClick={() => void fetchGstDetails()}
                disabled={gstFetchBusy || busy || !isValidGstFormat(form.gst)}
                className="border border-rlx-green bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green hover:bg-rlx-green/5 transition disabled:opacity-60"
              >
                {gstFetchBusy ? "Fetching…" : gstFilled ? "Fetched from GST" : "Get GST details"}
              </button>
            </div>
            <p className="text-[11px] text-stone-400">
              Same GST lookup as customer master. Name, locations, tax person type, and supplier code are filled from the registry.
            </p>
          </div>
        </div>

        {/* Basic Info */}
        <div className="border border-rlx-rule bg-white shadow-sm">
          <SectionHeader title="Basic Information" subtitle="Core supplier identification details." />
          <div className="p-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Supplier Code{isEditing ? " *" : ""}</label>
              <input
                className={`${inputCls} ${!isEditing ? "bg-stone-50" : ""}`}
                value={form.supplierCode}
                onChange={(e) => setForm((f) => ({ ...f, supplierCode: e.target.value.toUpperCase() }))}
                placeholder={isEditing ? "e.g. SUP001" : "Auto-generated after GST lookup"}
                readOnly={!isEditing}
              />
              {!isEditing ? (
                <p className="mt-1 text-[11px] text-stone-400">Generated from GSTIN (or a sequence if GSTIN is not used).</p>
              ) : null}
            </div>
            <div>
              <label className={labelCls}>Supplier Name *</label>
              <input className={inputCls} value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Filled from GST lookup" />
            </div>
            <div>
              <label className={labelCls}>Contact Person</label>
              <input className={inputCls} value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                placeholder="Primary contact name" />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input className={inputCls} value={form.phone} type="tel"
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+91 XXXXX XXXXX" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Email</label>
              <input className={inputCls} value={form.email} type="email"
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="supplier@example.com" />
            </div>
          </div>
        </div>

        {/* Tax Info */}
        <div className="border border-rlx-rule bg-white shadow-sm">
          <SectionHeader title="Tax Information" subtitle="GST classification (auto-set from GSTIN state vs HO)." />
          <div className="p-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Tax Person Type</label>
              <select className={inputCls} value={form.taxPersonType}
                onChange={(e) => setForm((f) => ({ ...f, taxPersonType: e.target.value }))}>
                <option value="">Select type…</option>
                {taxPersonTypeOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Locations */}
        <div className="border border-rlx-rule bg-white shadow-sm">
          <SectionHeader title="Supplier Locations" subtitle="Add one or more delivery / office addresses." />
          <div className="p-5 space-y-4">
            {form.locations.map((loc, idx) => (
              <div key={idx} className="border border-rlx-rule p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Location {idx + 1}</span>
                  {form.locations.length > 1 && (
                    <button type="button"
                      onClick={() => setForm((f) => ({ ...f, locations: f.locations.filter((_, i) => i !== idx) }))}
                      className="text-[11px] font-semibold text-red-500 hover:text-red-700 transition">
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { key: "doorNo", label: "Door / Plot No." },
                    { key: "street", label: "Street" },
                    { key: "place", label: "Place / Area" },
                    { key: "district", label: "District" },
                    { key: "state", label: "State" },
                    { key: "pinCode", label: "PIN Code" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className={labelCls}>{label}</label>
                      <input className={inputCls}
                        value={(loc as Record<string, string>)[key] ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            locations: f.locations.map((x, i) =>
                              i === idx ? { ...x, [key]: e.target.value } : x,
                            ),
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button type="button"
              onClick={() => setForm((f) => ({ ...f, locations: [...f.locations, { ...emptyLocation }] }))}
              className="flex w-full items-center justify-center gap-2 border border-dashed border-rlx-rule py-3 text-xs font-semibold text-stone-400 hover:border-rlx-green hover:text-rlx-green transition">
              + Add Another Location
            </button>
          </div>
        </div>

        <CustomFieldsSection fields={extraFieldDefs} values={customFields} onChange={setCustomFields} />

        {/* Submit */}
        <div className="flex gap-3 border-t border-rlx-rule pt-2 pb-6">
          <button type="submit" disabled={busy}
            className="bg-rlx-green px-8 py-2.5 text-sm font-semibold text-white hover:bg-rlx-green/90 transition disabled:opacity-40">
            {busy ? "Saving…" : isEditing ? "Save Changes" : "Create Supplier"}
          </button>
          <button type="button" onClick={() => navigate("/inventory/suppliers")}
            className="border border-rlx-rule px-6 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50 transition">
            Cancel
          </button>
        </div>
      </form>

      {/* Success Modal */}
      {successMsg && (
        <SuccessModal
          message={successMsg}
          onViewMaster={() => navigate("/inventory/suppliers")}
          onCreateAnother={() => { resetForm(); navigate("/inventory/suppliers/new"); }}
        />
      )}
    </div>
  );
}
