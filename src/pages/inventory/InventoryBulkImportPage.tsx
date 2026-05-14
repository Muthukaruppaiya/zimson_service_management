import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useApiMode } from "../../lib/api";

// ── Column reference data ────────────────────────────────────────────────────

const SHEETS = [
  {
    name: "Spares",
    color: "bg-rlx-green text-white",
    badge: "Sheet 1",
    desc: "Master spare parts catalogue — one row per SKU.",
    columns: [
      { col: "sku", req: true, note: "Unique identifier, e.g. SP-GLASS-001" },
      { col: "name", req: true, note: "Short display name" },
      { col: "description", req: false, note: "Long description (optional)" },
      { col: "category", req: true, note: "Glass / Battery / Crown / Strap / Movement / Other…" },
      { col: "hsn", req: false, note: "HSN tariff code" },
      { col: "mrp_inr", req: false, note: "Maximum retail price in INR" },
      { col: "is_active", req: true, note: "yes / no — controls catalogue visibility" },
    ],
  },
  {
    name: "Prices",
    color: "bg-rlx-gold text-rlx-green",
    badge: "Sheet 2",
    desc: "Region + brand specific selling prices.",
    columns: [
      { col: "sku", req: true, note: "Must match a SKU in the Spares sheet" },
      { col: "region_name", req: true, note: "Exact region name (e.g. COIMBATORE HO)" },
      { col: "watch_brand", req: true, note: "Brand name the price applies to" },
      { col: "price_inr", req: true, note: "Selling price in INR (numeric)" },
    ],
  },
  {
    name: "Stock",
    color: "bg-stone-700 text-white",
    badge: "Sheet 3",
    desc: "Opening / adjustment stock per location.",
    columns: [
      { col: "sku", req: true, note: "Must match a SKU in the Spares sheet" },
      { col: "location_type", req: true, note: "HO or STORE" },
      { col: "region_name", req: true, note: "Region name (e.g. COIMBATORE HO)" },
      { col: "store_name", req: false, note: "Required when location_type = STORE" },
      { col: "quantity", req: true, note: "Integer quantity (positive to add stock)" },
    ],
  },
];

// ── Step indicator ───────────────────────────────────────────────────────────

