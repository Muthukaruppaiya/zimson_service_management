import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useApiMode } from "../../lib/api";

export function InventoryBulkImportPage() {
  const apiMode = useApiMode();
  const { user } = useAuth();
  const canImport = user?.role === "super_admin" || user?.role === "regional_admin";
  const fileRef = useRef<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "download" | "validate" | "commit">(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [validated, setValidated] = useState(false);
  const [lastSummary, setLastSummary] = useState<{ spareRows: number; priceRows: number; stockRows: number } | null>(
    null,
  );

  const onPickFile = useCallback((f: File | null) => {
    fileRef.current = f;
    setFileName(f?.name ?? null);
    setValidated(false);
    setErrors([]);
    setLastSummary(null);
    setMsg(null);
  }, []);

  const downloadTemplate = useCallback(async () => {
    if (!apiMode) {
      setMsg({ type: "err", text: "Turn API mode on (VITE_USE_API) to download the template." });
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
      a.download = "inventory_bulk_import_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      setMsg({
        type: "ok",
        text: "Template downloaded. Edit Spares, Prices, and Stock sheets, then validate before importing.",
      });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Download failed." });
    } finally {
      setBusy(null);
    }
  }, [apiMode]);

  const validate = useCallback(async () => {
    if (!apiMode || !fileRef.current) {
      setMsg({ type: "err", text: "Choose an .xlsx file first." });
      return;
    }
    setBusy("validate");
    setMsg(null);
    setErrors([]);
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
        setMsg({ type: "err", text: "Fix the issues below and validate again." });
        return;
      }
      setValidated(true);
      setLastSummary(data.summary ?? null);
      setMsg({
        type: "ok",
        text: `Ready to import: ${data.summary?.spareRows ?? 0} spare row(s), ${data.summary?.priceRows ?? 0} price row(s), ${data.summary?.stockRows ?? 0} stock row(s).`,
      });
    } catch {
      setValidated(false);
      setMsg({ type: "err", text: "Could not reach the server or read the response." });
    } finally {
      setBusy(null);
    }
  }, [apiMode]);

  const commit = useCallback(async () => {
    if (!apiMode || !fileRef.current || !validated) {
      setMsg({ type: "err", text: "Validate a file successfully before importing." });
      return;
    }
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
      setMsg({
        type: "ok",
        text: `Imported: ${data.summary?.sparesUpserted ?? 0} spare upsert(s), ${data.summary?.pricesUpserted ?? 0} price line(s), ${data.summary?.stockUpserted ?? 0} stock row(s).`,
      });
      setLastSummary(null);
    } catch {
      setMsg({ type: "err", text: "Could not complete import." });
    } finally {
      setBusy(null);
    }
  }, [apiMode, validated]);

  if (!canImport) {
    return (
      <div>
        <InventoryBreadcrumb current="Bulk import" />
        <PageHeader title="Bulk import" description="Only head-office admins can run inventory bulk import." />
        <Card title="Access">
          <p className="text-sm text-stone-600">Sign in as super admin or regional admin to use this screen.</p>
          <Link to="/inventory" className="mt-4 inline-block text-sm font-semibold text-zimson-800 underline">
            Back to inventory
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb current="Bulk import" />
      <PageHeader
        title="Bulk import (Excel)"
        description="Download the template, fill Spares, Prices, and Stock sheets, validate, then import. One transaction updates spare master, regional brand prices, and on-hand stock."
        actions={
          <Link
            to="/inventory/spares"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Spare catalogue
          </Link>
        }
      />

      {msg ? (
        <p
          className={`mb-4 rounded-xl px-3 py-2 text-sm ring-1 ${
            msg.type === "ok"
              ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
              : "bg-red-50 text-red-800 ring-red-200"
          }`}
        >
          {msg.text}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="1. Download template" subtitle="Includes README and sample rows only (no extra reference sheets).">
          <p className="text-sm text-stone-600">
            Required sheets: <strong>Spares</strong>, <strong>Prices</strong>, <strong>Stock</strong>. Keep the header
            row on row 1 of each sheet.
          </p>
          <button
            type="button"
            onClick={() => void downloadTemplate()}
            disabled={!apiMode || busy !== null}
            className="mt-4 rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:opacity-50"
          >
            {busy === "download" ? "Preparing…" : "Download .xlsx template"}
          </button>
        </Card>

        <Card title="2. Validate & import" subtitle="Use the same file for validate and import.">
          <label className="block text-xs font-medium text-stone-600">
            Excel file (.xlsx)
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="mt-2 block w-full text-sm text-stone-700 file:mr-3 file:rounded-lg file:border file:border-zimson-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zimson-900"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {fileName ? <p className="mt-2 text-xs text-stone-500">Selected: {fileName}</p> : null}
          {lastSummary && validated ? (
            <p className="mt-2 text-xs text-stone-600">
              Validated: {lastSummary.spareRows} spare(s), {lastSummary.priceRows} price(s), {lastSummary.stockRows}{" "}
              stock line(s).
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void validate()}
              disabled={!apiMode || !fileRef.current || busy !== null}
              className="rounded-xl border border-zimson-400 bg-white px-5 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50 disabled:opacity-50"
            >
              {busy === "validate" ? "Checking…" : "Check file"}
            </button>
            <button
              type="button"
              onClick={() => void commit()}
              disabled={!apiMode || !validated || !fileRef.current || busy !== null}
              className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:opacity-50"
            >
              {busy === "commit" ? "Importing…" : "Import to database"}
            </button>
          </div>
        </Card>
      </div>

      {errors.length > 0 ? (
        <Card title="Validation / import errors" subtitle="Correct your spreadsheet and run Check file again." className="mt-6">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-red-900">
            {errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </Card>
      ) : null}

    </div>
  );
}
