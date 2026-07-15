import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { mapQuickBillInvoiceToViewModel } from "../../components/service/mapQuickBillToServiceInvoice";
import { ServiceInvoiceTemplate } from "../../components/service/ServiceInvoiceTemplate";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { FilterField } from "../../components/ui/FilterField";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { SendInvoiceWhatsAppButton } from "../../components/service/SendInvoiceWhatsAppButton";
import { SendInvoiceEmailButton } from "../../components/service/SendInvoiceEmailButton";
import {
  IconClose,
  IconDownload,
  IconGstEinvoice,
  IconPreview,
  IconPrint,
  IconSpinner,
  invoicePreviewIconBtn,
} from "../../components/service/invoicePreviewIcons";
import { resolveEinvoiceDocumentUrl } from "../../lib/einvoicePortal";
import {
  captureQuickBillInvoicePdf,
  downloadQuickBillInvoicePdf,
} from "../../lib/quickBillInvoiceDownload";
import { printServiceInvoice } from "../../lib/printServiceInvoice";
import { DEFAULT_SERVICE_SAC, formatPrintedHsnSac } from "../../lib/hsnGst";
import { APP_PAYMENT_MODES, formatPaymentSummary } from "../../lib/paymentModes";
import type { AppPaymentMode } from "../../lib/paymentModes";
import { uiPageTitleOnDarkClass } from "../../lib/pageTypography";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";
import {
  formatEinvoiceEdocMessage,
  humanizeEinvoiceError,
  isTransientEinvoiceErrorMessage,
  quickBillNeedsEinvoiceRetry,
} from "../../lib/edocResultMessage";
import { seedStoreToInvoiceProfile } from "../../types/storeInvoice";

const TABLE_HEADERS: { key: string; label: string; align?: "right"; hide?: string }[] = [
  { key: "date", label: "Date" },
  { key: "invoice", label: "Invoice" },
  { key: "customer", label: "Customer" },
  { key: "phone", label: "Phone", hide: "col-hide-sm" },
  { key: "email", label: "Email", hide: "col-hide-lg" },
  { key: "brand", label: "Brand", hide: "col-hide-md" },
  { key: "model", label: "Model", hide: "col-hide-md" },
  { key: "ref", label: "Ref", hide: "col-hide-xl" },
  { key: "warranty", label: "Warranty", hide: "col-hide-xl" },
  { key: "tech", label: "Technician", hide: "col-hide-lg" },
  { key: "loc", label: "Location", hide: "col-hide-md" },
  { key: "pay", label: "Payment" },
  { key: "notes", label: "Notes", hide: "col-hide-xl" },
  { key: "total", label: "Total", align: "right" },
  { key: "actions", label: "Actions", align: "right" },
];

const btnIcon =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border transition disabled:cursor-not-allowed disabled:opacity-50";
const btnIconAction = `${btnIcon} border-rlx-gold/60 bg-white text-rlx-green hover:border-rlx-gold hover:bg-rlx-green-light`;
const btnIconMuted = `${btnIcon} border-rlx-rule bg-rlx-bg text-rlx-ink-muted hover:border-rlx-ink-muted/30 hover:bg-white`;
const btnIconEinvoice = `${btnIcon} border-amber-400/70 bg-amber-50 text-amber-900 hover:bg-amber-100`;

const iconSm = "h-[1.125rem] w-[1.125rem]";

function formatTableDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}

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
  return formatPaymentSummary(inv.paymentMode, inv.paymentDetails) || "—";
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
  const [detailDownloadBusy, setDetailDownloadBusy] = useState(false);
  const [gstEinvoiceBusy, setGstEinvoiceBusy] = useState(false);
  const [whatsappNote, setWhatsappNote] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [invoiceHsnSac, setInvoiceHsnSac] = useState(DEFAULT_SERVICE_SAC);
  const [serviceTaxSettings, setServiceTaxSettings] = useState<ServiceTaxSettings | null>(null);
  const [edocSettings, setEdocSettings] = useState<{ enabled?: boolean } | null>(null);
  const [edocBusyId, setEdocBusyId] = useState<string | null>(null);
  const [edocMsg, setEdocMsg] = useState<string | null>(null);

  const edocEnabled = Boolean(edocSettings?.enabled);

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
    if (!apiMode || !user) return;
    let cancelled = false;
    void apiJson<{ enabled?: boolean }>("/api/edoc/status")
      .then((out) => {
        if (!cancelled) setEdocSettings(out);
      })
      .catch(() => {
        if (!cancelled) setEdocSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apiMode, user]);

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
    setWhatsappNote(null);
  }, [selected?.id]);

  useEffect(() => {
    if (!apiMode || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<{ settings: ServiceTaxSettings }>("/api/settings/tax");
        if (cancelled) return;
        const s = data.settings;
        setInvoiceHsnSac(formatPrintedHsnSac(s.defaultSacHsn.trim() || DEFAULT_SERVICE_SAC));
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

  const storeForInvoice = useCallback(
    (storeId: string | null | undefined) => {
      const sid = storeId?.trim();
      if (!sid) return undefined;
      for (const r of regions) {
        const st = r.stores.find((x) => x.id === sid);
        if (st) return st;
      }
      return undefined;
    },
    [regions],
  );

  const invoiceVmOptionsFor = useCallback(
    (inv: QuickBillInvoice | null | undefined) => ({
      defaultHsnSac: invoiceHsnSac,
      taxSettings: serviceTaxSettings,
      storeInvoice: seedStoreToInvoiceProfile(storeForInvoice(inv?.storeId) ?? currentUserStore),
      customerBillingState: inv?.customerBillingState ?? null,
      customerType: inv?.customerType,
      customerGstin: inv?.gst ?? null,
      generatedBy: user?.displayName?.trim() || user?.email?.trim() || user?.id || null,
      edocIrn: inv?.edocIrn ?? null,
      edocAckNo: inv?.edocAckNo ?? null,
      edocQr: inv?.edocQr ?? null,
    }),
    [invoiceHsnSac, serviceTaxSettings, storeForInvoice, currentUserStore, user?.displayName, user?.email, user?.id],
  );

  const invoiceVmOptions = useMemo(
    () => invoiceVmOptionsFor(detailInvoice),
    [invoiceVmOptionsFor, detailInvoice],
  );

  const detailInvoiceVm = useMemo(
    () => (detailInvoice ? mapQuickBillInvoiceToViewModel(detailInvoice, invoiceVmOptions) : null),
    [detailInvoice, invoiceVmOptions],
  );

  const gstEinvoicePdfUrl = useMemo(
    () => resolveEinvoiceDocumentUrl({ pdfUrl: detailInvoice?.edocPdfUrl }),
    [detailInvoice?.edocPdfUrl],
  );

  const invoicePrintIdPrefix = detailInvoice ? `qbh-${detailInvoice.id.replace(/-/g, "").slice(0, 12)}` : "qbh";

  const resolveDetailInvoicePdfBlob = useCallback(async () => {
    if (!detailInvoice) throw new Error("Invoice is not loaded.");
    return captureQuickBillInvoicePdf(detailInvoice, invoiceVmOptionsFor(detailInvoice));
  }, [detailInvoice, invoiceVmOptionsFor]);

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
      await downloadQuickBillInvoicePdf(data.invoice, invoiceVmOptionsFor(data.invoice), false);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not download invoice PDF.");
    } finally {
      setDownloadBusyId(null);
    }
  }

  async function handleOpenGstEinvoice() {
    if (!detailInvoice?.edocIrn?.trim()) return;
    let url = gstEinvoicePdfUrl;
    if (!url) {
      setGstEinvoiceBusy(true);
      try {
        const data = await apiJson<{ pdfUrl: string | null }>(
          `/api/edoc/quick-bills/${encodeURIComponent(detailInvoice.id)}/einvoice-pdf-url`,
        );
        url = resolveEinvoiceDocumentUrl({ pdfUrl: data.pdfUrl });
        if (url) {
          setDetailInvoice((prev) =>
            prev?.id === detailInvoice.id ? { ...prev, edocPdfUrl: data.pdfUrl } : prev,
          );
        }
      } catch (e) {
        setWhatsappNote(e instanceof ApiError ? e.message : "Could not load GST e-invoice PDF.");
        return;
      } finally {
        setGstEinvoiceBusy(false);
      }
    }
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setWhatsappNote(
      "GST e-invoice PDF could not be loaded from IRP. Check Masters India / GST portal settings, or try Retry e-invoice.",
    );
  }

  async function handleDownloadDetail() {
    if (!detailInvoice || !detailInvoiceVm) return;
    setDetailDownloadBusy(true);
    try {
      await downloadQuickBillInvoicePdf(detailInvoice, invoiceVmOptions, true);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not download invoice PDF.");
    } finally {
      setDetailDownloadBusy(false);
    }
  }

  async function retryEinvoice(row: QuickBillHistoryRow) {
    if (!apiMode || !quickBillNeedsEinvoiceRetry(row, edocEnabled)) return;
    setEdocBusyId(row.id);
    setEdocMsg("Contacting Masters India e-invoice (sandbox may take up to 2 minutes)…");
    const maxAttempts = 3;
    const retryDelayMs = 15_000;
    try {
      let lastError = "";
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (attempt > 1) {
          setEdocMsg(`Masters India slow or busy — retrying e-invoice (${attempt}/${maxAttempts})…`);
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
        const out = await apiJson<{ edoc: QuickBillEdocInfo }>(
          `/api/edoc/quick-bills/${encodeURIComponent(row.id)}/generate-einvoice`,
          { method: "POST", json: {} },
        );
        const msg = formatEinvoiceEdocMessage(out.edoc);
        if (out.edoc?.ok) {
          setEdocMsg(msg ?? "E-invoice registered.");
          await load();
          if (selected?.id === row.id) {
            const data = await apiJson<{ invoice: QuickBillInvoice }>(`/api/service/quick-bills/${row.id}`);
            setDetailInvoice({
              ...data.invoice,
              edocPdfUrl: data.invoice.edocPdfUrl ?? out.edoc.pdfUrl ?? null,
            });
          }
          return;
        }
        lastError = out.edoc?.error ?? out.edoc?.skipReason ?? msg ?? "";
        if (!isTransientEinvoiceErrorMessage(lastError) || attempt === maxAttempts) {
          setEdocMsg(`E-invoice failed: ${humanizeEinvoiceError(lastError)}`);
          return;
        }
      }
    } catch (e) {
      setEdocMsg(e instanceof ApiError ? e.message : "Could not retry e-invoice.");
    } finally {
      setEdocBusyId(null);
    }
  }

  return (
    <div className="ui-page-bleed relative font-sans text-rlx-ink">
      <div className={`min-h-0 bg-rlx-bg ${selected ? "print:hidden" : ""}`}>
        <ServiceBreadcrumb current="Quick bill history" />

        {/* ── PAGE HERO BANNER ─────────────────────────────────── */}
        <div className="bg-rlx-green px-4 py-6 md:px-6 md:py-8">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.4em] text-rlx-gold">
            Zimson Service · Invoice Register
          </p>
          <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className={uiPageTitleOnDarkClass}>
                Quick Bill History
              </h1>
              {/* <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70">
                Search, preview and download issued invoices. Every record is preserved with full customer, watch and payment detail.
              </p> */}
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
              <Link
                to="/service/quick-bill"
                className="no-underline inline-flex w-full items-center justify-center gap-2 bg-rlx-gold px-4 py-2.5 text-xs font-semibold tracking-wide text-rlx-green-deep shadow transition hover:bg-rlx-gold-dark sm:w-auto"
              >
                + New Quick Bill
              </Link>
              <Link
                to="/service"
                className="no-underline inline-flex w-full items-center justify-center gap-2 border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-semibold tracking-wide text-white backdrop-blur-sm transition hover:bg-white/20 sm:w-auto"
              >
                Service Home
              </Link>
            </div>
          </div>
        </div>

        {/* ── FILTER + TABLE SECTION ─────────────────────────── */}
        <div className="px-4 py-5 md:px-6">
          {/* filter strip */}
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-rlx-ink-muted">
              {filtered.length} invoice{filtered.length === 1 ? "" : "s"} found
            </h2>
          </div>

          {error ? (
            <div className="mb-5 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          {edocMsg ? (
            <div className="mb-5 border-l-4 border-sky-500 bg-sky-50 px-4 py-3 text-sm text-sky-950">
              {edocMsg}
            </div>
          ) : null}

          <div className="ui-filter-grid mb-5 mt-4">
            <FilterField label="Search" htmlFor="qb-hist-search" className="ui-filter-span-2-sm min-w-0">
              <input
                id="qb-hist-search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                className="ui-field"
                placeholder="Invoice, customer, phone, watch, GST…"
              />
            </FilterField>
            <FilterField label="Payment mode" htmlFor="qb-hist-payment" className="min-w-0">
              <select
                id="qb-hist-payment"
                value={payment}
                onChange={(e) => {
                  setPayment(e.target.value as "ALL" | AppPaymentMode);
                  setPage(1);
                }}
                className="ui-field"
              >
                <option value="ALL">All payment modes</option>
                {APP_PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="From date" htmlFor="qb-hist-from" className="min-w-0">
              <input
                id="qb-hist-from"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className="ui-field"
              />
            </FilterField>
            <FilterField label="To date" htmlFor="qb-hist-to" className="min-w-0">
              <input
                id="qb-hist-to"
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                className="ui-field"
              />
            </FilterField>
            <div className="flex min-w-0 items-end">
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setPayment("ALL");
                  setFromDate("");
                  setToDate("");
                  setPage(1);
                }}
                className="ui-btn-secondary"
              >
                Reset
              </button>
            </div>
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
              <p className="mb-2 text-xs text-rlx-ink-muted xl:hidden">
                Swipe horizontally to see more columns →
              </p>
              <div className="ui-table-scroll border border-rlx-rule bg-white shadow-sm">
                <table className="ui-table-dense w-full min-w-[42rem] text-left text-sm xl:min-w-[1100px]">
                  <thead className="sticky top-0 z-10 bg-rlx-green text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                    <tr className="border-b-2 border-rlx-gold">
                      {TABLE_HEADERS.map((h) => (
                        <th
                          key={h.key}
                          className={`whitespace-nowrap px-3 py-3 font-semibold ${h.hide ?? ""} ${h.align === "right" ? "text-right" : "text-left"}`}
                        >
                          {h.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((r, idx) => {
                      const created = formatTableDate(r.createdAt);
                      return (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className={`cursor-pointer border-b border-rlx-rule transition-colors duration-150 hover:bg-rlx-green-light ${idx % 2 === 1 ? "bg-rlx-bg" : "bg-white"}`}
                      >
                        <td className="align-middle px-3 py-3">
                          <span className="block whitespace-nowrap text-sm font-medium leading-snug text-rlx-ink">{created.date}</span>
                          <span className="block whitespace-nowrap text-xs leading-snug text-rlx-ink-muted">{created.time}</span>
                        </td>
                        <td className="align-middle px-3 py-3">
                          <span className="block whitespace-nowrap font-mono text-sm font-semibold text-rlx-green" title={r.billNumber}>
                            {r.billNumber}
                          </span>
                        </td>
                        <td className="align-middle px-3 py-3 max-w-[11rem]">
                          <span className="block truncate text-sm font-medium leading-snug text-rlx-ink" title={customerLabel(r)}>
                            {customerLabel(r)}
                          </span>
                        </td>
                        <td className="col-hide-sm align-middle px-3 py-3 whitespace-nowrap text-sm text-rlx-ink-muted">
                          {r.phone ?? "—"}
                        </td>
                        <td className="col-hide-lg align-middle px-3 py-3 max-w-[9rem]">
                          <span className="block truncate text-sm text-rlx-ink-muted" title={r.email ?? ""}>
                            {r.email ?? "—"}
                          </span>
                        </td>
                        <td className="col-hide-md align-middle px-3 py-3 max-w-[7rem]">
                          <span className="block truncate text-sm" title={r.watchBrand}>{r.watchBrand}</span>
                        </td>
                        <td className="col-hide-md align-middle px-3 py-3 max-w-[9rem]">
                          <span className="block truncate text-sm" title={r.watchModel}>{r.watchModel}</span>
                        </td>
                        <td className="col-hide-xl align-middle px-3 py-3 max-w-[7rem]">
                          <span className="block truncate text-sm text-rlx-ink-muted" title={r.watchRef ?? ""}>
                            {r.watchRef ?? "—"}
                          </span>
                        </td>
                        <td className="col-hide-xl align-middle px-3 py-3">
                          <span className="inline-flex h-8 items-center rounded px-2.5 text-xs font-semibold ring-1 ring-inset ring-stone-300/80 bg-stone-100 text-stone-800">
                            {warrantyTableLabel(r.warrantyStatus)}
                          </span>
                        </td>
                        <td className="col-hide-lg align-middle px-3 py-3 max-w-[8rem]">
                          <span className="block truncate text-sm" title={r.technicianName ?? ""}>
                            {r.technicianName ?? "—"}
                          </span>
                        </td>
                        <td
                          className="col-hide-md align-middle px-3 py-3 max-w-[9rem]"
                          title={r.storeName ?? r.regionName ?? r.regionId}
                        >
                          <span className="block truncate text-sm text-rlx-ink-muted">
                            {r.storeName ?? r.regionName ?? r.regionId}
                          </span>
                        </td>
                        <td className="align-middle px-3 py-3">
                          <span className="inline-flex h-8 max-w-[8rem] items-center truncate rounded px-2.5 text-xs font-semibold ring-1 ring-inset ring-sky-300/80 bg-sky-50 text-sky-950" title={r.paymentMode}>
                            {r.paymentMode}
                          </span>
                        </td>
                        <td className="col-hide-xl align-middle px-3 py-3 max-w-[8rem]">
                          <span className="block truncate text-sm text-rlx-ink-muted" title={r.notes}>
                            {r.notes?.trim() || "—"}
                          </span>
                        </td>
                        <td className="align-middle px-3 py-3 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-rlx-green">
                          {r.totalInr.toLocaleString(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 })}
                        </td>
                        <td className="align-middle px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-nowrap items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={!apiMode}
                              onClick={(e) => { e.stopPropagation(); setSelected(r); }}
                              className={`${btnIconAction} disabled:opacity-40`}
                              title="Preview invoice"
                              aria-label="Preview invoice"
                            >
                              <IconPreview className={iconSm} />
                            </button>
                            <button
                              type="button"
                              disabled={downloadBusyId === r.id || !apiMode}
                              onClick={(e) => void handleDownloadRow(r, e)}
                              className={`${btnIconMuted} disabled:opacity-40`}
                              title="Download PDF"
                              aria-label="Download PDF"
                            >
                              {downloadBusyId === r.id ? (
                                <IconSpinner className={iconSm} />
                              ) : (
                                <IconDownload className={iconSm} />
                              )}
                            </button>
                            {quickBillNeedsEinvoiceRetry(r, edocEnabled) ? (
                              <button
                                type="button"
                                disabled={edocBusyId === r.id || !apiMode}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void retryEinvoice(r);
                                }}
                                className={`${btnIconEinvoice} disabled:opacity-40`}
                                title="Retry e-invoice"
                                aria-label="Retry e-invoice"
                              >
                                {edocBusyId === r.id ? (
                                  <IconSpinner className={iconSm} />
                                ) : (
                                  <IconGstEinvoice className={iconSm} />
                                )}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* pagination */}
              <div className="mt-5 flex flex-col gap-3 border-t border-rlx-rule pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-rlx-ink-muted">
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

            {/* modal header */}
            <div className="sticky top-0 z-20 flex flex-col gap-3 border-b border-rlx-gold bg-rlx-green px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 print:hidden">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">
                  Invoice preview
                </p>
                <h3 className="truncate font-mono text-base font-semibold text-white sm:text-lg">
                  {selected.billNumber}
                </h3>
                <p className="mt-0.5 text-[11px] text-white/65">
                  {new Date(selected.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {detailInvoiceVm ? (
                  <button
                    type="button"
                    onClick={() => printServiceInvoice()}
                    aria-label="Print invoice"
                    title="Print invoice"
                    className={`${invoicePreviewIconBtn} border-rlx-gold/50 bg-rlx-gold text-rlx-green-deep transition hover:bg-rlx-gold-dark`}
                  >
                    <IconPrint />
                  </button>
                ) : null}
                {detailInvoice && detailInvoiceVm ? (
                  <button
                    type="button"
                    disabled={detailDownloadBusy}
                    onClick={() => void handleDownloadDetail()}
                    aria-label="Download PDF"
                    title="Download PDF"
                    className={`${invoicePreviewIconBtn} border-white/30 bg-white/10 text-white transition hover:bg-white/20`}
                  >
                    {detailDownloadBusy ? <IconSpinner /> : <IconDownload />}
                  </button>
                ) : null}
                {detailInvoice?.edocIrn?.trim() ? (
                  <button
                    type="button"
                    disabled={gstEinvoiceBusy}
                    onClick={() => void handleOpenGstEinvoice()}
                    aria-label="Download GST e-invoice"
                    title={
                      gstEinvoicePdfUrl
                        ? "Download GST e-invoice (IRP PDF)"
                        : "Open GST e-invoice PDF from IRP"
                    }
                    className={`${invoicePreviewIconBtn} border-rlx-gold/50 bg-rlx-gold text-rlx-green-deep transition hover:bg-rlx-gold-dark disabled:opacity-50`}
                  >
                    {gstEinvoiceBusy ? <IconSpinner /> : <IconGstEinvoice />}
                  </button>
                ) : null}
                {detailInvoice && apiMode ? (
                  <>
                    {quickBillNeedsEinvoiceRetry(
                      {
                        customerType: detailInvoice.customerType,
                        edocIrn: detailInvoice.edocIrn,
                        edocStatus: detailInvoice.edocStatus,
                      },
                      edocEnabled,
                    ) ? (
                      <button
                        type="button"
                        disabled={edocBusyId === detailInvoice.id}
                        onClick={() => void retryEinvoice(selected)}
                        className={`${invoicePreviewIconBtn} border-amber-300/70 bg-amber-600 text-white transition hover:bg-amber-700 disabled:opacity-50`}
                        title="Retry e-invoice"
                        aria-label="Retry e-invoice"
                      >
                        {edocBusyId === detailInvoice.id ? <IconSpinner /> : <IconGstEinvoice />}
                      </button>
                    ) : null}
                    <SendInvoiceEmailButton
                      email={detailInvoice.email ?? ""}
                      customerName={
                        detailInvoice.customerType === "B2B"
                          ? detailInvoice.company ?? detailInvoice.customerName ?? "Customer"
                          : detailInvoice.customerName ?? "Customer"
                      }
                      invoiceNumber={detailInvoice.invoiceNumber || detailInvoice.billNumber}
                      totalInr={detailInvoice.totalInr}
                      disabled={!detailInvoiceVm}
                      label="Send email"
                      busyLabel="Sending…"
                      iconOnly
                      className={`${invoicePreviewIconBtn} border-sky-300/70 bg-sky-600 text-white transition hover:bg-sky-700`}
                      onResult={(msg) => setWhatsappNote(msg)}
                      resolvePdfBlob={resolveDetailInvoicePdfBlob}
                    />
                    <SendInvoiceWhatsAppButton
                      phone={detailInvoice.phone ?? ""}
                      customerName={
                        detailInvoice.customerType === "B2B"
                          ? detailInvoice.company ?? detailInvoice.customerName ?? "Customer"
                          : detailInvoice.customerName ?? "Customer"
                      }
                      invoiceNumber={detailInvoice.invoiceNumber || detailInvoice.billNumber}
                      disabled={!detailInvoiceVm}
                      label="Resend WhatsApp"
                      busyLabel="Sending…"
                      iconOnly
                      className={`${invoicePreviewIconBtn} border-emerald-300/70 bg-emerald-600 text-white transition hover:bg-emerald-700`}
                      onResult={(msg) => setWhatsappNote(msg)}
                      resolvePdfBlob={resolveDetailInvoicePdfBlob}
                    />
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close preview"
                  title="Close"
                  className={`${invoicePreviewIconBtn} border-white/30 bg-white/10 text-white transition hover:bg-white/20`}
                >
                  <IconClose />
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
              {whatsappNote ? (
                <div className="mb-5 border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 print:hidden">
                  {whatsappNote}
                </div>
              ) : null}
              {detailInvoice?.customerType === "B2B" && edocEnabled && !detailInvoice.edocIrn?.trim() ? (
                <div
                  className={`mb-5 border-l-4 px-4 py-3 text-sm print:hidden ${
                    detailInvoice.edocStatus === "FAILED"
                      ? "border-red-500 bg-red-50 text-red-900"
                      : detailInvoice.edocStatus === "PENDING"
                        ? "border-sky-500 bg-sky-50 text-sky-950"
                        : "border-amber-500 bg-amber-50 text-amber-950"
                  }`}
                >
                  {detailInvoice.edocStatus === "FAILED" || detailInvoice.edocStatus === "PENDING" ? (
                    <>
                      <strong>
                        {detailInvoice.edocStatus === "PENDING"
                          ? "E-invoice pending"
                          : "E-invoice not generated"}
                      </strong>
                      <p className="mt-1 text-xs break-all">
                        {detailInvoice.edocError ?? "IRP error."}
                      </p>
                      <p className="mt-2 text-xs opacity-90">
                        Use <strong>Retry e-invoice</strong> above — the app retries up to 3 times when the sandbox is
                        slow.
                      </p>
                    </>
                  ) : (
                    <span>E-invoice not generated yet for this B2B bill.</span>
                  )}
                </div>
              ) : null}
              {detailInvoice?.edocIrn?.trim() ? (
                <div className="mb-5 border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 print:hidden">
                  <strong>E-invoice registered.</strong> IRN:{" "}
                  <span className="font-mono break-all">{detailInvoice.edocIrn}</span>
                  {detailInvoice.edocAckNo ? <> · Ack: {detailInvoice.edocAckNo}</> : null}
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
