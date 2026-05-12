import { useEffect, useMemo, useState } from "react";
import { ServiceBreadcrumb } from "../../../components/service/ServiceBreadcrumb";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { isValidGstFormat, isValidPanFormat } from "../../../data/serviceSeed";
import { apiJson } from "../../../lib/api";
import type { CustomerKind, CustomerRecord } from "../../../types/customer";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

type EditableCustomer = {
  id: string;
  displayName: string;
  phone: string;
  alternatePhone: string;
  email: string;
  address: string;
  city: string;
  customerKind: CustomerKind;
  company: string;
  gst: string;
  pan: string;
};

function toEditable(c: CustomerRecord): EditableCustomer {
  return {
    id: c.id,
    displayName: c.displayName,
    phone: c.phone,
    alternatePhone: c.alternatePhone ?? "",
    email: c.email ?? "",
    address: c.address ?? "",
    city: c.city ?? "",
    customerKind: c.customerKind,
    company: c.company ?? "",
    gst: c.gst ?? "",
    pan: c.pan ?? "",
  };
}

export function CustomerMasterPage() {
  const [rows, setRows] = useState<CustomerRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<EditableCustomer | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ customers: CustomerRecord[] }>("/api/customers");
      setRows(data.customers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load customers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) =>
      [c.displayName, c.phone, c.alternatePhone ?? "", c.email, c.city ?? "", c.company ?? "", c.customerCode ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  async function saveEdit() {
    if (!edit) return;
    setError(null);
    if (!edit.displayName.trim() || !edit.phone.trim()) {
      setError("Name and primary mobile are required.");
      return;
    }
    if (!edit.email.trim() || !edit.email.includes("@")) {
      setError("Valid email is required.");
      return;
    }
    if (!edit.address.trim() || !edit.city.trim()) {
      setError("Address and city are required.");
      return;
    }
    if (edit.customerKind === "B2B") {
      if (!edit.company.trim()) {
        setError("Company is required for B2B.");
        return;
      }
      if (!isValidGstFormat(edit.gst)) {
        setError("Enter valid GSTIN for B2B.");
        return;
      }
      if (!isValidPanFormat(edit.pan)) {
        setError("Enter valid PAN for B2B.");
        return;
      }
    }
    setSaving(true);
    try {
      const data = await apiJson<{ customer: CustomerRecord }>(`/api/customers/${encodeURIComponent(edit.id)}`, {
        method: "PUT",
        json: {
          displayName: edit.displayName,
          phone: edit.phone,
          alternatePhone: edit.alternatePhone,
          email: edit.email,
          address: edit.address,
          city: edit.city,
          customerKind: edit.customerKind,
          company: edit.customerKind === "B2B" ? edit.company : "",
          gst: edit.customerKind === "B2B" ? edit.gst : "",
          pan: edit.customerKind === "B2B" ? edit.pan : "",
        },
      });
      setRows((prev) => prev.map((r) => (r.id === data.customer.id ? data.customer : r)));
      setEdit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update customer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <ServiceBreadcrumb current="Customer master" />
      <PageHeader
        title="Customer master"
        description="View and edit customer records only."
      />
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <Card title="Customers">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[260px] flex-1 text-sm">
            Search
            <input
              className={inputClass}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Name, phone, email, city, company"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900"
          >
            Refresh
          </button>
        </div>
        {loading ? <p className="text-sm text-stone-600">Loading customers...</p> : null}
        {!loading ? (
          <>
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zimson-50/70 text-stone-700">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Code</th>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Primary mobile</th>
                    <th className="px-3 py-2 font-semibold">Alternate mobile</th>
                    <th className="px-3 py-2 font-semibold">Email</th>
                    <th className="px-3 py-2 font-semibold">City</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Verified</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((c) => {
                    const fullyVerified = !!(c.phoneVerifiedAt && c.emailVerifiedAt);
                    return (
                    <tr key={c.id} className="border-t border-zimson-100">
                      <td className="px-3 py-2 font-mono text-xs text-stone-700">{c.customerCode || "—"}</td>
                      <td className="px-3 py-2">{c.displayName}</td>
                      <td className="px-3 py-2">{c.phone}</td>
                      <td className="px-3 py-2">{c.alternatePhone || "-"}</td>
                      <td className="px-3 py-2">{c.email || "-"}</td>
                      <td className="px-3 py-2">{c.city || "-"}</td>
                      <td className="px-3 py-2">{c.customerKind}</td>
                      <td className="px-3 py-2">
                        {fullyVerified ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            Verified
                          </span>
                        ) : c.customerDataSource === "migrated" ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                            Pending verify
                          </span>
                        ) : (
                          <span className="text-xs text-stone-500">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setEdit(toEditable(c))}
                          className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                  {filtered.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-sm text-stone-500" colSpan={9}>
                        No customers found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-stone-600">Showing page {currentPage} of {totalPages}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </Card>

      {edit ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Edit customer</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Customer name<input className={inputClass} value={edit.displayName} onChange={(e) => setEdit((p) => (p ? { ...p, displayName: e.target.value } : p))} /></label>
              <label className="text-sm">Primary mobile<input className={inputClass} value={edit.phone} onChange={(e) => setEdit((p) => (p ? { ...p, phone: e.target.value } : p))} /></label>
              <label className="text-sm">Email<input className={inputClass} type="email" value={edit.email} onChange={(e) => setEdit((p) => (p ? { ...p, email: e.target.value } : p))} /></label>
              <label className="text-sm">Alternate mobile<input className={inputClass} value={edit.alternatePhone} onChange={(e) => setEdit((p) => (p ? { ...p, alternatePhone: e.target.value } : p))} /></label>
              <label className="text-sm">Address<input className={inputClass} value={edit.address} onChange={(e) => setEdit((p) => (p ? { ...p, address: e.target.value } : p))} /></label>
              <label className="text-sm">City<input className={inputClass} value={edit.city} onChange={(e) => setEdit((p) => (p ? { ...p, city: e.target.value } : p))} /></label>
              <label className="text-sm">
                Customer type
                <select className={inputClass} value={edit.customerKind} onChange={(e) => setEdit((p) => (p ? { ...p, customerKind: e.target.value as CustomerKind } : p))}>
                  <option value="B2C">B2C</option>
                  <option value="B2B">B2B</option>
                </select>
              </label>
            </div>
            {edit.customerKind === "B2B" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm sm:col-span-2">Company<input className={inputClass} value={edit.company} onChange={(e) => setEdit((p) => (p ? { ...p, company: e.target.value } : p))} /></label>
                <label className="text-sm">GSTIN<input className={inputClass} value={edit.gst} onChange={(e) => setEdit((p) => (p ? { ...p, gst: e.target.value.toUpperCase() } : p))} /></label>
                <label className="text-sm">PAN<input className={inputClass} value={edit.pan} onChange={(e) => setEdit((p) => (p ? { ...p, pan: e.target.value.toUpperCase() } : p))} /></label>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEdit(null)}
                className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={saving}
                className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
