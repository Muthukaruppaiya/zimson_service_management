import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useBrands } from "../../context/BrandsContext";
import { isValidGstFormat } from "../../data/serviceSeed";
import { ApiError, apiJson } from "../../lib/api";
import { companyNameFromGstLookup, lookupCompanyByGstin } from "../../lib/gstLookupClient";
import type { BrandRow } from "../../types/brand";
import type { BrandEwayConsignee } from "../../types/brandEwayConsignee";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

const labelClass = "block text-xs font-semibold uppercase tracking-wide text-stone-600";

const emptyForm = {
  brandId: "",
  locationName: "",
  legalName: "",
  gstin: "",
  address: "",
  city: "",
  pincode: "",
  sortOrder: "0",
};

export function BrandEwayConsigneesSettingsPage() {
  const { user } = useAuth();
  const { brands, refreshBrands } = useBrands();
  const canManage = user?.role === "super_admin" || user?.role === "admin";
  const [rows, setRows] = useState<BrandEwayConsignee[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [gstFetchBusy, setGstFetchBusy] = useState(false);
  const lastLookupGstin = useRef("");

  const activeBrands = useMemo(
    () => [...brands].filter((b) => b.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [brands],
  );

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await apiJson<{ rows: BrandEwayConsignee[] }>("/api/edoc/brand-eway-consignees?all=1");
      setRows(data.rows);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load brand e-way consignees.");
    }
  }, []);

  useEffect(() => {
    void refreshBrands();
    void load();
  }, [load, refreshBrands]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    lastLookupGstin.current = "";
  }

  const fetchGstDetails = useCallback(async (gstinRaw: string, opts?: { force?: boolean }) => {
    const gstin = gstinRaw.trim().toUpperCase();
    if (!isValidGstFormat(gstin)) {
      setErr("Enter a valid 15-character GSTIN before lookup.");
      return;
    }
    if (!opts?.force && lastLookupGstin.current === gstin) return;

    setGstFetchBusy(true);
    setErr(null);
    try {
      const out = await lookupCompanyByGstin(gstin);
      const name = companyNameFromGstLookup(out);
      const pin = String(out.pincode ?? "")
        .replace(/\D/g, "")
        .slice(0, 6);
      const city = (out.city ?? out.state ?? "").trim();

      setForm((f) => ({
        ...f,
        gstin,
        legalName: f.legalName.trim() || name || f.legalName,
        address: f.address.trim() || out.address?.trim() || f.address,
        city: f.city.trim() || city || f.city,
        pincode: f.pincode.trim() || pin || f.pincode,
        locationName: f.locationName.trim() || city || name || f.locationName,
      }));
      lastLookupGstin.current = gstin;
      if (opts?.force) setOk("GST details fetched — review and save.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not fetch GST details.");
    } finally {
      setGstFetchBusy(false);
    }
  }, []);

  useEffect(() => {
    const gstin = form.gstin.trim().toUpperCase();
    if (!isValidGstFormat(gstin)) {
      if (gstin.length < 15) lastLookupGstin.current = "";
      return;
    }
    void fetchGstDetails(gstin);
  }, [form.gstin, fetchGstDetails]);

  function startEdit(row: BrandEwayConsignee) {
    setEditingId(row.id);
    setForm({
      brandId: row.brandId,
      locationName: row.locationName,
      legalName: row.legalName,
      gstin: row.gstin,
      address: row.address,
      city: row.city,
      pincode: row.pincode,
      sortOrder: String(row.sortOrder),
    });
    lastLookupGstin.current = row.gstin.trim().toUpperCase();
    setErr(null);
    setOk(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      const payload = {
        brandId: form.brandId,
        locationName: form.locationName.trim(),
        legalName: form.legalName.trim(),
        gstin: form.gstin.trim().toUpperCase(),
        address: form.address.trim(),
        city: form.city.trim(),
        pincode: form.pincode.trim(),
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (editingId) {
        await apiJson(`/api/edoc/brand-eway-consignees/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          json: payload,
        });
        setOk("Brand location updated.");
      } else {
        await apiJson("/api/edoc/brand-eway-consignees", {
          method: "POST",
          json: payload,
        });
        setOk("Brand location added.");
      }
      resetForm();
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not save brand location.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: BrandEwayConsignee) {
    if (!canManage) return;
    setBusyId(row.id);
    setErr(null);
    setOk(null);
    try {
      await apiJson(`/api/edoc/brand-eway-consignees/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        json: { isActive: !row.isActive },
      });
      setOk(row.isActive ? "Location deactivated." : "Location reactivated.");
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not update location.");
    } finally {
      setBusyId(null);
    }
  }

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Brand e-way consignees" description="" />
        <p className="text-sm text-stone-600">Only HO admins can manage brand e-way consignee master.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Brand e-way consignees"
        description="Register brand service centre locations used as e-way consignees when sending watches to brand. Logistics staff pick brand + location from a dropdown — details auto-fill."
        actions={
          <Link
            to="/settings/edoc"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            E-invoice & e-way
          </Link>
        }
      />

      {err ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{err}</p> : null}
      {ok ? <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">{ok}</p> : null}

      <Card title={editingId ? "Edit brand location" : "Add brand location"}>
        <form onSubmit={(e) => void save(e)} className="grid gap-3 md:grid-cols-2">
          <label className={labelClass}>
            Brand
            <select
              className={inputClass}
              value={form.brandId}
              onChange={(e) => setForm((f) => ({ ...f, brandId: e.target.value }))}
              required
            >
              <option value="">Select brand…</option>
              {activeBrands.map((b: BrandRow) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Location name
            <input
              className={inputClass}
              value={form.locationName}
              onChange={(e) => setForm((f) => ({ ...f, locationName: e.target.value }))}
              placeholder="e.g. Mumbai ASC, Brand HO Chennai"
              required
            />
          </label>
          <label className={`${labelClass} md:col-span-2`}>
            Legal name (consignee)
            <input
              className={inputClass}
              value={form.legalName}
              onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
              required
            />
          </label>
          <label className={labelClass}>
            GSTIN
            <div className="mt-1 flex flex-wrap items-end gap-2">
              <input
                className={`${inputClass} mt-0 min-w-[200px] flex-1`}
                value={form.gstin}
                onChange={(e) => {
                  const gstin = e.target.value.toUpperCase().slice(0, 15);
                  if (gstin !== lastLookupGstin.current) lastLookupGstin.current = "";
                  setForm((f) => ({ ...f, gstin }));
                }}
                placeholder="15-character GSTIN"
                maxLength={15}
                required
                disabled={gstFetchBusy || busy}
              />
              <button
                type="button"
                onClick={() => void fetchGstDetails(form.gstin, { force: true })}
                disabled={gstFetchBusy || busy || !isValidGstFormat(form.gstin)}
                className="rounded-xl border border-zimson-500 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm hover:bg-zimson-50 disabled:opacity-60"
              >
                {gstFetchBusy ? "Fetching…" : "Fetch from GST"}
              </button>
            </div>
            <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-stone-500">
              Enter a valid GSTIN to auto-fill legal name, address, city, and pincode from the GST registry.
            </span>
          </label>
          <label className={labelClass}>
            Pincode
            <input
              className={inputClass}
              value={form.pincode}
              onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
              maxLength={6}
              required
            />
          </label>
          <label className={`${labelClass} md:col-span-2`}>
            Address
            <input
              className={inputClass}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              required
            />
          </label>
          <label className={labelClass}>
            City / place
            <input
              className={inputClass}
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              required
            />
          </label>
          <label className={labelClass}>
            Display order
            <input
              className={inputClass}
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            />
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-rlx-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-rlx-green-deep disabled:opacity-50"
            >
              {busy ? "Saving…" : editingId ? "Update location" : "Add location"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-rlx-gold bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green"
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </Card>

      <Card title={`Registered locations (${rows.length})`} className="mt-4">
        {rows.length === 0 ? (
          <p className="text-sm text-stone-600">No brand locations yet. Add at least one before creating send-to-brand e-way bills.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-3 py-2">Brand</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Legal name</th>
                  <th className="px-3 py-2">GSTIN</th>
                  <th className="px-3 py-2">City</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-zimson-100 last:border-0">
                    <td className="px-3 py-2 font-semibold text-zimson-900">{row.brandName}</td>
                    <td className="px-3 py-2">{row.locationName}</td>
                    <td className="px-3 py-2">{row.legalName}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.gstin}</td>
                    <td className="px-3 py-2 text-xs text-stone-600">
                      {row.city} · {row.pincode}
                    </td>
                    <td className="px-3 py-2">
                      {row.isActive ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">Active</span>
                      ) : (
                        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-semibold text-stone-700">Inactive</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="rounded-lg border border-zimson-300 px-2.5 py-1 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void toggleActive(row)}
                          className="rounded-lg border border-zimson-300 px-2.5 py-1 text-xs font-semibold text-zimson-900 hover:bg-zimson-50 disabled:opacity-50"
                        >
                          {row.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
