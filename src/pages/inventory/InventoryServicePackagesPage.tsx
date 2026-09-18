import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { formatInr } from "../../lib/formatInr";
import { packageTypeLabel, watchServiceKindLabel, WATCH_SERVICE_KINDS } from "../../lib/servicePackage";
import type { ServicePackage } from "../../types/servicePackage";

type LocationState = { saved?: "created" | "updated" } | null;

export function InventoryServicePackagesPage() {
  const { user } = useAuth();
  const api = useApiMode();
  const navigate = useNavigate();
  const location = useLocation();
  const canManage = user?.role === "super_admin" || user?.role === "admin";
  const [rows, setRows] = useState<ServicePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) {
      setErr("Service packages need API / database mode.");
      setRows([]);
      setLoading(false);
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const path = canManage ? "/api/catalog/service-packages?all=1" : "/api/catalog/service-packages";
      const data = await apiJson<{ packages: ServicePackage[] }>(path);
      setRows(data.packages ?? []);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load packages.");
    } finally {
      setLoading(false);
    }
  }, [api, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const saved = (location.state as LocationState)?.saved;
    if (!saved) return;
    setOk(saved === "created" ? "Package created." : "Package updated.");
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const brands = useMemo(
    () => Array.from(new Set(rows.map((r) => r.brand))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((pkg) => {
      if (brandFilter && pkg.brand !== brandFilter) return false;
      if (serviceFilter && pkg.serviceType !== serviceFilter) return false;
      if (!q) return true;
      const hay = [
        pkg.brand,
        pkg.serviceType,
        pkg.packageType,
        packageTypeLabel(pkg.packageType),
        watchServiceKindLabel(pkg.serviceType),
        ...(pkg.spares ?? []).flatMap((s) => [s.name, s.sku]),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, brandFilter, serviceFilter]);

  async function toggleActive(pkg: ServicePackage) {
    if (!canManage) return;
    setErr(null);
    setOk(null);
    setBusyId(pkg.id);
    try {
      await apiJson(`/api/catalog/service-packages/${encodeURIComponent(pkg.id)}`, {
        method: "PATCH",
        json: { isActive: !pkg.isActive },
      });
      setOk(pkg.isActive ? "Package deactivated." : "Package reactivated.");
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not update package.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <InventoryBreadcrumb current="Service packages" />
      <PageHeader
        title="Service packages"
        description="Complete / Partial rate cards by brand and Quartz or Mechanical. Each package is a spare list with one price."
        actions={
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <Link
                to="/inventory/service-packages/new"
                className="bg-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-rlx-green/90"
              >
                + Add package
              </Link>
            ) : null}
            <Link
              to="/inventory"
              className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 transition hover:bg-stone-50"
            >
              Inventory home
            </Link>
          </div>
        }
      />

      {err ? <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div> : null}
      {ok ? <div className="mb-4 border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">✓ {ok}</div> : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
          >
            <circle cx="6.5" cy="6.5" r="4.5" />
            <line x1="10" y1="10" x2="14" y2="14" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand, package, spare…"
            className="w-full border border-rlx-rule bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-rlx-green"
          />
        </div>
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="border border-rlx-rule bg-white px-3 py-2 text-sm outline-none focus:border-rlx-green"
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="border border-rlx-rule bg-white px-3 py-2 text-sm outline-none focus:border-rlx-green"
        >
          <option value="">All service types</option>
          {WATCH_SERVICE_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2 text-xs">
          <span className="border border-rlx-rule bg-white px-3 py-2 text-stone-500">
            Total: <strong>{rows.length}</strong>
          </span>
          <span className="border border-blue-200 bg-blue-50 px-3 py-2 text-blue-700">
            Active: <strong>{rows.filter((r) => r.isActive).length}</strong>
          </span>
        </div>
      </div>

      <div className="border border-rlx-rule bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-rlx-rule bg-rlx-green px-5 py-3.5">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">All packages</h3>
          <span className="border border-white/30 px-2 py-0.5 text-[10px] font-bold text-white/70">
            {filtered.length}
          </span>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-stone-500">
              {search || brandFilter || serviceFilter
                ? "No packages match the current filters."
                : "No packages yet."}
            </p>
            {canManage && !search && !brandFilter && !serviceFilter ? (
              <Link
                to="/inventory/service-packages/new"
                className="mt-4 inline-flex bg-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white"
              >
                + Add first package
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  <th className="px-5 py-3 text-left">Brand</th>
                  <th className="px-5 py-3 text-left">Service type</th>
                  <th className="px-5 py-3 text-left">Package</th>
                  <th className="px-5 py-3 text-left">Spare details</th>
                  <th className="px-5 py-3 text-right">Price</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  {canManage ? <th className="px-5 py-3 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((pkg) => (
                  <tr
                    key={pkg.id}
                    className="group border-b border-rlx-rule last:border-0 transition hover:bg-rlx-green/5"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-stone-800">{pkg.brand}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-700">
                        {watchServiceKindLabel(pkg.serviceType)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-full bg-rlx-green/10 px-2.5 py-0.5 text-[11px] font-semibold text-rlx-green">
                        {packageTypeLabel(pkg.packageType)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {(pkg.spares ?? []).length === 0 ? (
                          <span className="text-xs text-stone-400">—</span>
                        ) : (
                          (pkg.spares ?? []).map((s) => (
                            <span
                              key={s.spareId}
                              className="rounded border border-rlx-rule bg-stone-50 px-2 py-0.5 text-[11px] text-stone-600"
                            >
                              {s.name}
                              {s.qty > 1 ? ` ×${s.qty}` : ""}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-stone-900">
                      {formatInr(pkg.priceInr)}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          pkg.isActive ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {pkg.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {canManage ? (
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-2">
                          <Link
                            to={`/inventory/service-packages/${encodeURIComponent(pkg.id)}/edit`}
                            className="border border-rlx-rule bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-rlx-green transition hover:bg-stone-50"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            disabled={busyId === pkg.id}
                            onClick={() => void toggleActive(pkg)}
                            className="border border-rlx-rule bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-stone-500 transition hover:bg-stone-50 disabled:opacity-50"
                          >
                            {pkg.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
