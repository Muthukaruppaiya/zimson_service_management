import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HsnPicker } from "../../components/service/HsnPicker";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import type { HsnMasterRow } from "../../types/hsnMaster";

export function InventoryHsnMasterPage() {
  const { user } = useAuth();
  const api = useApiMode();
  const canManage = user?.role === "super_admin" || user?.role === "admin";
  const [rows, setRows] = useState<HsnMasterRow[]>([]);
  const [draftHsn, setDraftHsn] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) {
      setErr("HSN master is only available when the app runs against the API / database.");
      setRows([]);
      return;
    }
    setErr(null);
    try {
      const path = canManage ? "/api/hsn-master?all=1" : "/api/hsn-master";
      const data = await apiJson<{ rows: HsnMasterRow[] }>(path);
      setRows([...data.rows].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load HSN master.");
    }
  }, [api, canManage]);

  const activeRows = useMemo(() => rows.filter((r) => r.isActive), [rows]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(row: HsnMasterRow) {
    if (!canManage) return;
    setErr(null);
    setOk(null);
    setBusyId(row.id);
    try {
      await apiJson(`/api/hsn-master/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        json: { isActive: !row.isActive },
      });
      setOk(row.isActive ? "HSN code deactivated." : "HSN code reactivated.");
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not update HSN row.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <InventoryBreadcrumb current="HSN master" />
      <PageHeader
        title="HSN master"
        description="GST HSN codes used on brand invoice line items and spare catalogue. Search, add new, and save — same as the family field on SRF booking."
        actions={
          <Link
            to="/inventory"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Inventory home
          </Link>
        }
      />

      {!api ? (
        <Card title="API required">
          <p className="text-sm text-stone-600">Connect to the database-backed API to manage HSN codes.</p>
        </Card>
      ) : null}

      {canManage ? (
        <Card title="Add HSN code" className="mb-6">
          <p className="mb-3 text-sm text-stone-600">
            Search an existing code or choose <strong>+ Add new HSN…</strong>, enter the code, then click <strong>Save</strong>.
          </p>
          <HsnPicker
            idPrefix="hsn-master-add"
            value={draftHsn}
            onChange={setDraftHsn}
            options={activeRows}
            apiMode={api}
            onOptionsUpdated={() => {
              void load();
              setOk("HSN code saved.");
              setDraftHsn("");
            }}
            canSaveNew={canManage}
            label="HSN code"
            required
          />
        </Card>
      ) : null}

      {err ? <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{err}</p> : null}
      {ok ? <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">{ok}</p> : null}

      <Card title={`HSN codes (${rows.length})`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                <th className="px-3 py-2">HSN code</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">GST %</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Status</th>
                {canManage ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-stone-100">
                  <td className="px-3 py-2 font-mono font-semibold">{r.code}</td>
                  <td className="px-3 py-2">{r.description}</td>
                  <td className="px-3 py-2">{r.gstPercent != null ? `${r.gstPercent}%` : "—"}</td>
                  <td className="px-3 py-2">{r.sortOrder}</td>
                  <td className="px-3 py-2">
                    <span className={r.isActive ? "text-emerald-700" : "text-stone-400"}>{r.isActive ? "Active" : "Inactive"}</span>
                  </td>
                  {canManage ? (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void toggleActive(r)}
                        className="text-xs font-semibold text-zimson-800 hover:underline disabled:opacity-50"
                      >
                        {r.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
