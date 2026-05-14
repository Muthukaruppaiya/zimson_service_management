import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import type { Supplier } from "../../types/supplier";

// ── Types ─────────────────────────────────────────────────────────────────────

type SupplierSpareMapRow = {
  id: string; supplierId: string; spareId: string; spareSku: string; spareName: string;
  leadTimeDays: number | null; minOrderQty: number | null; priorityRank: number;
  isActive: boolean; createdAt: string; updatedAt: string;
};

// ── Spare Search Picker ───────────────────────────────────────────────────────

function SparePicker({
  spares,
  excluded,
  onSelect,
}: {
  spares: Array<{ id: string; name: string; sku: string; category?: string }>;
  excluded: Set<string>;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return spares
      .filter((s) => !excluded.has(s.id))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.sku.toLowerCase().includes(q) ||
          (s.category ?? "").toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [query, spares, excluded]);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 30); }}
        className="flex cursor-pointer items-center justify-between border border-rlx-rule bg-white px-3 py-2 text-sm hover:border-rlx-green transition"
      >
        <span className="text-stone-400">Search spare by name, SKU or category…</span>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5 text-stone-400">
          <circle cx="6.5" cy="6.5" r="4.5" /><line x1="10" y1="10" x2="14" y2="14" />
        </svg>
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 border border-rlx-rule bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-rlx-rule px-3 py-2">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5 shrink-0 text-stone-400">
              <circle cx="6.5" cy="6.5" r="4.5" /><line x1="10" y1="10" x2="14" y2="14" />
            </svg>
            <input ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, SKU or category…"
              className="w-full bg-transparent text-sm text-stone-800 outline-none placeholder-stone-400" />
            {query && <button type="button" onClick={() => setQuery("")} className="text-stone-400 hover:text-stone-600 text-sm">✕</button>}
          </div>
          <ul className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-xs text-stone-400">No spares match "{query}"</li>
            ) : filtered.map((s) => (
              <li key={s.id} onMouseDown={() => { onSelect(s.id); setQuery(""); setOpen(false); }}
                className="flex cursor-pointer items-center justify-between border-b border-rlx-rule px-4 py-2.5 text-sm hover:bg-rlx-green/5 last:border-0">
                <div>
                  <span className="font-medium text-stone-800">{s.name}</span>
                  {s.category && <span className="ml-2 text-[10px] font-semibold uppercase text-stone-400">{s.category}</span>}
                </div>
                <span className="ml-4 font-mono text-[11px] text-stone-400">{s.sku}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Supplier Detail Modal (Details + Spare Mapping) ───────────────────────────

function SupplierModal({
  supplier,
  canEdit,
  spares,
  onClose,
  onToggleActive,
  onDelete,
  onEditNavigate,
  onSaved,
}: {
  supplier: Supplier;
  canEdit: boolean;
  spares: Array<{ id: string; name: string; sku: string; category?: string }>;
  onClose: () => void;
  onToggleActive: (s: Supplier) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEditNavigate: (id: string) => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"details" | "mapping">("details");
  const [mappingRows, setMappingRows] = useState<SupplierSpareMapRow[]>([]);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapOk, setMapOk] = useState<string | null>(null);
  const [mapErr, setMapErr] = useState<string | null>(null);

  const excludedSpareIds = useMemo(() => new Set(mappingRows.map((r) => r.spareId)), [mappingRows]);

  useEffect(() => {
    if (tab !== "mapping") return;
    void (async () => {
      setMapLoading(true);
      try {
        const data = await apiJson<{ rows: SupplierSpareMapRow[] }>(
          `/api/inventory/suppliers/${encodeURIComponent(supplier.id)}/spares`,
        );
        setMappingRows(data.rows);
      } catch { setMapErr("Could not load mappings."); }
      finally { setMapLoading(false); }
    })();
  }, [tab, supplier.id]);

  function addSpare(id: string) {
    const spare = spares.find((s) => s.id === id);
    if (!spare) return;
    setMappingRows((prev) => [
      ...prev,
      { id: `tmp-${id}`, supplierId: supplier.id, spareId: id, spareSku: spare.sku, spareName: spare.name,
        leadTimeDays: null, minOrderQty: null, priorityRank: 100, isActive: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]);
  }

  function updateRow(spareId: string, patch: Partial<SupplierSpareMapRow>) {
    setMappingRows((prev) => prev.map((r) => (r.spareId === spareId ? { ...r, ...patch } : r)));
  }

  async function saveMappings() {
    setMapBusy(true); setMapErr(null); setMapOk(null);
    try {
      await apiJson(`/api/inventory/suppliers/${encodeURIComponent(supplier.id)}/spares`, {
        method: "PUT",
        json: { rows: mappingRows.map((r) => ({ spareId: r.spareId, leadTimeDays: r.leadTimeDays, minOrderQty: r.minOrderQty, priorityRank: r.priorityRank, isActive: r.isActive })) },
      });
      setMapOk("Spare mapping saved successfully.");
      onSaved();
    } catch (e) { setMapErr(e instanceof ApiError ? e.message : "Save failed."); }
    finally { setMapBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-rlx-green px-6 py-4 shrink-0 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-white">{supplier.name}</h3>
            <p className="text-[11px] text-white/60 mt-0.5">
              Code: <span className="font-mono">{supplier.supplierCode}</span>
              {" · "}
              <span className={supplier.isActive ? "text-blue-300" : "text-red-300"}>
                {supplier.isActive ? "Active" : "Inactive"}
              </span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-rlx-rule">
          {(["details", "mapping"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition ${tab === t ? "border-b-2 border-rlx-green text-rlx-green" : "text-stone-400 hover:text-stone-600"}`}>
              {t === "details" ? "Details" : "Spare Mapping"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">

          {/* ── Details tab ─────────────────────────────────────────────────── */}
          {tab === "details" && (
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
                {[
                  { label: "Supplier Code", value: supplier.supplierCode },
                  { label: "Name", value: supplier.name },
                  { label: "Contact", value: supplier.contactName ?? "—" },
                  { label: "Phone", value: supplier.phone ?? "—" },
                  { label: "Email", value: supplier.email ?? "—" },
                  { label: "GST", value: supplier.gst ?? "—" },
                  { label: "Tax Person Type", value: supplier.taxPersonType ?? "—" },
                  { label: "Status", value: supplier.isActive ? "Active" : "Inactive" },
                ].map((f) => (
                  <div key={f.label} className="border border-rlx-rule bg-stone-50/40 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{f.label}</p>
                    <p className="mt-1 font-medium text-stone-800 break-all">{f.value}</p>
                  </div>
                ))}
              </div>

              {/* Locations */}
              {supplier.locations && supplier.locations.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">Locations</p>
                  <div className="space-y-2">
                    {supplier.locations.map((loc, i) => (
                      <div key={i} className="border border-rlx-rule px-4 py-3 text-sm text-stone-700">
                        <span className="mr-2 text-[10px] font-bold text-rlx-green">#{i + 1}</span>
                        {[loc.doorNo, loc.street, loc.place, loc.district, loc.state, loc.pinCode]
                          .filter(Boolean).join(", ")}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Spare Mapping tab ────────────────────────────────────────────── */}
          {tab === "mapping" && (
            <div className="p-5 space-y-4">
              {mapLoading && <p className="text-sm text-stone-400">Loading mappings…</p>}
              {mapErr && <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {mapErr}</div>}
              {mapOk && <div className="border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">✓ {mapOk}</div>}

              {/* Add spare */}
              {canEdit && (
                <div>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-stone-400">Add Spare to Supplier</p>
                  <SparePicker spares={spares} excluded={excludedSpareIds} onSelect={addSpare} />
                </div>
              )}

              {/* Mapping table */}
              {mappingRows.length === 0 && !mapLoading ? (
                <div className="border border-dashed border-rlx-rule py-8 text-center text-sm text-stone-400">
                  No spares mapped yet. Add spares above.
                </div>
              ) : (
                <div className="border border-rlx-rule overflow-x-auto">
                  <div className="border-b border-rlx-rule bg-stone-50 px-4 py-2.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                      Mapped Spares ({mappingRows.length})
                    </span>
                    {canEdit && (
                      <button type="button" onClick={() => void saveMappings()} disabled={mapBusy}
                        className="bg-rlx-green px-4 py-1.5 text-[11px] font-bold text-white hover:bg-rlx-green/90 transition disabled:opacity-50">
                        {mapBusy ? "Saving…" : "Save Mapping"}
                      </button>
                    )}
                  </div>
                  <table className="w-full min-w-[620px] text-sm">
                    <thead>
                      <tr className="border-b border-rlx-rule bg-stone-50/60 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                        <th className="px-4 py-2.5 text-left">Spare</th>
                        <th className="px-4 py-2.5 text-center w-28">Lead (days)</th>
                        <th className="px-4 py-2.5 text-center w-24">Min Qty</th>
                        <th className="px-4 py-2.5 text-center w-24">Priority</th>
                        <th className="px-4 py-2.5 text-center w-16">Active</th>
                        {canEdit && <th className="px-4 py-2.5 text-center w-20">Remove</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {mappingRows.map((r) => (
                        <tr key={r.spareId} className="border-b border-rlx-rule last:border-0 hover:bg-stone-50/40">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-stone-800">{r.spareName}</p>
                            <p className="font-mono text-[11px] text-stone-400">{r.spareSku}</p>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <input type="number" min={0}
                              className="w-20 border border-rlx-rule px-2 py-1 text-sm text-center outline-none focus:border-rlx-green disabled:bg-stone-50"
                              value={r.leadTimeDays ?? ""} disabled={!canEdit}
                              onChange={(e) => updateRow(r.spareId, { leadTimeDays: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <input type="number" min={0} step={0.001}
                              className="w-20 border border-rlx-rule px-2 py-1 text-sm text-center outline-none focus:border-rlx-green disabled:bg-stone-50"
                              value={r.minOrderQty ?? ""} disabled={!canEdit}
                              onChange={(e) => updateRow(r.spareId, { minOrderQty: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <input type="number" min={1}
                              className="w-16 border border-rlx-rule px-2 py-1 text-sm text-center outline-none focus:border-rlx-green disabled:bg-stone-50"
                              value={r.priorityRank} disabled={!canEdit}
                              onChange={(e) => updateRow(r.spareId, { priorityRank: Math.max(1, Number(e.target.value) || 1) })}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <input type="checkbox" checked={r.isActive} disabled={!canEdit}
                              className="h-4 w-4 accent-rlx-green"
                              onChange={(e) => updateRow(r.spareId, { isActive: e.target.checked })} />
                          </td>
                          {canEdit && (
                            <td className="px-4 py-2.5 text-center">
                              <button type="button"
                                onClick={() => setMappingRows((prev) => prev.filter((x) => x.spareId !== r.spareId))}
                                className="text-[11px] font-semibold text-red-500 hover:text-red-700 transition">
                                ✕ Remove
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-rlx-rule bg-rlx-bg px-6 py-4">
          <div className="flex gap-2">
            {canEdit && (
              <>
                <button type="button" onClick={() => onEditNavigate(supplier.id)}
                  className="bg-rlx-green px-5 py-2 text-sm font-semibold text-white hover:bg-rlx-green/90 transition">
                  Edit Details
                </button>
                <button type="button" onClick={() => void onToggleActive(supplier)}
                  className="border border-rlx-rule px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-50 transition">
                  {supplier.isActive ? "Deactivate" : "Activate"}
                </button>
                <button type="button" onClick={() => void onDelete(supplier.id)}
                  className="border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition">
                  Delete
                </button>
              </>
            )}
          </div>
          <button type="button" onClick={onClose} className="border border-rlx-rule px-5 py-2 text-sm text-stone-600 hover:bg-stone-50 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-block border px-2 py-0.5 text-[10px] font-bold tracking-wide ${active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-stone-300 bg-stone-50 text-stone-400"}`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function InventorySuppliersPage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const navigate = useNavigate();

  const canEdit =
    user?.role === "super_admin" || user?.role === "admin" ||
    user?.role === "ho_manager" || user?.role === "ho_purchase";

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ suppliers: Supplier[] }>("/api/inventory/suppliers");
      setSuppliers(data.suppliers);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load suppliers.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.supplierCode.toLowerCase().includes(q) ||
        (s.contactName ?? "").toLowerCase().includes(q) ||
        (s.phone ?? "").includes(q),
    );
  }, [suppliers, search]);

  async function toggleActive(s: Supplier) {
    setErr(null);
    try {
      await apiJson(`/api/inventory/suppliers/${encodeURIComponent(s.id)}`, {
        method: "PATCH", json: { isActive: !s.isActive },
      });
      setOk(`${s.name} ${s.isActive ? "deactivated" : "activated"}.`);
      await load();
      // refresh the selected supplier if it's the same one
      setSelectedSupplier((prev) => prev?.id === s.id ? { ...prev, isActive: !s.isActive } : prev);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not update."); }
  }

  async function deleteSupplier(id: string) {
    if (!confirm("Delete this supplier? This cannot be undone.")) return;
    setErr(null);
    try {
      await apiJson(`/api/inventory/suppliers/${encodeURIComponent(id)}`, { method: "DELETE" });
      setOk("Supplier deleted.");
      setSelectedSupplier(null);
      await load();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Delete failed."); }
  }

  return (
    <div>
      <InventoryBreadcrumb current="Supplier Master" />
      <PageHeader
        title="Supplier Master"
        description="Click any supplier row to view details and manage spare mappings."
        actions={
          <div className="flex gap-2">
            {canEdit && (
              <Link
                to="/inventory/suppliers/new"
                className="bg-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:bg-rlx-green/90 transition"
              >
                + Add Supplier
              </Link>
            )}
            <button type="button" onClick={() => navigate(-1)}
              className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition">
              ← Back
            </button>
          </div>
        }
      />

      {err && <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div>}
      {ok && <div className="mb-4 border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">✓ {ok}</div>}

      {/* Search + stats */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
            className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400">
            <circle cx="6.5" cy="6.5" r="4.5" /><line x1="10" y1="10" x2="14" y2="14" />
          </svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, code, contact or phone…"
            className="w-full border border-rlx-rule bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-rlx-green" />
        </div>
        <div className="flex gap-2 text-xs">
          <span className="border border-rlx-rule bg-white px-3 py-2 text-stone-500">
            Total: <strong>{suppliers.length}</strong>
          </span>
          <span className="border border-blue-200 bg-blue-50 px-3 py-2 text-blue-700">
            Active: <strong>{suppliers.filter((s) => s.isActive).length}</strong>
          </span>
        </div>
        <button type="button" onClick={() => void load()}
          className="border border-rlx-rule px-3 py-2 text-xs text-stone-400 hover:bg-stone-50 transition" title="Refresh">↻</button>
      </div>

      {/* Table */}
      <div className="border border-rlx-rule bg-white shadow-sm">
        <div className="border-b border-rlx-rule bg-rlx-green px-5 py-3.5 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">All Suppliers</h3>
          <span className="border border-white/30 px-2 py-0.5 text-[10px] font-bold text-white/70">{filtered.length}</span>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">
            {search ? `No suppliers match "${search}"` : "No suppliers yet. Add your first supplier."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  <th className="px-5 py-3 text-left">Code</th>
                  <th className="px-5 py-3 text-left">Supplier Name</th>
                  <th className="px-5 py-3 text-left">Contact</th>
                  <th className="px-5 py-3 text-left">Phone</th>
                  <th className="px-5 py-3 text-left">GST</th>
                  <th className="px-5 py-3 text-center">Mapped Spares</th>
                  <th className="px-5 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}
                    onClick={() => setSelectedSupplier(s)}
                    className="border-b border-rlx-rule last:border-0 hover:bg-rlx-green/5 cursor-pointer transition group">
                    <td className="px-5 py-3 font-mono text-xs font-bold text-rlx-green">{s.supplierCode}</td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-stone-800 group-hover:text-rlx-green transition">{s.name}</p>
                      {s.email && <p className="text-[11px] text-stone-400">{s.email}</p>}
                    </td>
                    <td className="px-5 py-3 text-stone-600">{s.contactName ?? "—"}</td>
                    <td className="px-5 py-3 text-stone-600">{s.phone ?? "—"}</td>
                    <td className="px-5 py-3 font-mono text-xs text-stone-500">{s.gst ?? "—"}</td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-block border border-rlx-rule px-2 py-0.5 text-[10px] font-bold text-stone-500">
                        View →
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <ActiveBadge active={s.isActive} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Supplier Detail Modal */}
      {selectedSupplier && (
        <SupplierModal
          supplier={selectedSupplier}
          canEdit={canEdit}
          spares={spares}
          onClose={() => setSelectedSupplier(null)}
          onToggleActive={toggleActive}
          onDelete={deleteSupplier}
          onEditNavigate={(id) => navigate(`/inventory/suppliers/${id}/edit`)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
