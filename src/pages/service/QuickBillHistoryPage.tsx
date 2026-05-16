import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { mapQuickBillInvoiceToViewModel } from "../../components/service/mapQuickBillToServiceInvoice";
import { ServiceInvoiceTemplate } from "../../components/service/ServiceInvoiceTemplate";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { downloadQuickBillInvoiceHtml } from "../../lib/quickBillInvoiceDownload";
import { printServiceInvoice } from "../../lib/printServiceInvoice";
import { APP_PAYMENT_MODES, ADVANCE_CASH_DENOMS, sumAdvanceCashDenominations } from "../../lib/paymentModes";
import type { AppPaymentMode } from "../../lib/paymentModes";
import type { QuickBillHistoryRow, QuickBillInvoice } from "../../types/quickBill";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";
import { seedStoreToInvoiceProfile } from "../../types/storeInvoice";

/* ── Rolex-inspired design tokens ─────────────────────────────────────── */
const fieldClass =
  "rounded-sm border border-rlx-rule bg-white px-3 py-2.5 text-sm text-rlx-ink outline-none transition " +
  "placeholder:text-rlx-ink-muted/60 focus:border-rlx-green focus:ring-2 focus:ring-rlx-green/10";

/** Compact gold-accented table-action button */
const btnAction =
  "inline-flex items-center justify-center gap-1 border border-rlx-gold/60 bg-white px-2.5 py-1.5 " +
  "text-[11px] font-semibold tracking-wide text-rlx-green transition hover:border-rlx-gold hover:bg-rlx-green-light";

/** Compact muted secondary action */
const btnActionMuted =
  "inline-flex items-center justify-center gap-1 border border-rlx-rule bg-rlx-bg px-2.5 py-1.5 " +
  "text-[11px] font-semibold text-rlx-ink-muted transition hover:border-rlx-ink-muted/30 hover:bg-white";

function customerLabel(row: QuickBillHistoryRow): string {
  if (row.customerType === "B2B") return row.company?.trim() || "—";
  return row.customerName?.trim() || "Walk-in / B2C";
}

function warrantyTableLabel(w: QuickBillHistoryRow["warrantyStatus"]): string {
  switch (w) {
    case "under_warranty":
      return "Under warranty";
    case "extended":
      return "Extended";
    case "none":
      return "None";
    default:
      return "—";
  }
}

function paymentDetailText(inv: QuickBillInvoice): string {
  if (inv.paymentMode === "Cash" && inv.paymentDetails?.cash) {
    const parts: string[] = [];
    for (const { key, face, label } of ADVANCE_CASH_DENOMS) {
      const qty = Number(inv.paymentDetails.cash[key]);
      if (Number.isFinite(qty) && qty > 0) parts.push(`${label} ${qty} → ₹${(qty * face).toFixed(2)}`);
    }
    const coins = Number(inv.paymentDetails.cash.coinsInr);
    if (Number.isFinite(coins) && coins > 0) parts.push(`Coins: ₹${coins.toFixed(2)}`);
    const sum = sumAdvanceCashDenominations(inv.paymentDetails.cash);
    if (parts.length === 0) return sum > 0 ? `Cash total ₹${sum.toFixed(2)}` : "—";
    return `${parts.join(" · ")} (total ₹${sum.toFixed(2)})`;
  }
  const ref = inv.paymentDetails?.reference?.trim();
  return ref || "—";
}

