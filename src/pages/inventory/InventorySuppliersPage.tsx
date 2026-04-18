import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import type { Supplier } from "../../types/supplier";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2";

const emptyForm = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  gst: "",
};

type SupplierSpareMapRow = {
  id: string;
  supplierId: string;
  spareId: string;
  spareSku: string;
  spareName: string;
  leadTimeDays: number | null;
  minOrderQty: number | null;
  priorityRank: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function InventorySuppliersPage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const canEdit = user?.role === "super_admin" || user?.role === "regional_admin";
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [mapSupplierId, setMapSupplierId] = useState("");
  const [mappingRows, setMappingRows] = useState<SupplierSpareMapRow[]>([]);
  const [mapBusy, setMapBusy] = useState(false);
  const [newSpareId, setNewSpareId] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiJson<{ suppliers: Supplier[] }>("/api/inventory/suppliers");
      setSuppliers(data.suppliers);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load suppliers.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function selectForEdit(s: Supplier) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      contactName: s.contactName ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      address: s.address ?? "",
      gst: s.gst ?? "",
    });
    setErr(null);
    setOk(null);
  }

  function clearForm() {
    setEditingId(null);
    setForm(emptyForm);
    setErr(null);
  }

  async function saveSupplier(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (!form.name.trim()) {
      setErr("Name is required.");
      return;
    }
    try {
      if (editingId) {
        await apiJson(`/api/inventory/suppliers/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          json: {
            name: form.name.trim(),
            contactName: form.contactName.trim() || null,
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            address: form.address.trim() || null,
            gst: form.gst.trim().toUpperCase() || null,
          },
        });
        setOk("Supplier updated.");
      } else {
        await apiJson("/api/inventory/suppliers", {
          method: "POST",
          json: {
            name: form.name.trim(),
            contactName: form.contactName.trim() || null,
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            address: form.address.trim() || null,
            gst: form.gst.trim().toUpperCase() || null,
          },
        });
        setOk("Supplier created.");
      }
      clearForm();
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Save failed.");
    }
  }

  async function toggleActive(s: Supplier) {
    setErr(null);
    try {
      await apiJson(`/api/inventory/suppliers/${encodeURIComponent(s.id)}`, {
        method: "PATCH",
        json: { isActive: !s.isActive },
      });
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not update.");
    }
  }

  async function removeSupplier(id: string) {
    if (!confirm("Delete this supplier? POs that reference them may block delete.")) return;
    setErr(null);
    try {
      await apiJson(`/api/inventory/suppliers/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (editingId === id) clearForm();
      await load();
      setOk("Supplier deleted.");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Delete failed.");
    }
  }

  async function loadMappings(supplierId: string) {
    setMapSupplierId(supplierId);
    setMappingRows([]);
    if (!supplierId) return;
    try {
      const data = await apiJson<{ rows: SupplierSpareMapRow[] }>(`/api/inventory/suppliers/${encodeURIComponent(supplierId)}/spares`);
      setMappingRows(data.rows);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load supplier part mapping.");
    }
  }

  function addMappingSpare() {
    if (!newSpareId || mappingRows.some((r) => r.spareId === newSpareId)) return;
    const spare = spares.find((s) => s.id === newSpareId);
    if (!spare) return;
    setMappingRows((prev) => [
      ...prev,
      {
        id: `tmp-${newSpareId}`,
        supplierId: mapSupplierId,
        spareId: spare.id,
        spareSku: spare.sku,
        spareName: spare.name,
        leadTimeDays: null,
        minOrderQty: null,
        priorityRank: 100,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    setNewSpareId("");
  }

  function updateMapRow(spareId: string, patch: Partial<SupplierSpareMapRow>) {
    setMappingRows((prev) => prev.map((r) => (r.spareId === spareId ? { ...r, ...patch } : r)));
  }

  async function saveMappings() {
    if (!mapSupplierId) return;
    setMapBusy(true);
    setErr(null);
    try {
      await apiJson(`/api/inventory/suppliers/${encodeURIComponent(mapSupplierId)}/spares`, {
        method: "PUT",
        json: {
          rows: mappingRows.map((r) => ({
            spareId: r.spareId,
            leadTimeDays: r.leadTimeDays,
            minOrderQty: r.minOrderQty,
            priorityRank: r.priorityRank,
            isActive: r.isActive,
          })),
        },
      });
      setOk("Supplier-part mapping saved.");
      await loadMappings(mapSupplierId);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not save mappings.");
    } finally {
      setMapBusy(false);
    }
  }

  return (
    <div>
      <InventoryBreadcrumb current="Suppliers" />
      <PageHeader
        title="Suppliers"
        description="Vendor master for purchase orders. Inactive suppliers are hidden from new PO selection."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/inventory/purchase-orders"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Purchase orders
            </Link>
            <Link
              to="/inventory"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Inventory home
            </Link>
          </div>
        }
      />

      {err ? <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      {ok ? <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p> : null}

      {canEdit ? (
        <Card title={editingId ? "Edit supplier" : "Add supplier"} subtitle="Used when creating POs" className="mb-8">
          <form onSubmit={saveSupplier} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Name *</label>
              <input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Contact name</label>
              <input
                className={inputClass}
                value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Phone</label>
              <input className={inputClass} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Email</label>
              <input className={inputClass} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">GST</label>
              <input className={inputClass} value={form.gst} onChange={(e) => setForm((f) => ({ ...f, gst: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Address</label>
              <textarea
                className={inputClass}
                rows={2}
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="submit" className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white">
                {editingId ? "Save changes" : "Create supplier"}
              </button>
              {editingId ? (
                <button type="button" onClick={clearForm} className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm">
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </Card>
      ) : (
        <Card title="Read-only" className="mb-8">
          <p className="text-sm text-stone-600">Supplier maintenance is available to regional and super admins.</p>
        </Card>
      )}

      <Card title="All suppliers" subtitle={`${suppliers.length} record(s)`}>
        <div className="max-h-[560px] overflow-auto rounded-xl border border-zimson-200/80">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Active</th>
                {canEdit ? <th className="px-3 py-2">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-zimson-100">
                  <td className="px-3 py-2 font-medium text-stone-900">{s.name}</td>
                  <td className="px-3 py-2 text-stone-700">{s.contactName ?? "—"}</td>
                  <td className="px-3 py-2 text-stone-600">{s.phone ?? "—"}</td>
                  <td className="px-3 py-2">{s.isActive ? "Yes" : "No"}</td>
                  {canEdit ? (
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="text-xs font-semibold text-zimson-800 underline" onClick={() => selectForEdit(s)}>
                          Edit
                        </button>
                        <button type="button" className="text-xs font-semibold text-stone-600 underline" onClick={() => void toggleActive(s)}>
                          {s.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button type="button" className="text-xs font-semibold text-red-700 underline" onClick={() => void removeSupplier(s.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Mapped parts by supplier"
        subtitle="Define which spare parts each supplier can deliver"
        className="mt-8"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-stone-600">Supplier</label>
            <select className={inputClass} value={mapSupplierId} onChange={(e) => void loadMappings(e.target.value)}>
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {mapSupplierId ? (
            <>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-stone-600">Add spare</label>
                <div className="flex gap-2">
                  <select className={inputClass} value={newSpareId} onChange={(e) => setNewSpareId(e.target.value)}>
                    <option value="">Select spare</option>
                    {spares
                      .filter((s) => !mappingRows.some((r) => r.spareId === s.id))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.sku} - {s.name}
                        </option>
                      ))}
                  </select>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={addMappingSpare}
                      className="shrink-0 rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      Add
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {mapSupplierId ? (
          <div className="mt-4 space-y-3">
            <div className="max-h-[420px] overflow-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                  <tr>
                    <th className="px-3 py-2">Spare</th>
                    <th className="px-3 py-2">Lead time (days)</th>
                    <th className="px-3 py-2">Min qty</th>
                    <th className="px-3 py-2">Priority</th>
                    <th className="px-3 py-2">Active</th>
                    {canEdit ? <th className="px-3 py-2">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {mappingRows.map((r) => (
                    <tr key={r.spareId} className="border-b border-zimson-100">
                      <td className="px-3 py-2">
                        <div className="font-medium text-stone-900">{r.spareName}</div>
                        <div className="font-mono text-xs text-stone-500">{r.spareSku}</div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          className="w-24 rounded border px-2 py-1"
                          value={r.leadTimeDays ?? ""}
                          onChange={(e) =>
                            updateMapRow(r.spareId, {
                              leadTimeDays: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                            })
                          }
                          disabled={!canEdit}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.001}
                          className="w-24 rounded border px-2 py-1"
                          value={r.minOrderQty ?? ""}
                          onChange={(e) =>
                            updateMapRow(r.spareId, {
                              minOrderQty: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                            })
                          }
                          disabled={!canEdit}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          className="w-20 rounded border px-2 py-1"
                          value={r.priorityRank}
                          onChange={(e) => updateMapRow(r.spareId, { priorityRank: Math.max(1, Number(e.target.value) || 1) })}
                          disabled={!canEdit}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={r.isActive}
                          onChange={(e) => updateMapRow(r.spareId, { isActive: e.target.checked })}
                          disabled={!canEdit}
                        />
                      </td>
                      {canEdit ? (
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-xs font-semibold text-red-700 underline"
                            onClick={() => setMappingRows((prev) => prev.filter((x) => x.spareId !== r.spareId))}
                          >
                            Remove
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEdit ? (
              <button
                type="button"
                onClick={() => void saveMappings()}
                disabled={mapBusy}
                className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save mapping
              </button>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-stone-600">Select a supplier to manage part mapping.</p>
        )}
      </Card>
    </div>
  );
}
