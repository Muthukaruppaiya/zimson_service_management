import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { applyAppFavicon } from "../../lib/appBranding";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

function applyIntraStateSplitFromGst(gst: number): Pick<ServiceTaxSettings, "cgstRatePercent" | "sgstRatePercent" | "igstRatePercent"> {
  const half = Math.round((gst / 2) * 1000) / 1000;
  return { cgstRatePercent: half, sgstRatePercent: half, igstRatePercent: gst };
}

export function ServiceTaxSettingsPage() {
  const apiMode = useApiMode();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [gstRatePercent, setGstRatePercent] = useState("18");
  const [cgstRatePercent, setCgstRatePercent] = useState("9");
  const [sgstRatePercent, setSgstRatePercent] = useState("9");
  const [igstRatePercent, setIgstRatePercent] = useState("18");
  const [defaultSacHsn, setDefaultSacHsn] = useState("9987");
  const [pricesTaxInclusive, setPricesTaxInclusive] = useState(false);
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
      setDefaultSacHsn(s.defaultSacHsn);
      setPricesTaxInclusive(s.pricesTaxInclusive);
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
        defaultSacHsn: defaultSacHsn.trim(),
        pricesTaxInclusive,
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
      setDefaultSacHsn(s.defaultSacHsn);
      setPricesTaxInclusive(s.pricesTaxInclusive);
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
              to="/settings/document-templates"
              className="inline-flex items-center justify-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Document templates
            </Link>
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

      <Card title="GST & invoice defaults" subtitle="Applies to service billing totals and quick bill invoice print (SAC/HSN column).">
        {loading ? (
          <p className="text-sm text-stone-600">Loading…</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="tax-gst" className="text-xs font-medium text-stone-600">
                  Combined GST % (reference)
                </label>
                <input
                  id="tax-gst"
                  type="number"
                  min={0}
                  max={100}
                  step="0.001"
                  value={gstRatePercent}
                  onChange={(e) => setGstRatePercent(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="tax-cgst" className="text-xs font-medium text-stone-600">
                  CGST %
                </label>
                <input
                  id="tax-cgst"
                  type="number"
                  min={0}
                  max={100}
                  step="0.001"
                  value={cgstRatePercent}
                  onChange={(e) => setCgstRatePercent(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="tax-sgst" className="text-xs font-medium text-stone-600">
                  SGST / UTGST %
                </label>
                <input
                  id="tax-sgst"
                  type="number"
                  min={0}
                  max={100}
                  step="0.001"
                  value={sgstRatePercent}
                  onChange={(e) => setSgstRatePercent(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="tax-igst" className="text-xs font-medium text-stone-600">
                  IGST % (interstate)
                </label>
                <input
                  id="tax-igst"
                  type="number"
                  min={0}
                  max={100}
                  step="0.001"
                  value={igstRatePercent}
                  onChange={(e) => setIgstRatePercent(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <p className="text-xs text-stone-500">
              Billing uses the combined GST % for arithmetic; CGST/SGST here are stored for reference and future
              interstate / split displays.{" "}
              <button
                type="button"
                className="font-semibold text-zimson-800 underline"
                onClick={() => {
                  const g = Number.parseFloat(gstRatePercent);
                  if (!Number.isFinite(g)) return;
                  const split = applyIntraStateSplitFromGst(g);
                  setCgstRatePercent(String(split.cgstRatePercent));
                  setSgstRatePercent(String(split.sgstRatePercent));
                  setIgstRatePercent(String(split.igstRatePercent));
                }}
              >
                Set CGST/SGST to half of combined GST and IGST to full
              </button>
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tax-sac" className="text-xs font-medium text-stone-600">
                  Default SAC / HSN (service lines)
                </label>
                <input
                  id="tax-sac"
                  value={defaultSacHsn}
                  onChange={(e) => setDefaultSacHsn(e.target.value)}
                  className={inputClass}
                  placeholder="9987"
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
            <div className="rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-4">
              <p className="text-xs font-semibold text-stone-700">Document number prefix / suffix settings</p>
              <p className="mt-1 text-xs text-stone-500">
                Format remains sequence based; these values control start/end text of generated SRF, PR, PO, GRN, DC, and ODC numbers.
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
                <label className="text-xs font-medium text-stone-600">DC prefix<input className={inputClass} value={dcPrefix} onChange={(e) => setDcPrefix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">DC suffix<input className={inputClass} value={dcSuffix} onChange={(e) => setDcSuffix(e.target.value)} /></label>
                <label className="text-xs font-medium text-stone-600">ODC prefix<input className={inputClass} value={odcPrefix} onChange={(e) => setOdcPrefix(e.target.value)} /></label>
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