export function QuickBillHistoryPage() {
  const apiMode = useApiMode();
  const { user } = useAuth();
  const { regions } = useRegions();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<QuickBillHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [payment, setPayment] = useState<"ALL" | AppPaymentMode>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<QuickBillHistoryRow | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<QuickBillInvoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [invoiceHsnSac, setInvoiceHsnSac] = useState("9987");
  const [serviceTaxSettings, setServiceTaxSettings] = useState<ServiceTaxSettings | null>(null);

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

  useEffect(() => {
    if (!selected || !apiMode) {
      setDetailInvoice(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setDetailInvoice(null);
    void (async () => {
      try {
        const data = await apiJson<{ invoice: QuickBillInvoice }>(`/api/service/quick-bills/${selected.id}`);
        if (!cancelled) setDetailInvoice(data.invoice);
      } catch (e) {
        if (!cancelled) {
          setDetailError(e instanceof ApiError ? e.message : "Could not load invoice details.");
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, apiMode]);

  useEffect(() => {
    if (!apiMode || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<{ settings: ServiceTaxSettings }>("/api/settings/tax");
        if (cancelled) return;
        const s = data.settings;
        setInvoiceHsnSac(s.defaultSacHsn.trim() || "9987");
        setServiceTaxSettings(s);
      } catch {
        if (!cancelled) setServiceTaxSettings(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiMode, user]);

  const currentUserStore = useMemo(() => {
    const sid = user?.storeId?.trim();
    if (!sid) return undefined;
    for (const r of regions) {
      const s = r.stores.find((x) => x.id === sid);
      if (s) return s;
    }
    return undefined;
  }, [regions, user?.storeId]);

  const billStoreForInvoice = useMemo(() => {
    const sid = detailInvoice?.storeId?.trim();
    if (!sid) return undefined;
    for (const r of regions) {
      const st = r.stores.find((x) => x.id === sid);
      if (st) return st;
    }
    return undefined;
  }, [regions, detailInvoice?.storeId]);

  const invoiceVmOptions = useMemo(
    () => ({
      defaultHsnSac: invoiceHsnSac,
      taxSettings: serviceTaxSettings,
      storeInvoice: seedStoreToInvoiceProfile(billStoreForInvoice ?? currentUserStore),
      generatedBy: user?.displayName?.trim() || user?.email?.trim() || user?.id || null,
    }),
    [invoiceHsnSac, serviceTaxSettings, billStoreForInvoice, currentUserStore, user?.displayName, user?.email, user?.id],
  );

  const detailInvoiceVm = useMemo(
    () => (detailInvoice ? mapQuickBillInvoiceToViewModel(detailInvoice, invoiceVmOptions) : null),
    [detailInvoice, invoiceVmOptions],
  );

  const invoicePrintIdPrefix = detailInvoice ? `qbh-${detailInvoice.id.replace(/-/g, "").slice(0, 12)}` : "qbh";

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
      const hay = [
        r.billNumber,
        customerLabel(r),
        r.watchBrand,
        r.watchModel,
        r.watchRef ?? "",
        r.watchRemark,
        r.technicianName ?? "",
        r.phone ?? "",
        r.email ?? "",
        r.gst ?? "",
        r.pan ?? "",
        r.notes,
        r.storeName ?? r.regionName ?? r.regionId,
      ]
        .join(" ")
        .toLowerCase();
      const tokens = q.split(/\s+/).filter(Boolean);
      return tokens.every((t) => hay.includes(t));
    });
  }, [rows, query, payment, fromDate, toDate]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  async function handleDownloadRow(r: QuickBillHistoryRow, e: React.MouseEvent) {
    e.stopPropagation();
    if (!apiMode) return;
    setDownloadBusyId(r.id);
    try {
      const data = await apiJson<{ invoice: QuickBillInvoice }>(`/api/service/quick-bills/${r.id}`);
      downloadQuickBillInvoiceHtml(data.invoice);
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Could not download invoice.");
    } finally {
      setDownloadBusyId(null);
    }
  }

  return (
    <div className="relative -mx-4 -mt-2 font-sans text-rlx-ink md:-mx-6">
      <div className={`min-h-screen bg-rlx-bg ${selected ? "print:hidden" : ""}`}>
        <ServiceBreadcrumb current="Quick bill history" />

        {/* ── PAGE HERO BANNER ─────────────────────────────────── */}
        <div className="bg-rlx-green px-5 py-10 md:px-10 md:py-14">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.45em] text-rlx-gold">
            Zimson Service · Invoice Register
          </p>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-display text-4xl font-light leading-tight tracking-wide text-white md:text-5xl">
                Quick Bill History
              </h1>
              {/* <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70">
                Search, preview and download issued invoices. Every record is preserved with full customer, watch and payment detail.
              </p> */}
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link
                to="/service/quick-bill"
                className="no-underline inline-flex items-center gap-2 bg-rlx-gold px-6 py-3 text-sm font-semibold tracking-wide text-rlx-green-deep shadow transition hover:bg-rlx-gold-dark"
              >
                + New Quick Bill
              </Link>
              <Link
                to="/service"
                className="no-underline inline-flex items-center gap-2 border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold tracking-wide text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                Service Home
              </Link>
            </div>
          </div>
        </div>

        {/* ── FILTER + TABLE SECTION ─────────────────────────── */}
        <div className="px-5 py-8 md:px-10">
          {/* filter strip */}
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.28em] text-rlx-ink-muted">
              {filtered.length} invoice{filtered.length === 1 ? "" : "s"} found
            </h2>
          </div>

          {error ? (
            <div className="mb-5 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <div className="mb-5 mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              className={`${fieldClass} lg:col-span-2`}
              placeholder="Search invoice, customer, phone, watch, GST…"
            />
            <select
              value={payment}
              onChange={(e) => { setPayment(e.target.value as "ALL" | AppPaymentMode); setPage(1); }}
              className={fieldClass}
            >
              <option value="ALL">All payment modes</option>
              {APP_PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input type="date" value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className={fieldClass}
            />
            <input type="date" value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className={fieldClass}
            />
            <button
              type="button"
              onClick={() => { setQuery(""); setPayment("ALL"); setFromDate(""); setToDate(""); setPage(1); }}
              className="border border-rlx-rule bg-white px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light"
            >
              Reset
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 py-8 text-sm text-rlx-ink-muted">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-rlx-green border-t-transparent" />
              Loading invoices…
            </div>
          ) : null}
          {!loading && filtered.length === 0 ? (
            <div className="border border-rlx-rule bg-white px-6 py-10 text-center">
              <p className="text-sm text-rlx-ink-muted">No invoices match the current filters.</p>
            </div>
          ) : null}

          {filtered.length > 0 ? (
            <>
              {/* table */}
              <div className="overflow-auto border border-rlx-rule bg-white shadow-sm">
                <table className="min-w-[1100px] w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-rlx-green text-[10px] font-semibold uppercase tracking-[0.24em] text-white">
                    <tr>
                      {[
                        "Date","Invoice","Customer","Phone","Email",
                        "Brand","Model","Ref","Warranty","Technician",
                        "Location","Payment","Notes","Total","Actions"
                      ].map((h) => (
                        <th
                          key={h}
                          className={`whitespace-nowrap px-3 py-4 font-medium ${h === "Total" ? "text-right" : ""}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                    {/* gold underline accent */}
                    <tr aria-hidden>
                      <td colSpan={15} className="h-[2px] bg-rlx-gold p-0" />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((r, idx) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className={`cursor-pointer border-b border-rlx-rule transition-colors duration-150 hover:bg-rlx-green-light ${idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"}`}
                      >
                        <td className="whitespace-nowrap px-3 py-3.5 text-xs text-rlx-ink-muted">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 font-mono text-xs font-semibold text-rlx-green">
                          {r.billNumber}
                        </td>
                        <td className="max-w-[10rem] truncate px-3 py-3.5 font-medium text-rlx-ink" title={customerLabel(r)}>
                          {customerLabel(r)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-xs text-rlx-ink-muted">{r.phone ?? "—"}</td>
                        <td className="max-w-[8rem] truncate px-3 py-3.5 text-xs text-rlx-ink-muted" title={r.email ?? ""}>{r.email ?? "—"}</td>
                        <td className="max-w-[6rem] truncate px-3 py-3.5 text-xs" title={r.watchBrand}>{r.watchBrand}</td>
                        <td className="max-w-[8rem] truncate px-3 py-3.5 text-xs" title={r.watchModel}>{r.watchModel}</td>
                        <td className="max-w-[6rem] truncate px-3 py-3.5 text-xs text-rlx-ink-muted" title={r.watchRef ?? ""}>{r.watchRef ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-xs text-rlx-ink-muted">{warrantyTableLabel(r.warrantyStatus)}</td>
                        <td className="max-w-[7rem] truncate px-3 py-3.5 text-xs" title={r.technicianName ?? ""}>{r.technicianName ?? "—"}</td>
                        <td className="max-w-[8rem] truncate px-3 py-3.5 text-xs text-rlx-ink-muted" title={r.storeName ?? r.regionName ?? r.regionId}>
                          {r.storeName ?? r.regionName ?? r.regionId}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-xs">{r.paymentMode}</td>
                        <td className="max-w-[7rem] truncate px-3 py-3.5 text-xs text-rlx-ink-muted" title={r.notes}>
                          {r.notes?.trim() || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right text-sm font-semibold tabular-nums text-rlx-green">
                          {r.totalInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                        </td>
                        <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={!apiMode}
                              onClick={(e) => { e.stopPropagation(); setSelected(r); }}
                              className={`${btnAction} disabled:opacity-40`}
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              disabled={downloadBusyId === r.id || !apiMode}
                              onClick={(e) => void handleDownloadRow(r, e)}
                              className={`${btnActionMuted} disabled:opacity-40`}
                            >
                              {downloadBusyId === r.id ? "…" : "Download"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* pagination */}
              <div className="mt-5 flex flex-col gap-3 border-t border-rlx-rule pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-rlx-ink-muted">
                  Page <span className="font-semibold text-rlx-ink">{currentPage}</span> of{" "}
                  <span className="font-semibold text-rlx-ink">{totalPages}</span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="border border-rlx-rule bg-white px-5 py-2 text-xs font-semibold uppercase tracking-wide text-rlx-ink transition hover:border-rlx-green hover:text-rlx-green disabled:opacity-35"
                  >
                    ← Prev
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="border border-rlx-rule bg-white px-5 py-2 text-xs font-semibold uppercase tracking-wide text-rlx-ink transition hover:border-rlx-green hover:text-rlx-green disabled:opacity-35"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>{/* end page wrapper */}

      {/* ── INVOICE PREVIEW MODAL ─────────────────────────────── */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-rlx-ink/70 backdrop-blur-sm sm:items-center sm:p-4 print:static print:inset-auto print:z-0 print:bg-white print:p-0 print:backdrop-blur-none">
          <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.5)] print:max-h-none print:max-w-none print:shadow-none">

            {/* modal header — Rolex-green top bar */}
            <div className="sticky top-0 z-20 flex items-center justify-between bg-rlx-green px-6 py-4 print:hidden">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.45em] text-rlx-gold">Invoice preview</p>
                <h3 className="font-display text-2xl font-light text-white md:text-3xl">{selected.billNumber}</h3>
                <p className="mt-0.5 text-xs text-white/60">{new Date(selected.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {detailInvoiceVm ? (
                  <button
                    type="button"
                    onClick={() => printServiceInvoice()}
                    className="bg-rlx-gold px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-rlx-green-deep transition hover:bg-rlx-gold-dark"
                  >
                    Print
                  </button>
                ) : null}
                {detailInvoice ? (
                  <button
                    type="button"
                    onClick={() => downloadQuickBillInvoiceHtml(detailInvoice)}
                    className="border border-white/30 bg-white/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white/20"
                  >
                    Download
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="border border-white/20 px-5 py-2.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            <div className="p-6 md:p-8">
              {detailLoading ? (
                <div className="flex items-center gap-3 py-8 text-sm text-rlx-ink-muted print:hidden">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-rlx-green border-t-transparent" />
                  Loading invoice…
                </div>
              ) : null}
              {detailError ? (
                <div className="mb-5 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800 print:hidden">
                  {detailError}
                </div>
              ) : null}

              {/* formal invoice preview */}
              {detailInvoiceVm ? (
                <div className="mb-8 print:mb-0">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-rlx-ink-muted print:hidden">
                    Invoice · Formal layout
                  </p>
                  <div className="border border-rlx-rule print:border-0">
                    <ServiceInvoiceTemplate data={detailInvoiceVm} idPrefix={invoicePrintIdPrefix} />
                  </div>
                </div>
              ) : null}

              {/* detail data table */}
              {detailInvoice ? (
                <div className="space-y-6 print:hidden">
                  {/* gold separator */}
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-rlx-rule" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-rlx-gold">
                      Record detail
                    </span>
                    <div className="h-px flex-1 bg-rlx-rule" />
                  </div>

                  <div className="overflow-x-auto border border-rlx-rule">
                    <table className="min-w-full text-sm">
                      <tbody>
                        {(
                          [
                            ["Customer", customerLabel(selected)],
                            ["Phone", detailInvoice.phone ?? "—"],
                            ["Email", detailInvoice.email ?? "—"],
                            ...(detailInvoice.customerType === "B2B"
                              ? [
                                  ["GSTIN", <span className="font-mono text-xs">{detailInvoice.gst ?? "—"}</span>],
                                  ["PAN",   <span className="font-mono text-xs">{detailInvoice.pan ?? "—"}</span>],
                                ]
                              : []),
                            ["Watch", `${detailInvoice.watchBrand} ${detailInvoice.watchModel}${detailInvoice.watchRef ? ` · Ref ${detailInvoice.watchRef}` : ""}`],
                            ["Warranty", warrantyTableLabel(detailInvoice.warrantyStatus ?? "unspecified")],
                            ["Watch remark", detailInvoice.watchRemark?.trim() || "—"],
                            ["Technician", detailInvoice.technicianName ?? "—"],
                            ["Location", [detailInvoice.regionName, detailInvoice.storeName].filter(Boolean).join(" · ") || detailInvoice.regionId],
                            ["Payment", (
                              <span>
                                <span className="font-semibold text-rlx-ink">{detailInvoice.paymentMode}</span>
                                <span className="ml-2 text-xs text-rlx-ink-muted">{paymentDetailText(detailInvoice)}</span>
                              </span>
                            )],
                            ["Notes", detailInvoice.notes?.trim() || "—"],
                            ["Total", (
                              <span className="font-semibold text-rlx-green">
                                {detailInvoice.totalInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                              </span>
                            )],
                          ] as [string, React.ReactNode][]
                        ).map(([label, value], i) => (
                          <tr key={label} className={`border-b border-rlx-rule ${i % 2 === 0 ? "bg-white" : "bg-rlx-bg"}`}>
                            <th className="w-44 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-rlx-ink-muted">
                              {label}
                            </th>
                            <td className="px-4 py-3 text-rlx-ink">{value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {(detailInvoice.watchDocumentPath?.trim() || detailInvoice.watchImagePath?.trim()) ? (
                    <div className="border border-rlx-rule bg-rlx-bg px-5 py-4 text-sm">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-rlx-gold">Attachments</p>
                      {detailInvoice.watchDocumentPath?.trim() ? (
                        <p className="text-rlx-ink-muted">
                          Document:{" "}
                          <a className="font-medium text-rlx-green underline underline-offset-2" href={detailInvoice.watchDocumentPath.trim()} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        </p>
                      ) : null}
                      {detailInvoice.watchImagePath?.trim() ? (
                        <p className="text-rlx-ink-muted">
                          Image:{" "}
                          <a className="font-medium text-rlx-green underline underline-offset-2" href={detailInvoice.watchImagePath.trim()} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* line items */}
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-rlx-gold">Line items</p>
                    <div className="overflow-x-auto border border-rlx-rule">
                      <table className="min-w-full text-sm">
                        <thead className="bg-rlx-green text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                          <tr>
                            <th className="px-4 py-3">#</th>
                            <th className="px-4 py-3">Description</th>
                            <th className="px-4 py-3 text-right">Qty</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                          </tr>
                          <tr aria-hidden><td colSpan={4} className="h-[2px] bg-rlx-gold p-0" /></tr>
                        </thead>
                        <tbody>
                          {detailInvoice.lines.map((ln, i) => (
                            <tr key={ln.lineNo} className={`border-b border-rlx-rule ${i % 2 === 0 ? "bg-white" : "bg-rlx-bg"}`}>
                              <td className="px-4 py-3 text-rlx-ink-muted">{ln.lineNo}</td>
                              <td className="px-4 py-3 text-rlx-ink">{ln.description}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-rlx-ink-muted">{ln.qty}</td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-rlx-ink">
                                {ln.amountInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : !detailLoading && !detailError ? (
                <p className="text-sm text-rlx-ink-muted print:hidden">No detail loaded.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
