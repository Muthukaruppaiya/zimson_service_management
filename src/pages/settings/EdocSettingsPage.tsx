import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson } from "../../lib/api";
import type { EdocGlobalSettings, RegionEdocSettings } from "../../types/edocSettings";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

const labelClass = "block text-xs font-semibold uppercase tracking-wide text-stone-600";

const regionTabBtn = (active: boolean) =>
  `rounded-lg border px-3 py-1.5 text-xs font-semibold ${
    active
      ? "border-rlx-green bg-rlx-green text-white"
      : "border-rlx-gold bg-rlx-green-light text-rlx-green hover:bg-rlx-green-light/80"
  }`;

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-800">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-zimson-400 text-zimson-700 focus:ring-zimson-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

type RegionForm = {
  enabled: boolean;
  username: string;
  password: string;
  hasPassword: boolean;
  ewayUsername: string;
  ewayPassword: string;
  hasEwayPassword: boolean;
  apiBase: string;
  ewayApiBase: string;
  tokenUrl: string;
  einvoicePath: string;
  ewayPath: string;
  sellerGstinOverride: string;
  ewayUserGstin: string;
};

function regionToForm(r: RegionEdocSettings): RegionForm {
  return {
    enabled: r.enabled,
    username: r.username,
    password: "",
    hasPassword: r.hasPassword,
    ewayUsername: r.ewayUsername || r.username,
    ewayPassword: "",
    hasEwayPassword: r.hasEwayPassword,
    apiBase: r.apiBase,
    ewayApiBase: r.ewayApiBase,
    tokenUrl: r.tokenUrl,
    einvoicePath: r.einvoicePath,
    ewayPath: r.ewayPath,
    sellerGstinOverride: r.sellerGstinOverride,
    ewayUserGstin: r.ewayUserGstin,
  };
}