function StepBar({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Download template" },
    { n: 2, label: "Upload & validate" },
    { n: 3, label: "Confirm import" },
  ];
  return (
    <div className="mb-8 flex items-center gap-0">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center text-xs font-bold ${
                s.n < step
                  ? "bg-rlx-green text-white"
                  : s.n === step
                  ? "border-2 border-rlx-green bg-white text-rlx-green"
                  : "border border-stone-300 bg-stone-50 text-stone-400"
              }`}
            >
              {s.n < step ? (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
                  <polyline points="13 4 6 12 3 9" />
                </svg>
              ) : (
                s.n
              )}
            </div>
            <span
              className={`hidden text-[11px] font-semibold uppercase tracking-widest sm:inline ${
                s.n === step ? "text-rlx-green" : s.n < step ? "text-stone-500" : "text-stone-300"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`mx-3 h-px w-10 ${s.n < step ? "bg-rlx-green" : "bg-stone-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function InventoryBulkImportPage() {
  const apiMode = useApiMode();
  const { user } = useAuth();
  const canImport = user?.role === "super_admin" || user?.role === "admin" || user?.role === "ho_manager" || user?.role === "ho_purchase";

  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "download" | "validate" | "commit">(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [validated, setValidated] = useState(false);
  const [summary, setSummary] = useState<{ spareRows: number; priceRows: number; stockRows: number } | null>(null);
  const [importResult, setImportResult] = useState<{ sparesUpserted: number; pricesUpserted: number; stockUpserted: number } | null>(null);

  const step: 1 | 2 | 3 = importResult ? 3 : validated ? 3 : fileName ? 2 : 1;

  const onPickFile = useCallback((f: File | null) => {
    fileRef.current = f;
    setFileName(f?.name ?? null);
    setValidated(false);
    setErrors([]);
    setSummary(null);
    setMsg(null);
    setImportResult(null);
  }, []);

  const downloadTemplate = useCallback(async () => {
    if (!apiMode) {
      setMsg({ type: "err", text: "API mode is required to download the template. Set VITE_USE_API=true." });
      return;
    }
    setBusy("download");
    setMsg(null);
    try {
      const res = await fetch("/api/inventory/bulk-import/template", { credentials: "include" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "zimson_spares_seed_import.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ type: "ok", text: "Seeded file downloaded. It contains 20 sample spare parts pre-filled with prices and stock. Delete rows you don't need, then validate and import." });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Download failed." });
    } finally {
      setBusy(null);
    }
  }, [apiMode]);

  const validate = useCallback(async () => {
    if (!fileRef.current) {
      setMsg({ type: "err", text: "Please select an .xlsx file first." });
      return;
    }
    if (!apiMode) {
      setMsg({ type: "err", text: "API mode is required to validate files." });
      return;
    }
    setBusy("validate");
    setMsg(null);
    setErrors([]);
    setValidated(false);
    try {
      const fd = new FormData();
      fd.append("file", fileRef.current);
      const res = await fetch("/api/inventory/bulk-import/validate", { method: "POST", body: fd, credentials: "include" });
      const data = (await res.json()) as {
        ok?: boolean;
        errors?: string[];
        summary?: { spareRows: number; priceRows: number; stockRows: number };
      };
      if (!res.ok || !data.ok) {
        setValidated(false);
        setErrors(Array.isArray(data.errors) ? data.errors : ["Validation failed."]);
        setMsg({ type: "err", text: `Found ${(data.errors ?? []).length} issue(s). Fix your file and validate again.` });
        return;
      }
      setValidated(true);
      setSummary(data.summary ?? null);
      setMsg({ type: "ok", text: "File looks good. Review the summary below and click Import." });
    } catch {
      setMsg({ type: "err", text: "Could not reach the server." });
    } finally {
      setBusy(null);
    }
  }, [apiMode]);

  const commit = useCallback(async () => {
    if (!fileRef.current || !validated) return;
    setBusy("commit");
    setMsg(null);
    setErrors([]);
    try {
      const fd = new FormData();
      fd.append("file", fileRef.current);
      const res = await fetch("/api/inventory/bulk-import/commit", { method: "POST", body: fd, credentials: "include" });
      const data = (await res.json()) as {
        ok?: boolean;
        errors?: string[];
        summary?: { sparesUpserted: number; pricesUpserted: number; stockUpserted: number };
      };
      if (!res.ok || !data.ok) {
        setErrors(Array.isArray(data.errors) ? data.errors : ["Import failed."]);
        setMsg({ type: "err", text: "Import was rejected — see errors below." });
        return;
      }
      setValidated(false);
      setImportResult(data.summary ?? { sparesUpserted: 0, pricesUpserted: 0, stockUpserted: 0 });
      setMsg(null);
    } catch {
      setMsg({ type: "err", text: "Could not complete the import." });
    } finally {
      setBusy(null);
    }
  }, [validated]);

  function resetAll() {
    fileRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
    setFileName(null);
    setValidated(false);
    setErrors([]);
    setSummary(null);
    setMsg(null);
    setImportResult(null);
  }

  if (!canImport) {
    return (
      <div>
        <InventoryBreadcrumb current="Spares bulk import" />
        <PageHeader title="Spares Bulk Import" description="" />
        <div className="border border-rlx-rule bg-white px-6 py-10 text-center text-sm text-stone-400">
          Only Admins, HO Managers and HO Purchase users can run bulk import.
          <div className="mt-4">
            <Link to="/inventory/spares" className="text-rlx-green font-semibold hover:underline">
              ← Back to Spare Catalogue
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb current="Spares bulk import" />
      <PageHeader
        title="Spares Bulk Import"
        description="Download the Excel template, fill Spares / Prices / Stock sheets, validate, then import in one transaction."
        actions={
          <Link
            to="/inventory/spares"
            className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-rlx-green hover:bg-stone-50 transition"
          >
            ← Spare Catalogue
          </Link>
        }
      />

      <StepBar step={step} />

      {/* ── Import success ── */}
      {importResult && (
        <div className="mb-6 border border-blue-200 bg-blue-50 px-5 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-rlx-green">
              <svg viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.5" className="h-5 w-5">
                <polyline points="17 5 8 15 3 10" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-800">Import completed successfully</p>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-blue-700">
                <span className="border border-blue-200 bg-white px-3 py-1">
                  <strong>{importResult.sparesUpserted}</strong> spare(s) upserted
                </span>
                <span className="border border-blue-200 bg-white px-3 py-1">
                  <strong>{importResult.pricesUpserted}</strong> price line(s) upserted
                </span>
                <span className="border border-blue-200 bg-white px-3 py-1">
                  <strong>{importResult.stockUpserted}</strong> stock row(s) upserted
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={resetAll}
              className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 transition"
            >
              Import another file
            </button>
          </div>
        </div>
      )}

      {/* ── Error / info message ── */}
      {msg && !importResult && (
        <div
          className={`mb-5 border px-4 py-3 text-sm ${
            msg.type === "ok"
              ? "border-blue-200 bg-blue-50 text-blue-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {msg.type === "ok" ? "✓ " : "✕ "}{msg.text}
        </div>
      )}

      {!importResult && (
        <div className="grid gap-5 lg:grid-cols-2">

          {/* ── Step 1: Download ── */}
          <div className="border border-rlx-rule bg-white">
            <div className="border-b border-rlx-rule bg-rlx-green px-5 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Step 1</p>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Download Template</h3>
            </div>
            <div className="p-5">
              <p className="text-sm text-stone-600">
                Downloads a pre-filled Excel with <strong>20 real watch-service spare parts</strong> across Batteries, Glass, Crowns, Gaskets, Straps, Lubricants and Tools — complete with Prices and Stock sheets auto-filled from your regions and brands.
              </p>
              <ul className="mt-3 space-y-1 text-xs text-stone-500">
                <li className="flex items-center gap-2"><span className="text-rlx-green font-bold">✓</span> 20 spare SKUs seeded (batteries, crystals, straps, tools…)</li>
                <li className="flex items-center gap-2"><span className="text-rlx-green font-bold">✓</span> Prices auto-filled for all your regions &amp; brands</li>
                <li className="flex items-center gap-2"><span className="text-rlx-green font-bold">✓</span> Opening stock of 20 (HO) + 5 (Store) per SKU</li>
                <li className="flex items-center gap-2"><span className="text-stone-400">i</span> Delete rows you don't want before importing</li>
              </ul>
              <button
                type="button"
                onClick={() => void downloadTemplate()}
                disabled={busy !== null}
                className="mt-4 flex items-center gap-2 bg-rlx-green px-5 py-2.5 text-sm font-semibold text-white hover:bg-rlx-green/90 transition disabled:opacity-50"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M10 3v10M5 9l5 5 5-5M3 16h14" />
                </svg>
                {busy === "download" ? "Preparing…" : "Download Seeded .xlsx File"}
              </button>

              {/* API mode warning */}
              {!apiMode && (
                <p className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  API mode is off — template download and import require a live server connection.
                </p>
              )}
            </div>
          </div>

          {/* ── Step 2: Upload & Validate ── */}
          <div className="border border-rlx-rule bg-white">
            <div className="border-b border-rlx-rule bg-rlx-green px-5 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Step 2</p>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Upload & Validate</h3>
            </div>
            <div className="p-5">
              {/* File picker */}
              <div
                className="relative flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-rlx-rule bg-stone-50 py-7 text-center hover:border-rlx-green/50 hover:bg-rlx-green/5 transition"
                onClick={() => inputRef.current?.click()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 h-8 w-8 text-stone-300">
                  <path d="M9 13h6m-3-3v6M13 3H8a2 2 0 00-2 2v14a2 2 0 002 2h8a2 2 0 002-2V8l-5-5z" />
                  <polyline points="13 3 13 8 18 8" />
                </svg>
                {fileName ? (
                  <p className="text-sm font-semibold text-rlx-green">{fileName}</p>
                ) : (
                  <p className="text-sm text-stone-400">Click to select .xlsx file</p>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void validate()}
                  disabled={!fileRef.current || busy !== null}
                  className="border border-rlx-rule bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition disabled:opacity-50"
                >
                  {busy === "validate" ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" />
                      </svg>
                      Checking…
                    </span>
                  ) : "Check file"}
                </button>
                <button
                  type="button"
                  onClick={() => void commit()}
                  disabled={!validated || !fileRef.current || busy !== null}
                  className="bg-rlx-green px-5 py-2.5 text-sm font-semibold text-white hover:bg-rlx-green/90 transition disabled:opacity-40"
                >
                  {busy === "commit" ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" />
                      </svg>
                      Importing…
                    </span>
                  ) : "Import to database"}
                </button>
              </div>

              {/* Validated summary */}
              {validated && summary && (
                <div className="mt-4 border border-blue-200 bg-blue-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-2">Ready to import</p>
                  <div className="flex flex-wrap gap-3 text-xs text-blue-800">
                    <span>{summary.spareRows} spare row(s)</span>
                    <span className="text-blue-300">|</span>
                    <span>{summary.priceRows} price row(s)</span>
                    <span className="text-blue-300">|</span>
                    <span>{summary.stockRows} stock row(s)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Validation errors ── */}
      {errors.length > 0 && (
        <div className="mt-5 border border-red-200 bg-white">
          <div className="border-b border-red-200 bg-red-50 px-5 py-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-red-700">
              {errors.length} Validation Error{errors.length > 1 ? "s" : ""}
            </h3>
            <p className="text-[11px] text-red-500 mt-0.5">Correct your spreadsheet and run Check file again.</p>
          </div>
          <ul className="divide-y divide-red-100">
            {errors.map((err, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-2.5 text-sm text-red-800">
                <span className="mt-0.5 shrink-0 text-[10px] font-bold text-red-400">{String(i + 1).padStart(2, "0")}</span>
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Column reference ── */}
      <div className="mt-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-rlx-rule" />
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400">Column Reference</p>
          <div className="h-px flex-1 bg-rlx-rule" />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {SHEETS.map((sheet) => (
            <div key={sheet.name} className="border border-rlx-rule bg-white overflow-hidden">
              {/* Sheet header */}
              <div className={`flex items-center justify-between px-4 py-3 ${sheet.color}`}>
                <h4 className="text-sm font-bold uppercase tracking-wide">{sheet.name}</h4>
                <span className="text-[10px] font-semibold opacity-70">{sheet.badge}</span>
              </div>
              <p className="border-b border-rlx-rule px-4 py-2 text-[11px] text-stone-500">{sheet.desc}</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    <th className="px-4 py-2 text-left">Column</th>
                    <th className="px-3 py-2 text-center">Req</th>
                    <th className="px-4 py-2 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.columns.map((c, i) => (
                    <tr key={c.col} className={`border-t border-rlx-rule ${i % 2 === 0 ? "bg-white" : "bg-stone-50/60"}`}>
                      <td className="px-4 py-2 font-mono font-semibold text-stone-800">{c.col}</td>
                      <td className="px-3 py-2 text-center">
                        {c.req ? (
                          <span className="text-rlx-green font-bold">✓</span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-stone-500 leading-relaxed">{c.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[11px] text-stone-400">
          Keep header row on row 1 of each sheet. All sheet names are case-sensitive.
          <Link to="/inventory/spares" className="ml-2 font-semibold text-rlx-green hover:underline">
            View Spare Catalogue →
          </Link>
        </p>
      </div>
    </div>
  );
}
