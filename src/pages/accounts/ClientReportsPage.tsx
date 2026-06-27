import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { FilterField } from "../../components/ui/FilterField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { triggerBlobDownload } from "../../lib/captureInvoicePdf";

type ReportId = "revenue" | "summary-sale" | "hsn-purchase" | "sr-returned";

const REPORTS: Array<{ id: ReportId; title: string; description: string; filenamePrefix: string }> = [
  {
    id: "revenue",
    title: "Revenue report",
    description: "SRF store billing and inter-HO repair on sheet 1; quick bills on sheet 2 — same columns as legacy revenue export.",
    filenamePrefix: "revenue_report",
  },
  {
    id: "summary-sale",
    title: "Summary sale report",
    description: "One row per invoice with totals, tax, and payment mode (cash / card / UPI).",
    filenamePrefix: "summary_sale_report",
  },
  {
    id: "hsn-purchase",
    title: "HSN purchase report",
    description: "GRN inward lines with vendor, HSN code, quantity, cost, and tax values.",
    filenamePrefix: "hsn_purchase_report",
  },
  {
    id: "sr-returned",
    title: "SR returned report",
    description: "SRFs returned without billing or inter-HO no-repair returns.",
    filenamePrefix: "sr_returned_report",
  },
];

function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 365);
  return d.toISOString().slice(0, 10);
}

export function ClientReportsPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [regionId, setRegionId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [busy, setBusy] = useState<ReportId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stores = useMemo(() => {
    if (!regionId) return regions.flatMap((r) => r.stores.map((s) => ({ ...s, regionName: r.name })));
    const reg = regions.find((r) => r.id === regionId);
    return (reg?.stores ?? []).map((s) => ({ ...s, regionName: reg?.name ?? "" }));
  }, [regions, regionId]);

  async function downloadReport(id: ReportId) {
    setBusy(id);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to });
      if (regionId) qs.set("regionId", regionId);
      if (storeId) qs.set("storeId", storeId);
      const report = REPORTS.find((r) => r.id === id)!;
      const res = await fetch(`/api/accounts/reports/${id}?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Download failed (${res.status})`);
      }
      const blob = new Blob([await res.arrayBuffer()], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      triggerBlobDownload(blob, `${report.filenamePrefix}_${Date.now()}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download report.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Client reports"
        description="Download Excel reports matching the legacy Zimson formats — revenue, summary sales, HSN purchase, and SR returns."
        actions={
          <Link
            to="/accounts/invoice-history"
            className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
          >
            Invoice history
          </Link>
        }
      />

      <Card title="Filters" className="mb-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="From date">
            <input type="date" className="w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FilterField>
          <FilterField label="To date">
            <input type="date" className="w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </FilterField>
          <FilterField label="Region">
            <select
              className="w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm"
              value={regionId}
              onChange={(e) => {
                setRegionId(e.target.value);
                setStoreId("");
              }}
            >
              <option value="">All regions</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Store">
            <select
              className="w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
            >
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.regionName ? `${s.regionName} · ` : ""}
                  {s.name}
                </option>
              ))}
            </select>
          </FilterField>
        </div>
        {user?.role === "store_accounts" && user.storeId ? (
          <p className="mt-3 text-xs text-stone-500">Store-scoped access: only your store data is included.</p>
        ) : null}
      </Card>

      {error ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((report) => (
          <Card key={report.id} title={report.title}>
            <p className="text-sm text-stone-600">{report.description}</p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void downloadReport(report.id)}
              className="mt-4 rounded-xl bg-zimson-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zimson-900 disabled:cursor-wait disabled:opacity-60"
            >
              {busy === report.id ? "Generating…" : "Download Excel"}
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