export function EdocSettingsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const [loading, setLoading] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingRegion, setSavingRegion] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingEway, setTestingEway] = useState(false);
  const [testingEinvoice, setTestingEinvoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const [globalMeta, setGlobalMeta] = useState<EdocGlobalSettings | null>(null);
  const [regions, setRegions] = useState<RegionEdocSettings[]>([]);
  const [activeRegionId, setActiveRegionId] = useState("");
  const [regionForm, setRegionForm] = useState<RegionForm | null>(null);

  const [failOpen, setFailOpen] = useState(true);
  const [ewayAutoEnabled, setEwayAutoEnabled] = useState(false);
  const [ewayNominalValueInr, setEwayNominalValueInr] = useState("1000");

  const activeRegion = useMemo(
    () => regions.find((r) => r.regionId === activeRegionId) ?? null,
    [regions, activeRegionId],
  );

  const load = useCallback(async () => {
    const data = await apiJson<{ global: EdocGlobalSettings; regions: RegionEdocSettings[] }>("/api/settings/edoc");
    setGlobalMeta(data.global);
    setFailOpen(data.global.failOpen);
    setEwayAutoEnabled(data.global.ewayAutoEnabled);
    setEwayNominalValueInr(String(data.global.ewayNominalValueInr));
    setRegions(data.regions);
    const first = data.regions[0];
    if (first) {
      setActiveRegionId((prev) => prev || first.regionId);
    }
  }, []);

  useEffect(() => {
    if (!activeRegionId || !regions.length) {
      setRegionForm(null);
      return;
    }
    const row = regions.find((r) => r.regionId === activeRegionId);
    if (row) setRegionForm(regionToForm(row));
  }, [activeRegionId, regions]);

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load e-doc settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, load]);

  async function saveGlobal() {
    setSavingGlobal(true);
    setError(null);
    setSavedMsg(null);
    try {
      const data = await apiJson<{ global: EdocGlobalSettings }>("/api/settings/edoc/global", {
        method: "PUT",
        json: {
          failOpen,
          ewayAutoEnabled,
          ewayNominalValueInr: Number(ewayNominalValueInr) || 1000,
        },
      });
      setGlobalMeta(data.global);
      setSavedMsg("Global e-doc options saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save global settings.");
    } finally {
      setSavingGlobal(false);
    }
  }

  async function saveRegion() {
    if (!activeRegionId || !regionForm) return;
    setSavingRegion(true);
    setError(null);
    setSavedMsg(null);
    try {
      await apiJson(`/api/settings/edoc/regions/${encodeURIComponent(activeRegionId)}`, {
        method: "PUT",
        json: {
          enabled: regionForm.enabled,
          username: regionForm.username,
          password: regionForm.password.trim() || undefined,
          ewayUsername: regionForm.ewayUsername.trim() || undefined,
          ewayPassword: regionForm.ewayPassword.trim() || undefined,
          apiBase: regionForm.apiBase,
          ewayApiBase: regionForm.ewayApiBase,
          tokenUrl: regionForm.tokenUrl,
          einvoicePath: regionForm.einvoicePath,
          ewayPath: regionForm.ewayPath,
          sellerGstinOverride: regionForm.sellerGstinOverride,
          ewayUserGstin: regionForm.ewayUserGstin,
        },
      });
      await load();
      setRegionForm((f) => (f ? { ...f, password: "", ewayPassword: "" } : f));
      setSavedMsg(`Masters India account saved for ${activeRegion?.regionName ?? "region"}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save region settings.");
    } finally {
      setSavingRegion(false);
    }
  }

  async function runTest(kind: "token" | "einvoice" | "eway") {
    if (!activeRegionId) return;
    const path =
      kind === "token" ? "/api/edoc/test-token" : kind === "einvoice" ? "/api/edoc/test-einvoice" : "/api/edoc/test-eway";
    const setBusy = kind === "token" ? setTesting : kind === "einvoice" ? setTestingEinvoice : setTestingEway;
    setBusy(true);
    setTestMsg(null);
    setError(null);
    try {
      await apiJson(path, { method: "POST", json: { regionId: activeRegionId } });
      if (kind === "token") setTestMsg("Masters India token OK for selected region.");
      else if (kind === "einvoice") setTestMsg("E-invoice IRP reachable for selected region.");
      else setTestMsg("E-way test OK for selected region.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Test failed.");
    } finally {
      setBusy(false);
    }
  }

  function applySandboxApi() {
    if (!regionForm) return;
    setRegionForm({
      ...regionForm,
      apiBase: "https://sandb-api.mastersindia.co",
      ewayApiBase: "https://sandb-api.mastersindia.co",
      tokenUrl: "https://sandb-api.mastersindia.co/api/v1/token-auth/",
    });
  }

  function applyProductionApi() {
    if (!regionForm) return;
    setRegionForm({
      ...regionForm,
      apiBase: "https://router.mastersindia.co",
      ewayApiBase: "https://router.mastersindia.co",
      tokenUrl: "https://router.mastersindia.co/api/v1/token-auth/",
    });
  }

  if (!isSuperAdmin) {
    return (
      <div>
        <PageHeader title="E-invoice & e-way" description="Super admin only." />
        <p className="text-sm text-stone-600">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="E-invoice & e-way (Masters India)"
        description="Each HO region has its own GSTIN and Masters India portal account. Configure credentials separately per region."
      />
      <p className="mb-4 text-sm text-stone-600">
        <Link to="/settings/tax" className="font-semibold text-zimson-700 underline">
          Tax & billing
        </Link>{" "}
        controls GST rates.{" "}
        <Link to="/settings/brand-eway-consignees" className="font-semibold text-zimson-700 underline">
          Brand e-way consignees
        </Link>{" "}
        stores brand service centre addresses for send-to-brand e-way.
      </p>

      {loading ? <p className="text-sm text-stone-500">Loading…</p> : null}
      {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error}</p> : null}
      {savedMsg ? <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">{savedMsg}</p> : null}
      {testMsg ? <p className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-200">{testMsg}</p> : null}

      {!loading ? (
        <>
          <Card title="Global options" className="mb-4 p-5">
            <p className="mb-3 text-xs text-stone-600">
              Shared behaviour for all regions. Credentials are configured per region below.
              {globalMeta?.updatedBy ? ` Last saved by ${globalMeta.updatedBy}.` : ""}
            </p>
            <div className="space-y-4">
              <Toggle checked={failOpen} onChange={setFailOpen} label="Fail open — save bill even if IRP rejects (error stored on bill)" />
              <Toggle
                checked={ewayAutoEnabled}
                onChange={setEwayAutoEnabled}
                label="Auto e-way on dispatch challans — intra-state & inter-state (when region account is configured)"
              />
              <label className={labelClass}>
                E-way nominal value (INR)
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  value={ewayNominalValueInr}
                  onChange={(e) => setEwayNominalValueInr(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={savingGlobal}
                onClick={() => void saveGlobal()}
                className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zimson-700 disabled:opacity-60"
              >
                {savingGlobal ? "Saving…" : "Save global options"}
              </button>
            </div>
          </Card>

          <Card title="Per-region Masters India accounts" className="p-5">
            <p className="mb-3 text-sm text-stone-600">
              Select a region and enter the Masters India portal login tied to that region&apos;s GSTIN. E-invoice and e-way for bills/challans in that region use this account.
            </p>

            <div className="mb-4 flex flex-wrap gap-2">
              {regions.map((r) => (
                <button
                  key={r.regionId}
                  type="button"
                  onClick={() => setActiveRegionId(r.regionId)}
                  className={regionTabBtn(activeRegionId === r.regionId)}
                >
                  {r.regionName}
                  {r.configured ? "" : " (not set)"}
                </button>
              ))}
            </div>

            {activeRegion && regionForm ? (
              <>
                <div className="mb-4 rounded-xl border border-zimson-200 bg-zimson-50/60 px-3 py-2.5 text-xs text-stone-700">
                  <p>
                    <span className="font-semibold">Region GSTIN:</span>{" "}
                    <span className="font-mono">{activeRegion.regionGstin || "—"}</span>
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold">Status:</span>{" "}
                    {activeRegion.configured ? "Configured" : "Not configured"}
                    {activeRegion.sandboxMode ? " · Sandbox" : activeRegion.configured ? " · Production" : ""}
                  </p>
                  {activeRegion.configured ? (
                    <p className="mt-1">
                      Effective e-invoice GSTIN: <span className="font-mono">{activeRegion.effectiveEinvoiceGstin || "—"}</span>
                      {" · "}
                      E-way user GSTIN: <span className="font-mono">{activeRegion.effectiveEwayGstin || "—"}</span>
                    </p>
                  ) : null}
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={testing || testingEway || testingEinvoice}
                    onClick={() => void runTest("token")}
                    className="rounded-xl border border-zimson-400 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50 disabled:opacity-60"
                  >
                    {testing ? "Testing…" : "Test token"}
                  </button>
                  <button
                    type="button"
                    disabled={testing || testingEway || testingEinvoice}
                    onClick={() => void runTest("einvoice")}
                    className="rounded-xl border border-emerald-400 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-60"
                  >
                    {testingEinvoice ? "Testing…" : "Test e-invoice"}
                  </button>
                  <button
                    type="button"
                    disabled={testing || testingEway || testingEinvoice}
                    onClick={() => void runTest("eway")}
                    className="rounded-xl border border-violet-400 bg-white px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-50 disabled:opacity-60"
                  >
                    {testingEway ? "Testing…" : "Test e-way"}
                  </button>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  <button type="button" className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-50" onClick={applySandboxApi}>
                    Use sandbox API
                  </button>
                  <button type="button" className="rounded-lg border border-emerald-500 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-50" onClick={applyProductionApi}>
                    Use production API
                  </button>
                </div>

                <div className="space-y-4">
                  <Toggle checked={regionForm.enabled} onChange={(v) => setRegionForm((f) => (f ? { ...f, enabled: v } : f))} label="E-doc enabled for this region" />

                  <div className="ui-form-grid">
                    <div>
                      <span className={labelClass}>E-invoice portal username</span>
                      <input className={inputClass} value={regionForm.username} onChange={(e) => setRegionForm((f) => (f ? { ...f, username: e.target.value } : f))} />
                    </div>
                    <div>
                      <span className={labelClass}>E-invoice portal password {regionForm.hasPassword ? "(saved — leave blank to keep)" : ""}</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        className={inputClass}
                        value={regionForm.password}
                        onChange={(e) => setRegionForm((f) => (f ? { ...f, password: e.target.value } : f))}
                      />
                    </div>
                    <div>
                      <span className={labelClass}>E-way portal username</span>
                      <input className={inputClass} value={regionForm.ewayUsername} onChange={(e) => setRegionForm((f) => (f ? { ...f, ewayUsername: e.target.value } : f))} placeholder={regionForm.username || "Same as e-invoice username"} />
                    </div>
                    <div>
                      <span className={labelClass}>E-way portal password {regionForm.hasEwayPassword ? "(saved — leave blank to keep)" : ""}</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        className={inputClass}
                        value={regionForm.ewayPassword}
                        onChange={(e) => setRegionForm((f) => (f ? { ...f, ewayPassword: e.target.value } : f))}
                      />
                    </div>
                    <div>
                      <span className={labelClass}>E-invoice API base URL</span>
                      <input className={inputClass} value={regionForm.apiBase} onChange={(e) => setRegionForm((f) => (f ? { ...f, apiBase: e.target.value } : f))} />
                    </div>
                    <div>
                      <span className={labelClass}>E-way API base URL</span>
                      <input className={inputClass} value={regionForm.ewayApiBase} onChange={(e) => setRegionForm((f) => (f ? { ...f, ewayApiBase: e.target.value } : f))} />
                    </div>
                    <div className="sm:col-span-2">
                      <span className={labelClass}>Token URL</span>
                      <input className={inputClass} value={regionForm.tokenUrl} onChange={(e) => setRegionForm((f) => (f ? { ...f, tokenUrl: e.target.value } : f))} />
                    </div>
                    <div>
                      <span className={labelClass}>E-invoice path</span>
                      <input className={inputClass} value={regionForm.einvoicePath} onChange={(e) => setRegionForm((f) => (f ? { ...f, einvoicePath: e.target.value } : f))} />
                    </div>
                    <div>
                      <span className={labelClass}>E-way path</span>
                      <input className={inputClass} value={regionForm.ewayPath} onChange={(e) => setRegionForm((f) => (f ? { ...f, ewayPath: e.target.value } : f))} />
                    </div>
                    <div>
                      <span className={labelClass}>Seller GSTIN override (production)</span>
                      <input
                        className={inputClass}
                        value={regionForm.sellerGstinOverride}
                        onChange={(e) => setRegionForm((f) => (f ? { ...f, sellerGstinOverride: e.target.value.toUpperCase() } : f))}
                        placeholder={activeRegion.regionGstin || "Uses region GSTIN if blank"}
                      />
                    </div>
                    <div>
                      <span className={labelClass}>E-way user GSTIN</span>
                      <input
                        className={inputClass}
                        value={regionForm.ewayUserGstin}
                        onChange={(e) => setRegionForm((f) => (f ? { ...f, ewayUserGstin: e.target.value.toUpperCase() } : f))}
                        placeholder={activeRegion.regionGstin || "05AAABC0181E1ZE"}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={savingRegion}
                    onClick={() => void saveRegion()}
                    className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zimson-700 disabled:opacity-60"
                  >
                    {savingRegion ? "Saving…" : `Save ${activeRegion.regionName} account`}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-stone-600">No regions found.</p>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
