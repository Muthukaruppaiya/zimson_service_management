import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { AppModal, AppModalDetailGrid, AppModalDetailRow, AppModalSection } from "../../components/ui/AppModal";
import { PageHeader } from "../../components/ui/PageHeader";
import {
  IconAmend,
  IconDetails,
  TableActionButton,
  tableActionBtnClass,
} from "../../components/ui/TableActionIcons";
import { modalBtnSecondary, modalFooterClass } from "../../lib/appModalStyles";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { formatInr } from "../../lib/formatInr";
import { packageDisplayName, packageTypeLabel, watchServiceKindLabel, WATCH_SERVICE_KINDS } from "../../lib/servicePackage";
import type { ServicePackage } from "../../types/servicePackage";

type LocationState = { saved?: "created" | "updated" } | null;

const toggleBtnBase =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border bg-white transition disabled:cursor-not-allowed disabled:opacity-40";
const deactivateBtnClass = `${toggleBtnBase} border-red-200 text-red-600 hover:border-red-400 hover:bg-red-50`;
const activateBtnClass = `${toggleBtnBase} border-emerald-200 text-emerald-600 hover:border-emerald-400 hover:bg-emerald-50`;

function IconPower({ className = "h-[1.125rem] w-[1.125rem]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v9M6.34 6.34a8 8 0 1011.32 0" />
    </svg>
  );
}

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
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useMemo(() => rows.find((r) => r.id === detailId) ?? null, [rows, detailId]);

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
        pkg.name,
        pkg.packageType,
        packageDisplayName(pkg),
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
        description="Rate cards by brand, service type, and package name."
        actions={
          <div className="flex flex-wrap gap-2">
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
                  <th className="px-5 py-3 text-left">Package name</th>
                  <th className="px-5 py-3 text-left">Package type</th>
                  <th className="px-5 py-3 text-center">Spares</th>
                  <th className="px-5 py-3 text-right">Price</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
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
                      <p className="font-semibold text-stone-800">{packageDisplayName(pkg)}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-full bg-rlx-green/10 px-2.5 py-0.5 text-[11px] font-semibold text-rlx-green">
                        {packageTypeLabel(pkg.packageType)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {(pkg.spares ?? []).length === 0 ? (
                        <span className="text-xs text-stone-400">—</span>
                      ) : (
                        <button
                          type="button"
                          title="View spares"
                          onClick={() => setDetailId(pkg.id)}
                          className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-rlx-green/10 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-rlx-green transition hover:bg-rlx-green/20"
                        >
                          {(pkg.spares ?? []).length}
                        </button>
                      )}
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
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1.5">
                        <TableActionButton label="View details" onClick={() => setDetailId(pkg.id)}>
                          <IconDetails />
                        </TableActionButton>
                        {canManage ? (
                          <>
                            <Link
                              to={`/inventory/service-packages/${encodeURIComponent(pkg.id)}/edit`}
                              title="Edit package"
                              aria-label="Edit package"
                              className={tableActionBtnClass}
                            >
                              <IconAmend />
                            </Link>
                            <button
                              type="button"
                              title={pkg.isActive ? "Deactivate package" : "Activate package"}
                              aria-label={pkg.isActive ? "Deactivate package" : "Activate package"}
                              disabled={busyId === pkg.id}
                              onClick={() => void toggleActive(pkg)}
                              className={pkg.isActive ? deactivateBtnClass : activateBtnClass}
                            >
                              <IconPower />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail ? (
        <AppModal
          open
          onClose={() => setDetailId(null)}
          eyebrow="Service package"
          title={packageDisplayName(detail)}
          subtitle={detail.brand}
          size="lg"
          footer={
            <div className={modalFooterClass}>
              {canManage ? (
                <Link
                  to={`/inventory/service-packages/${encodeURIComponent(detail.id)}/edit`}
                  title="Edit package"
                  aria-label="Edit package"
                  className={tableActionBtnClass}
                >
                  <IconAmend />
                </Link>
              ) : null}
              <button type="button" className={modalBtnSecondary} onClick={() => setDetailId(null)}>
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <AppModalDetailGrid>
              <AppModalDetailRow label="Brand">{detail.brand}</AppModalDetailRow>
              <AppModalDetailRow label="Service type">{watchServiceKindLabel(detail.serviceType)}</AppModalDetailRow>
              <AppModalDetailRow label="Package name">{packageDisplayName(detail)}</AppModalDetailRow>
              <AppModalDetailRow label="Package type">{packageTypeLabel(detail.packageType)}</AppModalDetailRow>
              <AppModalDetailRow label="Package price">
                <span className="font-semibold tabular-nums">{formatInr(detail.priceInr)}</span>
              </AppModalDetailRow>
              <AppModalDetailRow label="Status">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    detail.isActive ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {detail.isActive ? "Active" : "Inactive"}
                </span>
              </AppModalDetailRow>
              {detail.updatedAt || detail.createdAt ? (
                <AppModalDetailRow label="Last updated" last>
                  {new Date(detail.updatedAt ?? detail.createdAt!).toLocaleString("en-IN")}
                </AppModalDetailRow>
              ) : null}
            </AppModalDetailGrid>

            <AppModalSection title={`Spares (${(detail.spares ?? []).length})`}>
              {(detail.spares ?? []).length === 0 ? (
                <p className="text-sm text-stone-500">No spares in this package.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        <th className="py-2 pr-3 text-left">Part no.</th>
                        <th className="py-2 pr-3 text-left">Spare</th>
                        <th className="py-2 pr-3 text-right">Qty</th>
                        <th className="py-2 pr-3 text-right">Sale price</th>
                        <th className="py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.spares.map((s) => (
                        <tr key={s.spareId} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs text-slate-600">{s.sku || "—"}</td>
                          <td className="py-2 pr-3 text-slate-800">{s.name}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{s.qty}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatInr(s.salePriceInr)}</td>
                          <td className="py-2 text-right font-semibold tabular-nums">
                            {formatInr(s.salePriceInr * s.qty)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 text-slate-700">
                        <td colSpan={4} className="py-2 pr-3 text-right text-xs font-semibold uppercase tracking-wider">
                          Spares total
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums">
                          {formatInr(detail.spares.reduce((sum, s) => sum + s.salePriceInr * s.qty, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </AppModalSection>
          </div>
        </AppModal>
      ) : null}
    </div>
  );
}
