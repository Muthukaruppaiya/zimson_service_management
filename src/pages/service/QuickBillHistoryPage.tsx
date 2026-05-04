import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { APP_PAYMENT_MODES } from "../../lib/paymentModes";
import type { AppPaymentMode } from "../../lib/paymentModes";
import type { QuickBillHistoryRow } from "../../types/quickBill";

function customerLabel(row: QuickBillHistoryRow): string {
  if (row.customerType === "B2B") return row.company?.trim() || "—";
  return row.customerName?.trim() || "Walk-in / B2C";
}

export function QuickBillHistoryPage() {
  const apiMode = useApiMode();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<QuickBillHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [payment, setPayment] = useState<"ALL" | AppPaymentMode>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<QuickBillHistoryRow | null>(null);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setQuery(q);
  }, [searchParams]);

  const load = useCallback(async () => {
    if (!apiMode || !user) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ bills: QuickBillHistoryRow[] }>("/api/service/quick-bills?limit=200");
      setRows(data.bills);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load quick bill history.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [apiMode, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    return rows.filter((r) => {
      if (payment !== "ALL" && r.paymentMode !== payment) return false;
      const ts = new Date(r.createdAt).getTime();
      if (from != null && ts < from) return false;
      if (to != null && ts > to) return false;
      if (!q) return true;
      return (
        r.billNumber.toLowerCase().includes(q) ||
        customerLabel(r).toLowerCase().includes(q) ||
        r.watchBrand.toLowerCase().includes(q) ||
        (r.storeName ?? r.regionName ?? r.regionId).toLowerCase().includes(q)
      );
    });
  }, [rows, query, payment, fromDate, toDate]);

  return (
    <div>
      <ServiceBreadcrumb current="Quick bill history" />
      <PageHeader
        title="Quick bill history"
        description="Separate register page with filters and detailed popup."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/service/quick-bill"
              className="inline-flex rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              New quick bill
            </Link>
            <Link
              to="/service"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Service home
            </Link>
          </div>
        }
      />

      <Card title={`History list (${filtered.length})`} subtitle="Invoice register">
        {error ? <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        <div className="mb-3 grid gap-2 md:grid-cols-5">
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm" placeholder="Search invoice/customer/brand/location" />
          <select
            value={payment}
            onChange={(e) => setPayment(e.target.value as "ALL" | AppPaymentMode)}
            className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
          >
            <option value="ALL">All payment modes</option>
            {APP_PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm" />
          <button type="button" onClick={() => { setQuery(""); setPayment("ALL"); setFromDate(""); setToDate(""); }} className="rounded-xl border border-zimson-300 px-3 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50">
            Reset
          </button>
        </div>
        {loading ? <p className="text-sm text-stone-600">Loading...</p> : null}
        {!loading && filtered.length === 0 ? <p className="text-sm text-stone-600">No history rows found.</p> : null}
        {filtered.length > 0 ? (
          <div className="max-h-[70vh] overflow-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Brand</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Payment</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r)} className="cursor-pointer border-b border-zimson-100 hover:bg-zimson-50/60">
                    <td className="px-3 py-2 text-xs text-stone-600">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{r.billNumber}</td>
                    <td className="px-3 py-2">{customerLabel(r)}</td>
                    <td className="px-3 py-2">{r.watchBrand}</td>
                    <td className="px-3 py-2 text-xs text-stone-600">{r.storeName ?? r.regionName ?? r.regionId}</td>
                    <td className="px-3 py-2">{r.paymentMode}</td>
                    <td className="px-3 py-2 text-right font-semibold text-stone-900">{r.totalInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Invoice details — {selected.billNumber}</h3>
                <p className="text-sm text-stone-600">{new Date(selected.createdAt).toLocaleString()}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg border px-3 py-1.5 text-sm">
                Close
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <tbody>
                  <tr className="border-b border-zimson-100"><th className="w-56 bg-zimson-50/70 px-3 py-2">Customer</th><td className="px-3 py-2">{customerLabel(selected)}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">Brand</th><td className="px-3 py-2">{selected.watchBrand}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">Location</th><td className="px-3 py-2">{selected.storeName ?? selected.regionName ?? selected.regionId}</td></tr>
                  <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">Payment</th><td className="px-3 py-2">{selected.paymentMode}</td></tr>
                  <tr><th className="bg-zimson-50/70 px-3 py-2">Total</th><td className="px-3 py-2 font-semibold text-zimson-900">{selected.totalInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

