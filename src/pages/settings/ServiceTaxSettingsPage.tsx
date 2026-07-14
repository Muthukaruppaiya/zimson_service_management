import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { applyAppFavicon } from "../../lib/appBranding";
import { DEFAULT_SERVICE_SAC, formatPrintedHsnSac } from "../../lib/hsnGst";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

function applyIntraStateSplitFromGst(gst: number): Pick<ServiceTaxSettings, "cgstRatePercent" | "sgstRatePercent" | "igstRatePercent"> {
  const half = Math.round((gst / 2) * 1000) / 1000;
  return { cgstRatePercent: half, sgstRatePercent: half, igstRatePercent: gst };
}

export function ServiceTaxSettingsPage() {
  const { user } = useAuth();
  const apiMode = useApiMode();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [gstRatePercent, setGstRatePercent] = useState("18");
  const [cgstRatePercent, setCgstRatePercent] = useState("9");
  const [sgstRatePercent, setSgstRatePercent] = useState("9");
  const [igstRatePercent, setIgstRatePercent] = useState("18");
  const [defaultSacHsn, setDefaultSacHsn] = useState(DEFAULT_SERVICE_SAC);
  const [invoiceNumberTemplate, setInvoiceNumberTemplate] = useState("{CODE}{FY2}-{SEQ}");
  const [invoiceNumberSeqWidth, setInvoiceNumberSeqWidth] = useState("5");
  const [pricesTaxInclusive, setPricesTaxInclusive] = useState(false);
  const [supplierTaxPersonTypesText, setSupplierTaxPersonTypesText] = useState("INTRASTATE_TAXABLE_PERSON\nINTERSTATE_TAXABLE_PERSON");
  const [srfPrefix, setSrfPrefix] = useState("SRF");
  const [srfSuffix, setSrfSuffix] = useState("");
  const [prPrefix, setPrPrefix] = useState("PR");
  const [prSuffix, setPrSuffix] = useState("");
  const [poPrefix, setPoPrefix] = useState("PO");
  const [poSuffix, setPoSuffix] = useState("");
  const [grnPrefix, setGrnPrefix] = useState("GRN");
  const [grnSuffix, setGrnSuffix] = useState("");
  const [dcPrefix, setDcPrefix] = useState("DC");
  const [dcSuffix, setDcSuffix] = useState("");
  const [odcPrefix, setOdcPrefix] = useState("ODC");
  const [odcSuffix, setOdcSuffix] = useState("");
  const [tdPrefix, setTdPrefix] = useState("TD");
  const [tdSuffix, setTdSuffix] = useState("");
  const [appLogoUrl, setAppLogoUrl] = useState("");
  const [appFaviconUrl, setAppFaviconUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [meta, setMeta] = useState<{ updatedAt: string; updatedBy: string | null } | null>(null);

  const load = useCallback(async () => {
    if (!apiMode) {
      setLoading(false);
      setError("API mode is off — enable VITE_USE_API to load and save organisation tax settings.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ settings: ServiceTaxSettings }>("/api/settings/tax");
      const s = data.settings;
      setGstRatePercent(String(s.gstRatePercent));
      setCgstRatePercent(String(s.cgstRatePercent));
      setSgstRatePercent(String(s.sgstRatePercent));
      setIgstRatePercent(String(s.igstRatePercent));
      setDefaultSacHsn(formatPrintedHsnSac(s.defaultSacHsn));
      setInvoiceNumberTemplate(s.invoiceNumberTemplate ?? "{CODE}{FY2}-{SEQ}");
      setInvoiceNumberSeqWidth(String(s.invoiceNumberSeqWidth ?? 5));
      setPricesTaxInclusive(s.pricesTaxInclusive);
      setSupplierTaxPersonTypesText((s.supplierTaxPersonTypes ?? []).join("\n"));
      setSrfPrefix(s.srfPrefix ?? "SRF");
      setSrfSuffix(s.srfSuffix ?? "");
      setPrPrefix(s.prPrefix ?? "PR");
      setPrSuffix(s.prSuffix ?? "");
      setPoPrefix(s.poPrefix ?? "PO");
      setPoSuffix(s.poSuffix ?? "");
      setGrnPrefix(s.grnPrefix ?? "GRN");
      setGrnSuffix(s.grnSuffix ?? "");
      setDcPrefix(s.dcPrefix ?? "DC");
      setDcSuffix(s.dcSuffix ?? "");
      setOdcPrefix(s.odcPrefix ?? "ODC");
      setOdcSuffix(s.odcSuffix ?? "");
      setTdPrefix(s.tdPrefix ?? "TD");
      setTdSuffix(s.tdSuffix ?? "");
      setAppLogoUrl(s.appLogoUrl ?? "");
      setAppFaviconUrl(s.appFaviconUrl ?? "");
      setNotes(s.notes);
      setMeta({ updatedAt: s.updatedAt, updatedBy: s.updatedBy });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load tax settings.");
    } finally {
      setLoading(false);
    }
  }, [apiMode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSavedMsg(null);
    if (!apiMode) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        gstRatePercent: Number.parseFloat(gstRatePercent),
        cgstRatePercent: Number.parseFloat(cgstRatePercent),
        sgstRatePercent: Number.parseFloat(sgstRatePercent),
        igstRatePercent: Number.parseFloat(igstRatePercent),
        defaultSacHsn: formatPrintedHsnSac(defaultSacHsn.trim()),
        invoiceNumberTemplate: invoiceNumberTemplate.trim(),
        invoiceNumberSeqWidth: Math.min(8, Math.max(4, Math.round(Number.parseInt(invoiceNumberSeqWidth, 10) || 5))),
        pricesTaxInclusive,
        supplierTaxPersonTypes: supplierTaxPersonTypesText
          .split("\n")
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean),
        srfPrefix: srfPrefix.trim(),
        srfSuffix: srfSuffix.trim(),
        prPrefix: prPrefix.trim(),
        prSuffix: prSuffix.trim(),
        poPrefix: poPrefix.trim(),
        poSuffix: poSuffix.trim(),
        grnPrefix: grnPrefix.trim(),
        grnSuffix: grnSuffix.trim(),
        dcPrefix: dcPrefix.trim(),
        dcSuffix: dcSuffix.trim(),
        odcPrefix: odcPrefix.trim(),
        odcSuffix: odcSuffix.trim(),
        tdPrefix: tdPrefix.trim(),
        tdSuffix: tdSuffix.trim(),
        appLogoUrl: appLogoUrl.trim(),
        appFaviconUrl: appFaviconUrl.trim(),
        notes: notes.trim(),
      };
      const data = await apiJson<{ settings: ServiceTaxSettings }>("/api/settings/tax", {
        method: "PUT",
        json: payload,
      });
      const s = data.settings;
      setGstRatePercent(String(s.gstRatePercent));
      setCgstRatePercent(String(s.cgstRatePercent));
      setSgstRatePercent(String(s.sgstRatePercent));
      setIgstRatePercent(String(s.igstRatePercent));
      setDefaultSacHsn(formatPrintedHsnSac(s.defaultSacHsn));
      setInvoiceNumberTemplate(s.invoiceNumberTemplate ?? "{CODE}{FY2}-{SEQ}");
      setInvoiceNumberSeqWidth(String(s.invoiceNumberSeqWidth ?? 5));
      setPricesTaxInclusive(s.pricesTaxInclusive);
      setSupplierTaxPersonTypesText((s.supplierTaxPersonTypes ?? []).join("\n"));
      setSrfPrefix(s.srfPrefix ?? "SRF");
      setSrfSuffix(s.srfSuffix ?? "");
      setPrPrefix(s.prPrefix ?? "PR");
      setPrSuffix(s.prSuffix ?? "");
      setPoPrefix(s.poPrefix ?? "PO");
      setPoSuffix(s.poSuffix ?? "");
      setGrnPrefix(s.grnPrefix ?? "GRN");
      setGrnSuffix(s.grnSuffix ?? "");
      setDcPrefix(s.dcPrefix ?? "DC");
      setDcSuffix(s.dcSuffix ?? "");
      setOdcPrefix(s.odcPrefix ?? "ODC");
      setOdcSuffix(s.odcSuffix ?? "");
      setTdPrefix(s.tdPrefix ?? "TD");
      setTdSuffix(s.tdSuffix ?? "");
      setAppLogoUrl(s.appLogoUrl ?? "");
      setAppFaviconUrl(s.appFaviconUrl ?? "");
      setNotes(s.notes);
      applyAppFavicon(s.appFaviconUrl ?? "");
      window.dispatchEvent(new Event("zimson-branding-updated"));
      setMeta({ updatedAt: s.updatedAt, updatedBy: s.updatedBy });
      setSavedMsg("Saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tax & billing settings"
        description=""
        actions={
          <div className="flex gap-2">
            <Link
              to="/regions"
              className="inline-flex items-center justify-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Regions &amp; stores
            </Link>
            <Link
              to="/settings/document-templates"
              className="inline-flex items-center justify-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Document templates
            </Link>
            {user?.role === "super_admin" ? (
              <Link
                to="/settings/messaging"
                className="inline-flex items-center justify-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
              >
                SMS, email &amp; WhatsApp
              </Link>
            ) : null}
            <Link
              to="/service/billing"
              className="inline-flex items-center justify-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Open billing
            </Link>
          </div>
        }
      />

      {error ? (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error}</p>
      ) : null}
      {savedMsg ? (
        <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
          {savedMsg}
        </p>
      ) : null}

      <Card
        title="GST & invoice defaults"
        subtitle="GST, SAC/HSN, document prefixes, and app logo. Store name, address, GSTIN, and printed terms are configured per store under Regions & stores (invoice block when creating or editing a store)."
      >
        {loading ? (
          <p className="text-sm text-stone-600">Loading…</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            <div className="rounded-xl border border-zimson-200 bg-zimson-50/60 px-4 py-3 text-sm text-stone-700">
              <p className="font-semibold text-zimson-900">GST from Inventory &amp; Tax settings</p>
              <p className="mt-1 text-xs text-stone-600">
                Spare lines use HSN + GST % from Inventory → Spare catalogue. Labour / service charge uses the GST %
                and SAC below. No seeded HSN master — you maintain rates in inventory.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tax-gst" className="text-xs font-medium text-stone-600">
                  GST % (labour / default SAC)
                </label>
                <input
                  id="tax-gst"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={gstRatePercent}
                  onChange={(e) => {
                    const v = e.target.value;
                    setGstRatePercent(v);
                    const n = Number.parseFloat(v);
                    if (Number.isFinite(n)) {
                      const split = applyIntraStateSplitFromGst(n);
                      setCgstRatePercent(String(split.cgstRatePercent));
                      setSgstRatePercent(String(split.sgstRatePercent));
                      setIgstRatePercent(String(split.igstRatePercent));
                    }
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="tax-sac" className="text-xs font-medium text-stone-600">
                  Default SAC / HSN (service lines)
                </label>
                <input
                  id="tax-sac"
                  value={defaultSacHsn}
                  onChange={(e) => setDefaultSacHsn(e.target.value)}
                  className={inputClass}
                  placeholder={DEFAULT_SERVICE_SAC}
                />
              </div>
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-800">
                  <input
                    type="checkbox"
                    checked={pricesTaxInclusive}
                    onChange={(e) => setPricesTaxInclusive(e.target.checked)}
                    className="h-4 w-4 rounded border-zimson-300 text-zimson-700"
                  />
                  Line rates are tax-inclusive (billing backs out taxable value)
                </label>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="tax-inv-template" className="text-xs font-medium text-stone-600">
                  Store invoice number template (India FY Apr–Mar)
                </label>
                <input
                  id="tax-inv-template"
                  value={invoiceNumberTemplate}
                  onChange={(e) => setInvoiceNumberTemplate(e.target.value)}
                  className={inputClass}
                  placeholder="{CODE}{FY2}-{SEQ}"
                />
                <p className="mt-1 text-xs text-stone-500">
                  India FY Apr–Mar: <code className="rounded bg-stone-100 px-1">{"{FY2}"}</code> = from year (e.g.{" "}
                  <strong>26</strong> for 2026–27), <code className="rounded bg-stone-100 px-1">{"{FY2E}"}</code> = to year (
                  <strong>27</strong>), <code className="rounded bg-stone-100 px-1">{"{FYLABEL}"}</code> ={" "}
                  <strong>26-27</strong>. Also <code className="rounded bg-stone-100 px-1">{"{FY4}"}</code>,{" "}
                  <code className="rounded bg-stone-100 px-1">{"{FYKEY}"}</code>,{" "}
                  <code className="rounded bg-stone-100 px-1">{"{SEQ}"}</code>. Example{" "}
                  <code className="rounded bg-stone-100 px-1">{"{CODE}{FY2}-{SEQ}"}</code> → CHN0126-00001 (store code CHN01).
                </p>
              </div>
              <div>
                <label htmlFor="tax-inv-seq-width" className="text-xs font-medium text-stone-600">
                  Sequence width (digits)
                </label>
                <input
                  id="tax-inv-seq-width"
                  type="number"
                  min={4}
                  max={8}
                  step={1}
                  value={invoiceNumberSeqWidth}
                  onChange={(e) => setInvoiceNumberSeqWidth(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label htmlFor="tax-supplier-types" className="text-xs font-medium text-stone-600">
                Supplier tax person types (one per line)
              </label>
              <textarea
                id="tax-supplier-types"
                value={supplierTaxPersonTypesText}
                onChange={(e) => setSupplierTaxPersonTypesText(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder={"INTRASTATE_TAXABLE_PERSON\nINTERSTATE_TAXABLE_PERSON"}
              />
            </div>
            <div className="rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-4">
              <p className="text-xs font-semibold text-stone-700">Document number prefix / suffix settings</p>
              <p className="mt-1 text-xs text-stone-500">
                Format: PREFIX + YY + scope + sequence + suffix (e.g. TD26CBE0101001). TD = store ↔ HO transfer; DC = delivery challan (inter-HO).
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs font-medium text-stone-600">SRF prefix<input className={inputClass} value={srfPrefix} onChange={(e) => setSrfPrefix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">SRF suffix<input className={inputClass} value={srfSuffix} onChange={(e) => setSrfSuffix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">PR prefix<input className={inputClass} value={prPrefix} onChange={(e) => setPrPrefix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">PR suffix<input className={inputClass} value={prSuffix} onChange={(e) => setPrSuffix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">PO prefix<input className={inputClass} value={poPrefix} onChange={(e) => setPoPrefix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">PO suffix<input className={inputClass} value={poSuffix} onChange={(e) => setPoSuffix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">GRN prefix<input className={inputClass} value={grnPrefix} onChange={(e) => setGrnPrefix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">GRN suffix<input className={inputClass} value={grnSuffix} onChange={(e) => setGrnSuffix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">TD prefix (store ↔ HO transfer)<input className={inputClass} value={tdPrefix} onChange={(e) => setTdPrefix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">TD suffix<input className={inputClass} value={tdSuffix} onChange={(e) => setTdSuffix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">DC prefix (delivery challan)<input className={inputClass} value={dcPrefix} onChange={(e) => setDcPrefix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">DC suffix<input className={inputClass} value={dcSuffix} onChange={(e) => setDcSuffix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">ODC prefix (legacy)<input className={inputClass} value={odcPrefix} onChange={(e) => setOdcPrefix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">ODC suffix<input className={inputClass} value={odcSuffix} onChange={(e) => setOdcSuffix(e.target.value)} /></label>
              </div>
            </div>

            <div className="rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-4">
              <p className="text-xs font-semibold text-stone-700">Global app branding (same for all regions)</p>
              <p className="mt-1 text-xs text-stone-500">
                Super admin sets these once; sidebar/topbar logo and favicon use these values for all users.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-stone-600">App logo URL / data URL
                  <input className={inputClass} value={appLogoUrl} onChange={(e) => setAppLogoUrl(e.target.value)} placeholder="/icons.svg or data:image/png;base64,..." />
                </label>
                <label className="text-xs font-medium text-stone-600">Favicon URL / data URL
                  <input className={inputClass} value={appFaviconUrl} onChange={(e) => setAppFaviconUrl(e.target.value)} placeholder="/icons.svg or data:image/png;base64,..." />
                </label>
              </div>
            </div>

            <div>
              <label htmlFor="tax-notes" className="text-xs font-medium text-stone-600">
                Internal notes
              </label>
              <textarea
                id="tax-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="Internal notes"
              />
            </div>

            {meta ? (
              <p className="text-xs text-stone-500">
                Last updated {new Date(meta.updatedAt).toLocaleString()}{" "}
                {meta.updatedBy ? `· ${meta.updatedBy}` : ""}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={!apiMode || saving}
                className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                disabled={!apiMode || loading}
                className="rounded-xl border border-zimson-400 bg-white px-5 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50 disabled:opacity-50"
              >
                Reload
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
