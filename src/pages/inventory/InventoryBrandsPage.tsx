import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useBrands } from "../../context/BrandsContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import type { BrandRow } from "../../types/brand";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2";

export function InventoryBrandsPage() {
  const { user } = useAuth();
  const api = useApiMode();
  const { refreshBrands } = useBrands();
  const canManage = user?.role === "super_admin" || user?.role === "admin";
  const [rows, setRows] = useState<BrandRow[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [serialNumberRequired, setSerialNumberRequired] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) {
      setErr("Brand master is only available when the app runs against the API / database.");
      setRows([]);
      return;
    }
    setErr(null);
    try {
      const path = canManage ? "/api/brands?all=1" : "/api/brands";
      const data = await apiJson<{ brands: BrandRow[] }>(path);
      setRows(
        [...data.brands].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      );
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load brands.");
    }
  }, [api, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addBrand(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (!canManage) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Brand name is required.");
      return;
    }
    const so = Number(sortOrder);
    if (Number.isNaN(so)) {
      setErr("Display order must be a number.");
      return;
    }
    try {
      await apiJson("/api/brands", {
        method: "POST",
        json: {
          name: trimmed,
          code: code.trim() || undefined,
          sortOrder: so,
          serialNumberRequired,
        },
      });
      setOk("Brand added.");
      setName("");
      setCode("");
      setSortOrder("0");
      setSerialNumberRequired(false);
      await load();
      await refreshBrands();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not add brand.");
    }
  }

  async function toggleActive(b: BrandRow) {
    if (!canManage) return;
    setErr(null);
    setOk(null);
    setBusyId(b.id);
    try {
      await apiJson(`/api/brands/${encodeURIComponent(b.id)}`, {
        method: "PATCH",
        json: { isActive: !b.isActive },
      });
      setOk(b.isActive ? "Brand deactivated." : "Brand reactivated.");
      await load();
      await refreshBrands();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not update brand.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSerialNumberRequired(b: BrandRow) {
    if (!canManage) return;
    setErr(null);
    setOk(null);
    setBusyId(b.id);
    try {
      await apiJson(`/api/brands/${encodeURIComponent(b.id)}`, {
        method: "PATCH",
        json: { serialNumberRequired: !b.serialNumberRequired },
      });
      setOk(
        !b.serialNumberRequired
          ? `Serial number is now mandatory for ${b.name}.`
          : `Serial number is now optional for ${b.name}.`,
      );
      await load();
      await refreshBrands();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not update serial number requirement.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <InventoryBreadcrumb current="Brands" />
      <PageHeader
        title="Brand master"
        description="Short codes and display names used everywhere the app asks for a watch brand (spare regional prices, quick bill, SRF)."
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
          <p className="text-sm text-stone-600">
            Turn on API mode (do not set <span className="font-mono">VITE_USE_API=false</span>) and run the server
            with PostgreSQL to maintain brands here.
          </p>
        </Card>
      ) : null}

      {canManage ? (
        <Card title="Add brand" subtitle="Code is optional; if omitted it is generated from the name (letters and digits only)." className="mb-8">
          <form onSubmit={addBrand} className="grid gap-4 md:grid-cols-5">
            <div>
              <label htmlFor="br-name" className="text-xs font-medium text-stone-600">
                Name *
              </label>
              <input id="br-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="br-code" className="text-xs font-medium text-stone-600">
                Code (optional)
              </label>
              <input
                id="br-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={inputClass}
                placeholder="Auto from name if empty"
              />
            </div>
            <div>
              <label htmlFor="br-sort" className="text-xs font-medium text-stone-600">
                Display order
              </label>
              <input
                id="br-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className={inputClass}
              />
            </div>
            <label className="flex items-end gap-2 pb-2.5 text-sm font-medium text-stone-700">
              <input
                type="checkbox"
                checked={serialNumberRequired}
                onChange={(e) => setSerialNumberRequired(e.target.checked)}
                className="h-4 w-4 rounded border-zimson-300 text-zimson-600"
              />
              Serial number mandatory
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zimson-700"
              >
                Save brand
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Brands" subtitle={canManage ? "Active brands appear in dropdowns; you can deactivate unused rows." : "Active brands in your organization"}>
        {err ? <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
        {ok ? <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</p> : null}
        <div className="max-h-[480px] overflow-auto rounded-xl border border-zimson-200/80">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Serial mandatory</th>
                {canManage ? <th className="px-3 py-2">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-b border-zimson-100">
                  <td className="px-3 py-2 font-mono text-xs">{b.code}</td>
                  <td className="px-3 py-2 font-medium text-stone-900">{b.name}</td>
                  <td className="px-3 py-2">{b.sortOrder}</td>
                  <td className="px-3 py-2">{b.isActive ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{b.serialNumberRequired ? "Yes" : "No"}</td>
                  {canManage ? (
                    <td className="flex flex-wrap gap-2 px-3 py-2">
                      <button
                        type="button"
                        disabled={busyId === b.id}
                        onClick={() => void toggleSerialNumberRequired(b)}
                        className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50 disabled:opacity-50"
                      >
                        Make serial {b.serialNumberRequired ? "optional" : "mandatory"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === b.id}
                        onClick={() => void toggleActive(b)}
                        className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50 disabled:opacity-50"
                      >
                        {b.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {api && rows.length === 0 && !err ? (
          <p className="mt-3 text-sm text-stone-500">No brands loaded yet.</p>
        ) : null}
      </Card>
    </div>
  );
}
