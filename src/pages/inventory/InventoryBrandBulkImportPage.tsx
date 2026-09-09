import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { BulkImportSuccessModal } from "../../components/ui/BulkImportSuccessModal";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useBrands } from "../../context/BrandsContext";
import { useApiMode } from "../../lib/api";
import { BRAND_BULK_IMPORT_COLUMNS } from "../../lib/brandBulkImportColumns";

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

type PreviewRow = { name: string; code: string; action: "create" | "update" };

export function InventoryBrandBulkImportPage() {
  const apiMode = useApiMode();
  const { user } = useAuth();
  const { refreshBrands } = useBrands();
  const canImport = user?.role === "super_admin" || user?.role === "admin";

  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "download" | "validate" | "commit">(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [validated, setValidated] = useState(false);
  const [summary, setSummary] = useState<{ rowCount: number; willCreate: number; willUpdate: number } | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; rowCount: number } | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const step: 1 | 2 | 3 = importResult ? 3 : validated ? 3 : fileName ? 2 : 1;

  const onPickFile = useCallback((f: File | null) => {
    fileRef.current = f;
    setFileName(f?.name ?? null);
    setValidated(false);
    setErrors([]);
    setSummary(null);
    setPreview([]);
    setMsg(null);
    setImportResult(null);
    setSuccessOpen(false);
  }, []);

  const downloadTemplate = useCallback(async () => {
    if (!apiMode) {
      setMsg({ type: "err", text: "API mode is required to download the template." });
      return;
    }
    setBusy("download");
    setMsg(null);
    try {
      const res = await fetch("/api/brands/bulk-import/template", { credentials: "include" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "zimson_brand_bulk_import.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      setMsg({
        type: "ok",
        text: "Template downloaded. It includes sample watch brands. Delete rows you do not want, then Check file before importing.",
      });
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
      const res = await fetch("/api/brands/bulk-import/validate", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        errors?: string[];
        summary?: { rowCount: number; willCreate: number; willUpdate: number };
        preview?: PreviewRow[];
      };
      if (!res.ok || !data.ok) {
        setValidated(false);
        setPreview([]);
        setSummary(null);
        setErrors(Array.isArray(data.errors) ? data.errors : ["Validation failed."]);
        setMsg({ type: "err", text: `Found ${(data.errors ?? []).length} issue(s). Fix the file and check again.` });
        return;
      }
      setValidated(true);
      setSummary(data.summary ?? null);
      setPreview(Array.isArray(data.preview) ? data.preview : []);
      setMsg({ type: "ok", text: "File looks good. Review the preview below, then import." });
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
      const res = await fetch("/api/brands/bulk-import/commit", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        errors?: string[];
        summary?: { created: number; updated: number; rowCount: number };
      };
      if (!res.ok || !data.ok) {
        setErrors(Array.isArray(data.errors) ? data.errors : ["Import failed."]);
        setMsg({ type: "err", text: "Import was rejected — see errors below." });
        return;
      }
      setValidated(false);
      setImportResult(data.summary ?? { created: 0, updated: 0, rowCount: 0 });
      setSuccessOpen(true);
      setMsg(null);
      await refreshBrands();
    } catch {
      setMsg({ type: "err", text: "Could not complete the import." });
    } finally {
      setBusy(null);
    }
  }, [validated, refreshBrands]);

  function resetAll() {
    fileRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
    setFileName(null);
    setValidated(false);
    setErrors([]);
    setSummary(null);
    setPreview([]);
    setMsg(null);
    setImportResult(null);
    setSuccessOpen(false);
  }

  if (!canImport) {
    return (
      <div>
        <InventoryBreadcrumb current="Brand bulk import" />
        <PageHeader title="Brand Bulk Import" description="" />
        <div className="border border-rlx-rule bg-white px-6 py-10 text-center text-sm text-stone-400">
          Only Super Admin and Admin can run brand bulk import.
          <div className="mt-4">
            <Link to="/inventory/brands" className="font-semibold text-rlx-green hover:underline">
              ← Back to Brand master
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb current="Brand bulk import" />
      <PageHeader
        title="Brand Bulk Import"
        description="Download the Excel template, fill name / code / order / active / serial mandatory, check the file, then import. Matching brand names are updated."
        actions={
          <Link
            to="/inventory/brands"
            className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-rlx-green transition hover:bg-stone-50"
          >
            ← Brand master
          </Link>
        }
      />

      <StepBar step={step} />

      <BulkImportSuccessModal
        open={successOpen && !!importResult}
        entityLabel="Brands"
        description="Brands have been saved. Matching names were updated."
        stats={
          importResult
            ? [
                { label: "Created", value: importResult.created },
                { label: "Updated", value: importResult.updated },
                { label: "Rows processed", value: importResult.rowCount },
              ]
            : []
        }
        masterHref="/inventory/brands"
        masterLabel="Brand master"
        onClose={() => setSuccessOpen(false)}
        onImportAnother={resetAll}
      />

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
                  <strong>{importResult.created}</strong> created
                </span>
                <span className="border border-blue-200 bg-white px-3 py-1">
                  <strong>{importResult.updated}</strong> updated
                </span>
                <span className="border border-blue-200 bg-white px-3 py-1">
                  <strong>{importResult.rowCount}</strong> row(s) processed
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={resetAll}
              className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold text-stone-600 transition hover:bg-stone-50"
            >
              Import another file
            </button>
          </div>
        </div>
      )}

      {msg && !importResult && (
        <div
          className={`mb-5 border px-4 py-3 text-sm ${
            msg.type === "ok" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {msg.type === "ok" ? "✓ " : "✕ "}
          {msg.text}
        </div>
      )}

      {!importResult && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="border border-rlx-rule bg-white">
            <div className="border-b border-rlx-rule bg-rlx-green px-5 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Step 1</p>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Download Template</h3>
            </div>
            <div className="p-5">
              <p className="text-sm text-stone-600">
                Downloads an Excel workbook with a <strong>README</strong> and a <strong>Brands</strong> sheet (headers + 5
                sample watch brands). Same fields as Add brand.
              </p>
              <ul className="mt-3 space-y-1 text-xs text-stone-500">
                <li className="flex items-center gap-2">
                  <span className="font-bold text-rlx-green">✓</span> Excel dropdowns for Active and Serial Number Mandatory (Y / N)
                </li>
                <li className="flex items-center gap-2">
                  <span className="font-bold text-rlx-green">✓</span> Name, code, display order, active, serial mandatory
                </li>
                <li className="flex items-center gap-2">
                  <span className="font-bold text-rlx-green">✓</span> Matching Brand Name updates; new names create
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-stone-400">i</span> Delete sample rows before a live import
                </li>
              </ul>
              <button
                type="button"
                onClick={() => void downloadTemplate()}
                disabled={busy !== null}
                className="mt-4 flex items-center gap-2 bg-rlx-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rlx-green/90 disabled:opacity-50"
              >
                {busy === "download" ? "Preparing…" : "Download reference .xlsx"}
              </button>
            </div>
          </div>

          <div className="border border-rlx-rule bg-white">
            <div className="border-b border-rlx-rule bg-rlx-green px-5 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Step 2</p>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Upload &amp; Validate</h3>
            </div>
            <div className="p-5">
              <div
                className="relative flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-rlx-rule bg-stone-50 py-7 text-center transition hover:border-rlx-green/50 hover:bg-rlx-green/5"
                onClick={() => inputRef.current?.click()}
              >
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
                  className="border border-rlx-rule bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
                >
                  {busy === "validate" ? "Checking…" : "Check file"}
                </button>
                <button
                  type="button"
                  onClick={() => void commit()}
                  disabled={!validated || !fileRef.current || busy !== null}
                  className="bg-rlx-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rlx-green/90 disabled:opacity-40"
                >
                  {busy === "commit" ? "Importing…" : "Import to database"}
                </button>
              </div>
              {validated && summary && (
                <div className="mt-4 border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
                  {summary.rowCount} row(s) · {summary.willCreate} create · {summary.willUpdate} update
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {validated && preview.length > 0 && !importResult && (
        <div className="mt-5 border border-rlx-rule bg-white">
          <div className="border-b border-rlx-rule bg-stone-50 px-5 py-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-stone-600">Validation preview</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rlx-rule text-left text-[10px] font-bold uppercase tracking-wider text-stone-400">
                <th className="px-5 py-2">Name</th>
                <th className="px-5 py-2">Code</th>
                <th className="px-5 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={`${row.action}-${row.code}`} className="border-t border-rlx-rule">
                  <td className="px-5 py-2 text-stone-800">{row.name}</td>
                  <td className="px-5 py-2 font-mono text-xs text-stone-700">{row.code}</td>
                  <td className="px-5 py-2 text-[10px] font-bold uppercase tracking-wide text-rlx-green">{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-5 border border-red-200 bg-white">
          <div className="border-b border-red-200 bg-red-50 px-5 py-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-red-700">
              {errors.length} Validation Error{errors.length > 1 ? "s" : ""}
            </h3>
          </div>
          <ul className="divide-y divide-red-100">
            {errors.map((err, i) => (
              <li key={i} className="px-5 py-2.5 text-sm text-red-800">
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 border border-rlx-rule bg-white overflow-hidden">
        <div className="flex items-center justify-between bg-rlx-green px-4 py-3 text-white">
          <h4 className="text-sm font-bold uppercase tracking-wide">Brands</h4>
          <span className="text-[10px] font-semibold opacity-70">Column reference</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-400">
              <th className="px-4 py-2 text-left">Column</th>
              <th className="px-3 py-2 text-center">Req</th>
              <th className="px-4 py-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {BRAND_BULK_IMPORT_COLUMNS.map((c) => (
              <tr key={c.key} className="border-t border-rlx-rule">
                <td className="px-4 py-2 font-semibold text-stone-800">{c.label}</td>
                <td className="px-3 py-2 text-center">{c.required ? "✓" : "—"}</td>
                <td className="px-4 py-2 text-stone-500">{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
