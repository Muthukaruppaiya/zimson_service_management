import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson } from "../../lib/api";
import type { EdocSettings } from "../../types/edocSettings";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

const labelClass = "block text-xs font-semibold uppercase tracking-wide text-stone-600";

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

export function EdocSettingsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingEway, setTestingEway] = useState(false);
  const [testingEinvoice, setTestingEinvoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [meta, setMeta] = useState<EdocSettings | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [failOpen, setFailOpen] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [apiBase, setApiBase] = useState("https://sandb-api.mastersindia.co");
  const [ewayApiBase, setEwayApiBase] = useState("https://sandb-api.mastersindia.co");
  const [tokenUrl, setTokenUrl] = useState("");
  const [einvoicePath, setEinvoicePath] = useState("/api/v1/einvoice/");
  const [ewayPath, setEwayPath] = useState("/api/v1/ewayBillsGenerate/");
  const [sellerGstinOverride, setSellerGstinOverride] = useState("");
  const [ewayUserGstin, setEwayUserGstin] = useState("");
  const [ewayNominalValueInr, setEwayNominalValueInr] = useState("1000");
  const [ewayAutoEnabled, setEwayAutoEnabled] = useState(false);

  const applySettings = useCallback((s: EdocSettings) => {
    setMeta(s);
    setEnabled(s.enabled);
    setFailOpen(s.failOpen);
    setUsername(s.username);
    setHasPassword(s.hasPassword);
    setApiBase(s.apiBase);
    setEwayApiBase(s.ewayApiBase);
    setTokenUrl(s.tokenUrl);
    setEinvoicePath(s.einvoicePath);
    setEwayPath(s.ewayPath);
    setSellerGstinOverride(s.sellerGstinOverride);
    setEwayUserGstin(s.ewayUserGstin);
    setEwayNominalValueInr(String(s.ewayNominalValueInr));
    setEwayAutoEnabled(s.ewayAutoEnabled);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<{ settings: EdocSettings }>("/api/settings/edoc");
        if (!cancelled) applySettings(data.settings);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load e-doc settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, applySettings]);

  async function save() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const data = await apiJson<{ settings: EdocSettings }>("/api/settings/edoc", {
        method: "PUT",
        json: {
          enabled,
          failOpen,
          username,
          password: password.trim() || undefined,
          apiBase,
          ewayApiBase,
          tokenUrl,
          einvoicePath,
          ewayPath,
          sellerGstinOverride,
          ewayUserGstin,
          ewayNominalValueInr: Number(ewayNominalValueInr) || 1000,
          ewayAutoEnabled,
        },
      });
      applySettings(data.settings);
      setPassword("");
      setSavedMsg("E-doc settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save e-doc settings.");
    } finally {
      setSaving(false);
    }
  }

  async function testToken() {
    setTesting(true);
    setTestMsg(null);
    setError(null);
    try {
      await apiJson("/api/edoc/test-token", { method: "POST" });
      setTestMsg("Masters India token OK — credentials are valid.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Token test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function testEway() {
    setTestingEway(true);
    setTestMsg(null);
    setError(null);
    try {
      await apiJson("/api/edoc/test-eway", { method: "POST" });
      setTestMsg("E-way test bill generated — NIC credentials are working.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "E-way test failed.");
    } finally {
      setTestingEway(false);
    }
  }

  async function testEinvoice() {
    setTestingEinvoice(true);
    setTestMsg(null);
    setError(null);
    try {
      await apiJson("/api/edoc/test-einvoice", { method: "POST" });
      const gstin = meta?.effectiveEinvoiceGstin ?? "09AAAPG7885R002";
      setTestMsg(`E-invoice IRP reachable — sandbox uses test GSTIN ${gstin}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "E-invoice IRP check failed.");
    } finally {
      setTestingEinvoice(false);
    }
  }

  const sandboxMode = meta?.sandboxMode ?? /sandb-api/i.test(apiBase);
  const effectiveEwayGstin = meta?.effectiveEwayGstin ?? "";
  const effectiveEinvoiceGstin = meta?.effectiveEinvoiceGstin ?? "";

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
        description="GST e-invoice (IRN) for B2B quick bills and e-way for inter-location transfers. Credentials are stored in the database — not hardcoded."
      />
      <p className="mb-4 text-sm text-stone-600">
        <Link to="/settings/tax" className="font-semibold text-zimson-700 underline">
          Tax & billing
        </Link>{" "}
        controls GST rates and HSN/SAC. This page connects to Masters India IRP.
      </p>

      {loading ? <p className="text-sm text-stone-500">Loading…</p> : null}
      {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error}</p> : null}
      {savedMsg ? <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">{savedMsg}</p> : null}
      {testMsg ? <p className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-200">{testMsg}</p> : null}

      {!loading ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zimson-900">Masters India e-doc</h2>
              {meta ? (
                <p className="mt-1 text-xs text-stone-500">
                  {meta.configured ? "Configured" : "Not configured"} ·{" "}
                  {meta.configuredFromDatabase ? "database credentials" : "not configured — save Masters India settings below"}
                  {meta.updatedBy ? ` · last saved by ${meta.updatedBy}` : ""}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={testing || testingEway || testingEinvoice || saving}
                onClick={() => void testToken()}
                className="rounded-xl border border-zimson-400 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50 disabled:opacity-60"
              >
                {testing ? "Testing…" : "Test token"}
              </button>
              <button
                type="button"
                disabled={testing || testingEway || testingEinvoice || saving}
                onClick={() => void testEinvoice()}
                className="rounded-xl border border-emerald-400 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-60"
              >
                {testingEinvoice ? "Testing…" : "Test e-invoice IRP"}
              </button>
              <button
                type="button"
                disabled={testing || testingEway || testingEinvoice || saving}
                onClick={() => void testEway()}
                className="rounded-xl border border-violet-400 bg-white px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-50 disabled:opacity-60"
              >
                {testingEway ? "Testing…" : "Test e-way"}
              </button>
            </div>
          </div>

          {sandboxMode ? (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-semibold">Sandbox API (sandb-api.mastersindia.co)</p>
              <p className="mt-1">
                E-way uses your configured GSTIN and region consignor/consignee —{" "}
                {effectiveEwayGstin ? (
                  <span className="font-mono">{effectiveEwayGstin}</span>
                ) : (
                  "set E-way user GSTIN below"
                )}
                . Register NIC e-way API credentials for that GSTIN on the Masters India portal (separate from
                e-invoice IRP login).
              </p>
              <p className="mt-2 text-xs text-amber-900">
                Sandbox e-invoice always uses Masters India test seller GSTIN{" "}
                <span className="font-mono">{effectiveEinvoiceGstin || "09AAAPG7885R002"}</span> (IRP on sandb-api).
                E-way uses your configured GSTIN ({effectiveEwayGstin || "see below"}).
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
              <p className="font-semibold">Production API (router.mastersindia.co)</p>
              <p className="mt-1">
                E-invoice uses your store/region GSTIN{" "}
                <span className="font-mono">{effectiveEinvoiceGstin || sellerGstinOverride || "—"}</span>. GSTIN must be
                registered on{" "}
                <a className="font-semibold underline" href="https://edoc.mastersindia.co" target="_blank" rel="noreferrer">
                  edoc.mastersindia.co
                </a>{" "}
                under login <span className="font-mono">{username || "—"}</span> with IRP username/password.
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-50"
              onClick={() => {
                setApiBase("https://sandb-api.mastersindia.co");
                setEwayApiBase("https://sandb-api.mastersindia.co");
                setTokenUrl("https://sandb-api.mastersindia.co/api/v1/token-auth/");
              }}
            >
              Use sandbox API
            </button>
            <button
              type="button"
              className="rounded-lg border border-emerald-500 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-50"
              onClick={() => {
                setApiBase("https://router.mastersindia.co");
                setEwayApiBase("https://router.mastersindia.co");
                setTokenUrl("https://router.mastersindia.co/api/v1/token-auth/");
              }}
            >
              Use production API
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <Toggle checked={enabled} onChange={setEnabled} label="E-doc enabled (generate IRN for B2B quick bills)" />
            <Toggle
              checked={failOpen}
              onChange={setFailOpen}
              label="Fail open — save bill even if IRP rejects (error stored on bill)"
            />
            <Toggle checked={ewayAutoEnabled} onChange={setEwayAutoEnabled} label="Auto e-way on inter-GSTIN dispatch challans" />

            <div className="ui-form-grid">
              <div>
                <span className={labelClass}>Portal username</span>
                <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div>
                <span className={labelClass}>Portal password {hasPassword ? "(saved — leave blank to keep)" : ""}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  className={inputClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={hasPassword ? "••••••••" : "Password"}
                />
              </div>
              <div>
                <span className={labelClass}>E-invoice API base URL</span>
                <input className={inputClass} value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
              </div>
              <div>
                <span className={labelClass}>E-way API base URL</span>
                <input className={inputClass} value={ewayApiBase} onChange={(e) => setEwayApiBase(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <span className={labelClass}>Token URL</span>
                <input className={inputClass} value={tokenUrl} onChange={(e) => setTokenUrl(e.target.value)} placeholder="https://sandb-api.mastersindia.co/api/v1/token-auth/" />
              </div>
              <div>
                <span className={labelClass}>E-invoice path</span>
                <input className={inputClass} value={einvoicePath} onChange={(e) => setEinvoicePath(e.target.value)} />
              </div>
              <div>
                <span className={labelClass}>E-way path</span>
                <input className={inputClass} value={ewayPath} onChange={(e) => setEwayPath(e.target.value)} />
                <p className="mt-1 text-xs text-stone-500">
                  Must be <span className="font-mono">/api/v1/ewayBillsGenerate/</span> (Bills with an s). Wrong path
                  returns &quot;Invalid Product&quot;.
                </p>
              </div>
              <div>
                <span className={labelClass}>Seller GSTIN override (production)</span>
                <input
                  className={inputClass}
                  value={sellerGstinOverride}
                  onChange={(e) => setSellerGstinOverride(e.target.value.toUpperCase())}
                  placeholder="33AAACZ0566D1ZN"
                />
                {sandboxMode ? (
                  <p className="mt-1 text-xs text-amber-800">
                    Not used for sandbox e-invoice — IRP always uses{" "}
                    <span className="font-mono">{effectiveEinvoiceGstin || "09AAAPG7885R002"}</span>. Used for production
                    e-invoice and as e-way fallback.
                  </p>
                ) : null}
              </div>
              <div>
                <span className={labelClass}>E-way user GSTIN</span>
                <input
                  className={inputClass}
                  value={ewayUserGstin}
                  onChange={(e) => setEwayUserGstin(e.target.value.toUpperCase())}
                  placeholder="05AAABC0181E1ZE"
                />
                {sandboxMode ? (
                  <p className="mt-1 text-xs text-amber-800">
                    Used as e-way userGstin when region GSTIN is missing. Current effective:{" "}
                    <span className="font-mono">{effectiveEwayGstin || "—"}</span>
                  </p>
                ) : null}
              </div>
              <div>
                <span className={labelClass}>E-way nominal value (INR)</span>
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  value={ewayNominalValueInr}
                  onChange={(e) => setEwayNominalValueInr(e.target.value)}
                />
              </div>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zimson-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save e-doc settings"}
            </button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
