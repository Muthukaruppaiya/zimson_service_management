import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ServiceInvoiceTemplate } from "../../components/service/ServiceInvoiceTemplate";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useCustomers } from "../../context/CustomersContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { canAccessModule } from "../../config/moduleAccess";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { downloadServiceInvoicePdfFromPage, triggerBlobDownload } from "../../lib/captureInvoicePdf";
import { phoneLast10 } from "../../lib/customerLookup";
import {
  buildInterHoRepairInvoiceViewModel,
  interHoInvoicePdfFilename,
} from "../../lib/interHoBillingInvoice";
import { resolveSellerStateCode } from "../../lib/gstSupply";
import { printServiceInvoice } from "../../lib/printServiceInvoice";
import { captureInvoicePdfFromViewModel } from "../../lib/renderInvoiceForPdf";
import { computeServiceBillGst } from "../../lib/serviceBillGst";
import type { CustomerRecord } from "../../types/customer";
import type { QuickBillEdocInfo } from "../../types/quickBill";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";

type Phase = "name" | "phone" | "match" | "bill" | "done";

type LineItem = {
  id: string;
  description: string;
  qty: string;
  rate: string;
  spareId?: string;
  orderLineId?: string;
  gstPercent?: string;
  hsn?: string;
};
type OnlineOrderPrefill = {
  id: string;
  orderNumber: string;
  srfReference: string;
  fromRegionName: string;
  toRegionName: string;
  customerName: string | null;
  customerPhone: string | null;
  watchBrand: string | null;
  watchModel: string | null;
  serial: string | null;
  complaint: string | null;
  lines: Array<{
    id: string;
    spareId: string;
    spareName: string;
    qty: number;
    unitPriceInr: number;
  }>;
};

type InterHoSrfInvoicePrefill = {
  id: string;
  reference: string;
  customerName: string;
  watchBrand: string;
  watchModel: string;
  serial: string;
  complaint: string;
  fromRegionId: string;
  fromRegionName: string;
  toRegionId: string;
  toRegionName: string;
  status: string;
  usedSpares: Array<{
    spareId?: string | null;
    name: string;
    qty: number;
    unitPriceInr?: number | null;
    gstPercent?: number | null;
    hsn?: string | null;
  }>;
};

function emptyLine(): LineItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    description: "",
    qty: "1",
    rate: "",
    spareId: undefined,
  };
}

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

function nextBillRef() {
  return `BILL-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
}

export function ServiceBillingPage() {
  const apiMode = useApiMode();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { lookup, getById } = useCustomers();
  const { regions } = useRegions();
  const { spares } = useSpares();

  const [phase, setPhase] = useState<Phase>("name");
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [taxPercent, setTaxPercent] = useState("18");
  const [pricesTaxInclusive, setPricesTaxInclusive] = useState(false);
  const [defaultSacHsn, setDefaultSacHsn] = useState("9987");
  const [serviceTaxSettings, setServiceTaxSettings] = useState<ServiceTaxSettings | null>(null);
  const [billRef, setBillRef] = useState<string | null>(null);
  const [onlineOrder, setOnlineOrder] = useState<OnlineOrderPrefill | null>(null);
  const [interHoSrfInvoice, setInterHoSrfInvoice] = useState<InterHoSrfInvoicePrefill | null>(null);
  const [interHoInvoicePreviewOpen, setInterHoInvoicePreviewOpen] = useState(false);
  const [interHoInvoicePdfBusy, setInterHoInvoicePdfBusy] = useState(false);
  const [interHoEdoc, setInterHoEdoc] = useState<QuickBillEdocInfo | null>(null);

  const customerIdParam = searchParams.get("customerId");
  const onlineOrderIdParam = searchParams.get("onlineOrderId");
  const srfIdParam = searchParams.get("srfId");
  const invoiceForParam = searchParams.get("invoiceFor");
  const isOnlineOrderFlow = Boolean(onlineOrderIdParam);
  const isInterHoSrfInvoiceFlow = Boolean(srfIdParam && invoiceForParam === "sender-ho");

  useEffect(() => {
    if (!customerIdParam) return;
    const c = getById(customerIdParam);
    if (c) {
      setSelectedCustomer(c);
      setPhase("bill");
      setLookupNote(null);
      setError(null);
    }
  }, [customerIdParam, getById]);

  useEffect(() => {
    if (!onlineOrderIdParam) return;
    let cancelled = false;
    void (async () => {
      try {
        const out = await apiJson<{ rows: OnlineOrderPrefill[] }>(
          `/api/service/inter-ho-spare-orders?orderId=${encodeURIComponent(onlineOrderIdParam)}`,
        );
        const order = out.rows[0] ?? null;
        if (cancelled) return;
        if (!order) {
          setError("Online spare order not found.");
          return;
        }
        setOnlineOrder(order);
        setLines(
          order.lines.map((l) => ({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            spareId: l.spareId,
            orderLineId: l.id,
            description: l.spareName,
            qty: String(Number(l.qty || 0)),
            rate: String(Number(l.unitPriceInr || 0)),
          })),
        );
        setSelectedCustomer({
          id: `ONLINE-${order.id}`,
          displayName: order.customerName?.trim() || "Walk-in customer",
          phone: order.customerPhone?.trim() || "-",
          email: "",
          customerKind: "B2C",
          createdAt: new Date().toISOString(),
        });
        setPhase("bill");
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load online spare order.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onlineOrderIdParam]);

  useEffect(() => {
    if (!isInterHoSrfInvoiceFlow || !srfIdParam) return;
    let cancelled = false;
    void (async () => {
      try {
        const out = await apiJson<InterHoSrfInvoicePrefill>(
          `/api/service/srf-jobs/${encodeURIComponent(srfIdParam)}/inter-ho-invoice-prefill`,
        );
        if (cancelled) return;
        setInterHoSrfInvoice(out);
        const senderHoLabel = `${out.toRegionName} HO`;
        setSelectedCustomer({
          id: `HO-${out.toRegionId}`,
          displayName: senderHoLabel,
          phone: "-",
          email: "",
          customerKind: "B2B",
          company: senderHoLabel,
          createdAt: new Date().toISOString(),
        });
        const prefillLines = (out.usedSpares ?? []).map((l) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          spareId: l.spareId?.trim() || undefined,
          description: l.name,
          qty: String(Number(l.qty || 0)),
          rate: String(Number(l.unitPriceInr || 0)),
          gstPercent: l.gstPercent != null && Number.isFinite(Number(l.gstPercent)) ? String(l.gstPercent) : undefined,
          hsn: l.hsn?.trim() || undefined,
        }));
        setLines(prefillLines.length > 0 ? prefillLines : [emptyLine()]);
        setPhase("bill");
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load inter-HO SRF invoice prefill.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isInterHoSrfInvoiceFlow, srfIdParam]);

  useEffect(() => {
    if (!apiMode) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<{ settings: ServiceTaxSettings }>("/api/settings/tax");
        if (cancelled) return;
        setServiceTaxSettings(data.settings);
        setTaxPercent(String(data.settings.gstRatePercent));
        setPricesTaxInclusive(data.settings.pricesTaxInclusive);
        setDefaultSacHsn(data.settings.defaultSacHsn.trim() || "9987");
      } catch (e) {
        if (!cancelled && e instanceof ApiError && e.status !== 401) {
          /* keep local defaults */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiMode]);

  function goRegisterNew(reason: "new" | "choice" = "new") {
    const q = new URLSearchParams();
    if (draftName.trim()) q.set("name", draftName.trim());
    if (draftPhone.trim()) q.set("phone", draftPhone.trim());
    if (reason === "new") q.set("reason", "new");
    navigate(`/service/billing/register?${q.toString()}`);
  }

  function handleNameNext(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!draftName.trim()) {
      setError("Enter the customer name to continue.");
      return;
    }
    setPhase("phone");
  }

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLookupNote(null);
    if (!draftPhone.trim()) {
      setError("Enter the mobile number to look up the customer.");
      return;
    }
    if (phoneLast10(draftPhone).length !== 10) {
      setError("Enter a valid 10-digit mobile number (with or without country code).");
      return;
    }

    const result = lookup(draftName, draftPhone);
    if (result.status === "found") {
      setSelectedCustomer(result.customer);
      setLookupNote(null);
      setPhase("match");
      return;
    }
    if (result.status === "phone_exists") {
      setSelectedCustomer(result.customer);
      setLookupNote(
        `This mobile number is already on file for “${result.customer.displayName}”. Continue with that profile — duplicate registration is not allowed.`,
      );
      setPhase("match");
      return;
    }

    goRegisterNew("new");
  }

  function useFetchedCustomer() {
    if (!selectedCustomer) return;
    setError(null);
    setPhase("bill");
    setSearchParams({ customerId: selectedCustomer.id });
  }

  function restartLookup() {
    if (isOnlineOrderFlow) {
      navigate("/service-centre/online-store");
      return;
    }
    if (isInterHoSrfInvoiceFlow) {
      if (location.pathname.startsWith("/service-centre/inter-ho-invoice")) {
        navigate("/service-centre/supervisor");
        return;
      }
      navigate("/service-centre/online-store");
      return;
    }
    setSelectedCustomer(null);
    setPhase("name");
    setDraftName("");
    setDraftPhone("");
    setLookupNote(null);
    setError(null);
    setLines([emptyLine()]);
    setBillRef(null);
    setInterHoInvoicePreviewOpen(false);
    setSearchParams({});
  }

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  }

  const lineTotal = lines.reduce((sum, l) => {
    const q = Number.parseFloat(l.qty) || 0;
    const r = Number.parseFloat(l.rate) || 0;
    return sum + q * r;
  }, 0);

  const interHoGst = useMemo(() => {
    if (!isInterHoSrfInvoiceFlow || !interHoSrfInvoice) return null;
    const billLines = lines
      .map((l) => {
        const q = Number.parseFloat(l.qty) || 0;
        const r = Number.parseFloat(l.rate) || 0;
        return {
          amountInr: q * r,
          spareId: l.spareId,
          hsnSac: l.hsn,
        };
      })
      .filter((l) => l.amountInr > 0);
    if (billLines.length === 0) return null;

    const repairRegion = regions.find((r) => r.id === interHoSrfInvoice.fromRegionId);
    const senderRegion = regions.find((r) => r.id === interHoSrfInvoice.toRegionId);
    const sellerState = resolveSellerStateCode(repairRegion?.gst);
    const customerState = resolveSellerStateCode(senderRegion?.gst, sellerState);

    return computeServiceBillGst({
      lines: billLines,
      defaultHsnSac: defaultSacHsn,
      spareGstLookup: (spareId) => {
        const line = lines.find((l) => l.spareId === spareId);
        if (line?.gstPercent?.trim()) {
          const n = Number.parseFloat(line.gstPercent);
          if (Number.isFinite(n)) return n;
        }
        const spare = spares.find((s) => s.id === spareId);
        return spare?.gstPercent ?? null;
      },
      defaultSacGstPercent: Number.parseFloat(taxPercent) || 18,
      pricesTaxInclusive: false,
      sellerStateCode: sellerState,
      customerStateCode: customerState,
      billTotalInr: billLines.reduce((sum, l) => sum + l.amountInr, 0),
    });
  }, [
    isInterHoSrfInvoiceFlow,
    interHoSrfInvoice,
    lines,
    regions,
    spares,
    defaultSacHsn,
    taxPercent,
  ]);

  const taxPct = Number.parseFloat(taxPercent) || 0;
  let taxableValue: number;
  let taxAmt: number;
  let grandTotal: number;
  let cgstAmt: number;
  let sgstAmt: number;

  if (interHoGst) {
    taxableValue = interHoGst.grossTaxable;
    taxAmt = interHoGst.totalTax;
    grandTotal = interHoGst.netPayable;
    cgstAmt = interHoGst.cgst;
    sgstAmt = interHoGst.sgst;
  } else if (pricesTaxInclusive) {
    const divisor = 1 + taxPct / 100;
    taxableValue = divisor > 0 ? lineTotal / divisor : lineTotal;
    taxAmt = Math.max(0, lineTotal - taxableValue);
    grandTotal = lineTotal;
  } else {
    taxableValue = lineTotal;
    taxAmt = (taxableValue * taxPct) / 100;
    grandTotal = lineTotal + taxAmt;
    cgstAmt = taxPct > 0 ? taxAmt / 2 : 0;
    sgstAmt = taxPct > 0 ? taxAmt - cgstAmt : 0;
  }
  const canOpenTaxSettings = user ? canAccessModule(user, "settings") : false;

  const interHoInvoicePrintIdPrefix = useMemo(
    () => `inter-ho-${(billRef ?? "draft").replace(/[^\w]/g, "").slice(0, 16)}`,
    [billRef],
  );

  const recordedInterHoInvoiceVm = useMemo(() => {
    if (!interHoSrfInvoice || !billRef || !selectedCustomer) return null;
    const repairRegion = regions.find((r) => r.id === interHoSrfInvoice.fromRegionId);
    const senderRegion = regions.find((r) => r.id === interHoSrfInvoice.toRegionId);
    return buildInterHoRepairInvoiceViewModel({
      billRef,
      interHo: interHoSrfInvoice,
      lines,
      billToName: selectedCustomer.displayName,
      repairRegion,
      senderRegion,
      taxSettings: serviceTaxSettings,
      defaultSacHsn,
      spareGstFallback: (spareId) => {
        const spare = spares.find((s) => s.id === spareId);
        return spare?.gstPercent ?? null;
      },
      generatedBy: user?.displayName ?? null,
      grandTotal,
      edocIrn: interHoEdoc?.irn,
      edocAckNo: interHoEdoc?.ackNo,
      edocQr: interHoEdoc?.qrUrl,
    });
  }, [
    interHoSrfInvoice,
    billRef,
    selectedCustomer,
    regions,
    lines,
    serviceTaxSettings,
    defaultSacHsn,
    spares,
    user?.displayName,
    grandTotal,
    interHoEdoc,
  ]);

  const gstNoteLabel = interHoGst
    ? "GST per spare (catalogue rates)"
    : pricesTaxInclusive
      ? "rates tax-inclusive"
      : `${taxPct}% GST on taxable value`;

  const downloadInterHoInvoicePdf = useCallback(
    async (fromPreview = false) => {
      if (!recordedInterHoInvoiceVm || !billRef) return;
      setInterHoInvoicePdfBusy(true);
      try {
        const filename = interHoInvoicePdfFilename(billRef);
        if (fromPreview) {
          await downloadServiceInvoicePdfFromPage(filename);
          return;
        }
        const blob = await captureInvoicePdfFromViewModel(
          recordedInterHoInvoiceVm,
          interHoInvoicePrintIdPrefix,
        );
        triggerBlobDownload(blob, filename);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not download invoice PDF.");
      } finally {
        setInterHoInvoicePdfBusy(false);
      }
    },
    [recordedInterHoInvoiceVm, billRef, interHoInvoicePrintIdPrefix],
  );

  async function recordBill(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedCustomer) return;
    const validLines = lines.filter((l) => {
      const q = Number.parseFloat(l.qty) || 0;
      const r = Number.parseFloat(l.rate) || 0;
      if (isOnlineOrderFlow || isInterHoSrfInvoiceFlow) {
        return l.description.trim() && q > 0 && r > 0;
      }
      return l.description.trim() && q > 0 && r >= 0;
    });
    if (validLines.length === 0) {
      setError(
        isOnlineOrderFlow || isInterHoSrfInvoiceFlow
          ? "Add at least one line with description, quantity, and invoice rate (> 0)."
          : "Add at least one line with description, quantity, and rate.",
      );
      return;
    }
    const generatedRef = nextBillRef();
    try {
      if (onlineOrder && onlineOrderIdParam) {
        await apiJson(`/api/service/inter-ho-spare-orders/${encodeURIComponent(onlineOrderIdParam)}/fulfill`, {
          method: "POST",
          json: {
            invoiceRef: generatedRef,
            note: "Invoice created from HO billing page.",
            lines: validLines
              .filter((l) => !!l.spareId || !!l.orderLineId)
              .map((l) => ({
                lineId: l.orderLineId ? String(l.orderLineId) : undefined,
                spareId: String(l.spareId),
                qty: Number.parseFloat(l.qty) || 0,
                unitPriceInr: Number.parseFloat(l.rate) || 0,
              })),
          },
        });
      }
      if (interHoSrfInvoice && srfIdParam && invoiceForParam === "sender-ho") {
        const interHoOut = await apiJson<{ ok: boolean; edoc?: QuickBillEdocInfo | null }>(
          `/api/service/srf-jobs/${encodeURIComponent(srfIdParam)}/inter-ho-invoice`,
          {
            method: "POST",
            json: {
              invoiceRef: generatedRef,
              note: "Repair HO invoice created against sender HO.",
              totalInr: grandTotal,
              taxJson: interHoGst
                ? {
                    grossTaxable: interHoGst.grossTaxable,
                    totalTax: interHoGst.totalTax,
                    cgst: interHoGst.cgst,
                    sgst: interHoGst.sgst,
                    igst: interHoGst.igst,
                  }
                : undefined,
            },
          },
        );
        setInterHoEdoc(interHoOut.edoc ?? null);
      }
      setBillRef(generatedRef);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create invoice.");
    }
  }

  if (phase === "done" && billRef && selectedCustomer) {
    return (
      <div>
        <div className={recordedInterHoInvoiceVm ? "print:hidden" : undefined}>
        <ServiceBreadcrumb current="Billing" />
        <Card title="Bill recorded" subtitle="Billing completed successfully">
          <p className="text-sm text-stone-600">
            Reference <span className="font-mono font-bold text-zimson-900">{billRef}</span>
          </p>
          <p className="mt-2 text-sm text-stone-600">
            Bill to: <strong>{selectedCustomer.displayName}</strong> · {selectedCustomer.phone}
          </p>
          {onlineOrder ? (
            <p className="mt-2 text-sm text-emerald-700">
              Online order {onlineOrder.orderNumber} invoiced. It is now in sender HO ODC pending queue.
            </p>
          ) : null}
          {interHoSrfInvoice ? (
            <p className="mt-2 text-sm text-emerald-700">
              Inter-HO repair invoice recorded for SRF {interHoSrfInvoice.reference}. Logistics can now dispatch return to sender HO.
            </p>
          ) : null}
          {interHoSrfInvoice && interHoEdoc ? (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                interHoEdoc.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : interHoEdoc.skipped
                    ? "border-stone-200 bg-stone-50 text-stone-800"
                    : "border-amber-200 bg-amber-50 text-amber-950"
              }`}
            >
              {interHoEdoc.ok ? (
                <p>
                  <strong>GST e-invoice registered.</strong> IRN:{" "}
                  <span className="font-mono break-all">{interHoEdoc.irn}</span>
                  {interHoEdoc.ackNo ? <> · Ack: {interHoEdoc.ackNo}</> : null}
                </p>
              ) : interHoEdoc.skipped ? (
                <p>
                  <strong>E-invoice skipped:</strong> {interHoEdoc.skipReason ?? "Not applicable."}
                </p>
              ) : (
                <p>
                  <strong>E-invoice not generated:</strong>{" "}
                  {interHoEdoc.error ?? interHoEdoc.skipReason ?? "IRP error."} Invoice is saved — generate IRN from{" "}
                  <Link to="/accounts/invoice-history" className="font-semibold underline">
                    Invoice history
                  </Link>{" "}
                  before payment.
                </p>
              )}
            </div>
          ) : null}
          <p className="mt-2 text-sm text-stone-600">
            Taxable value:{" "}
            <span className="font-semibold text-stone-900">
              {taxableValue.toLocaleString(undefined, { style: "currency", currency: "INR" })}
            </span>
            {taxPct > 0 ? (
              <>
                {" "}
                · CGST {cgstAmt.toLocaleString(undefined, { style: "currency", currency: "INR" })} · SGST{" "}
                {sgstAmt.toLocaleString(undefined, { style: "currency", currency: "INR" })}
              </>
            ) : null}
          </p>
          <p className="mt-2 text-lg font-semibold text-stone-900">
            Total: {grandTotal.toLocaleString(undefined, { style: "currency", currency: "INR" })}{" "}
            <span className="text-sm font-normal text-stone-500">({gstNoteLabel})</span>
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {recordedInterHoInvoiceVm ? (
              <>
                <button
                  type="button"
                  onClick={() => setInterHoInvoicePreviewOpen(true)}
                  className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
                >
                  Preview invoice
                </button>
                <button
                  type="button"
                  onClick={() => printServiceInvoice()}
                  className="rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
                >
                  Print invoice
                </button>
                <button
                  type="button"
                  disabled={interHoInvoicePdfBusy}
                  onClick={() => void downloadInterHoInvoicePdf(false)}
                  className="rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50 disabled:opacity-50"
                >
                  {interHoInvoicePdfBusy ? "Preparing PDF…" : "Download PDF"}
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={restartLookup}
              className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              New bill
            </button>
            <Link
              to="/service"
              className="inline-flex items-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Service home
            </Link>
            {onlineOrder ? (
              <Link
                to="/service-centre/online-store"
                className="inline-flex items-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
              >
                Back to online store
              </Link>
            ) : null}
            {canOpenTaxSettings ? (
              <Link
                to="/settings/tax"
                className="inline-flex items-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
              >
                Tax settings
              </Link>
            ) : null}
          </div>
        </Card>
        </div>

        {recordedInterHoInvoiceVm && !interHoInvoicePreviewOpen ? (
          <div className="hidden print:block" aria-hidden>
            <ServiceInvoiceTemplate data={recordedInterHoInvoiceVm} idPrefix={interHoInvoicePrintIdPrefix} />
          </div>
        ) : null}

        {recordedInterHoInvoiceVm && interHoInvoicePreviewOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-rlx-ink/70 backdrop-blur-sm sm:items-center sm:p-4 print:static print:inset-auto print:z-0 print:bg-white print:p-0 print:backdrop-blur-none">
            <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.5)] print:max-h-none print:max-w-none print:shadow-none">
              <div className="sticky top-0 z-20 flex flex-col gap-3 bg-rlx-green px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 print:hidden">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.45em] text-rlx-gold">Invoice preview</p>
                  <h3 className="truncate font-sans text-xl font-semibold tracking-normal text-white sm:text-2xl">
                    {billRef}
                  </h3>
                  <p className="mt-0.5 text-xs text-white/60">
                    SRF {interHoSrfInvoice?.reference} · Bill to {selectedCustomer.displayName}
                  </p>
                </div>
                <div className="flex flex-wrap items-stretch gap-2 sm:items-center">
                  <button
                    type="button"
                    onClick={() => printServiceInvoice()}
                    className="flex-1 bg-rlx-gold px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-rlx-green-deep transition hover:bg-rlx-gold-dark sm:flex-none sm:px-5"
                  >
                    Print
                  </button>
                  <button
                    type="button"
                    disabled={interHoInvoicePdfBusy}
                    onClick={() => void downloadInterHoInvoicePdf(true)}
                    className="flex-1 border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white/20 disabled:opacity-50 sm:flex-none sm:px-5"
                  >
                    {interHoInvoicePdfBusy ? "Preparing…" : "Download PDF"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInterHoInvoicePreviewOpen(false)}
                    className="flex-1 border border-white/20 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white/80 transition hover:bg-white/10 sm:flex-none sm:px-5"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="p-6 md:p-8">
                <div className="border border-rlx-rule print:border-0">
                  <ServiceInvoiceTemplate data={recordedInterHoInvoiceVm} idPrefix={`${interHoInvoicePrintIdPrefix}-preview`} />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <ServiceBreadcrumb current="Billing" />
      <PageHeader
        title="Billing"
        description={
          onlineOrder
            ? `Sender HO invoice mode for ${onlineOrder.orderNumber} (${onlineOrder.srfReference}).`
            : interHoSrfInvoice
              ? `Inter-HO invoice (receiver HO billing against sender HO) for SRF ${interHoSrfInvoice.reference} (${interHoSrfInvoice.toRegionName}).`
            : "Customer lookup (name → mobile), then line items — aligned with quick bill and SRF at the counter. No separate invoicing module."
        }
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {isInterHoSrfInvoiceFlow ? (
              <Link
                to="/service-centre/supervisor"
                className="inline-flex rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-100"
              >
                Back to supervisor
              </Link>
            ) : null}
            <Link
              to="/service/quick-bill"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Quick bill
            </Link>
            <Link
              to="/service/srf"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              New SRF
            </Link>
            <Link
              to="/service/billing"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Billing home
            </Link>
            {canOpenTaxSettings ? (
              <Link
                to="/settings/tax"
                className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
              >
                Tax &amp; billing
              </Link>
            ) : null}
          </div>
        }
      />

      {!isOnlineOrderFlow && !isInterHoSrfInvoiceFlow ? (
        <div className="mb-8 flex gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          <span className={phase === "name" ? "text-zimson-800" : ""}>1. Name</span>
          <span aria-hidden>→</span>
          <span className={phase === "phone" ? "text-zimson-800" : ""}>2. Mobile</span>
          <span aria-hidden>→</span>
          <span className={phase === "match" ? "text-zimson-800" : ""}>3. Confirm</span>
          <span aria-hidden>→</span>
          <span className={phase === "bill" ? "text-zimson-800" : ""}>4. Bill</span>
        </div>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      ) : null}

      {phase === "name" ? (
        <Card title="Step 1 — Customer name" subtitle="Who is this bill for?">
          <form onSubmit={handleNameNext} className="space-y-4">
            <div>
              <label htmlFor="bill-name" className="text-xs font-medium text-stone-600">
                Full name
              </label>
              <input
                id="bill-name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Rajesh Kumar"
                autoComplete="name"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Continue
            </button>
          </form>
        </Card>
      ) : null}

      {phase === "phone" ? (
        <Card title="Step 2 — Mobile number" subtitle={`Looking up: ${draftName.trim() || "—"}`}>
          <form onSubmit={handleLookup} className="space-y-4">
            <p className="text-sm text-stone-600">
              We use the mobile number to detect an <strong>existing</strong> customer. If none is found,
              you will be redirected to <strong>customer registration</strong>.
            </p>
            <div>
              <label htmlFor="bill-phone" className="text-xs font-medium text-stone-600">
                Mobile number
              </label>
              <input
                id="bill-phone"
                value={draftPhone}
                onChange={(e) => setDraftPhone(e.target.value)}
                className={inputClass}
                placeholder="+91 98765 43210"
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
              >
                Look up customer
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase("name");
                  setError(null);
                }}
                className="rounded-xl border border-zimson-400 bg-white px-5 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
              >
                Back
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      {phase === "match" && selectedCustomer ? (
        <Card title="Step 3 — Customer on file" subtitle="Fetched from customer directory">
          {lookupNote ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {lookupNote}
            </div>
          ) : (
            <p className="mb-4 text-sm text-emerald-800">
              Matching customer found — details below. Continue to build the bill.
            </p>
          )}
          <dl className="grid gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/50 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-stone-500">Name</dt>
              <dd className="font-semibold text-stone-900">{selectedCustomer.displayName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">Mobile</dt>
              <dd className="text-stone-800">{selectedCustomer.phone}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">Email</dt>
              <dd className="text-stone-800">{selectedCustomer.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">Type</dt>
              <dd className="text-stone-800">{selectedCustomer.customerKind}</dd>
            </div>
            {selectedCustomer.customerKind === "B2B" ? (
              <>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-stone-500">Company</dt>
                  <dd className="text-stone-800">{selectedCustomer.company ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-stone-500">GSTIN</dt>
                  <dd className="font-mono text-stone-800">{selectedCustomer.gst ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-stone-500">PAN</dt>
                  <dd className="font-mono text-stone-800">{selectedCustomer.pan ?? "—"}</dd>
                </div>
              </>
            ) : null}
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={useFetchedCustomer}
              className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Continue to bill
            </button>
            <button
              type="button"
              onClick={restartLookup}
              className="text-sm font-medium text-stone-600 underline decoration-zimson-300 underline-offset-2 hover:text-stone-900"
            >
              Start over
            </button>
          </div>
        </Card>
      ) : null}

      {phase === "bill" && selectedCustomer ? (
        <>
          {onlineOrder ? (
            <Card title="Sender SRF details" subtitle="Fetched from requested SRF for invoice validation">
              <div className="grid gap-2 text-sm text-stone-700 sm:grid-cols-2">
                <p><span className="font-semibold text-stone-900">Order:</span> {onlineOrder.orderNumber}</p>
                <p><span className="font-semibold text-stone-900">SRF:</span> {onlineOrder.srfReference}</p>
                <p><span className="font-semibold text-stone-900">Flow:</span> {onlineOrder.fromRegionName} to {onlineOrder.toRegionName}</p>
                <p><span className="font-semibold text-stone-900">Customer:</span> {onlineOrder.customerName || "-"}</p>
                <p><span className="font-semibold text-stone-900">Watch:</span> {onlineOrder.watchBrand || "-"} {onlineOrder.watchModel || "-"}</p>
                <p><span className="font-semibold text-stone-900">Serial:</span> {onlineOrder.serial || "-"}</p>
                <p className="sm:col-span-2"><span className="font-semibold text-stone-900">Complaint:</span> {onlineOrder.complaint || "-"}</p>
              </div>
            </Card>
          ) : null}
          {interHoSrfInvoice ? (
            <Card title="Inter-HO SRF details" subtitle="Repair HO invoice against sender HO">
              <div className="grid gap-2 text-sm text-stone-700 sm:grid-cols-2">
                <p><span className="font-semibold text-stone-900">SRF:</span> {interHoSrfInvoice.reference}</p>
                <p><span className="font-semibold text-stone-900">Status:</span> {interHoSrfInvoice.status.replace(/_/g, " ")}</p>
                <p><span className="font-semibold text-stone-900">Flow:</span> {interHoSrfInvoice.fromRegionName} to {interHoSrfInvoice.toRegionName}</p>
                <p><span className="font-semibold text-stone-900">Customer:</span> {interHoSrfInvoice.customerName}</p>
                <p><span className="font-semibold text-stone-900">Watch:</span> {interHoSrfInvoice.watchBrand} {interHoSrfInvoice.watchModel}</p>
                <p><span className="font-semibold text-stone-900">Serial:</span> {interHoSrfInvoice.serial}</p>
                <p className="sm:col-span-2"><span className="font-semibold text-stone-900">Complaint:</span> {interHoSrfInvoice.complaint || "-"}</p>
              </div>
            </Card>
          ) : null}
          <Card title="Bill to" subtitle="Read-only from customer master">
            <p className="text-sm font-semibold text-stone-900">{selectedCustomer.displayName}</p>
            <p className="text-sm text-stone-600">
              {selectedCustomer.phone}
              {selectedCustomer.email ? ` · ${selectedCustomer.email}` : ""}
            </p>
            {selectedCustomer.customerKind === "B2B" ? (
              <p className="mt-2 text-xs text-stone-500">
                {selectedCustomer.company} · GST {selectedCustomer.gst} · PAN {selectedCustomer.pan}
              </p>
            ) : null}
            <button
              type="button"
              onClick={restartLookup}
              className="mt-3 text-xs font-medium text-zimson-800 underline"
            >
              {isOnlineOrderFlow ? "Back to online store" : "Change customer"}
            </button>
          </Card>

          <form onSubmit={recordBill} className="mt-6 space-y-6">
            <Card
              title="Line items"
              subtitle="Quantity × rate"
              action={
                isInterHoSrfInvoiceFlow ? null : (
                  <button
                    type="button"
                    onClick={addLine}
                    className="rounded-lg border border-zimson-400 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 shadow-sm hover:bg-zimson-50"
                  >
                    Add line
                  </button>
                )
              }
            >
              <div className="space-y-3">
                {lines.map((line) => (
                  <div
                    key={line.id}
                    className="grid gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-3 sm:grid-cols-12 sm:items-end"
                  >
                    <div className={isInterHoSrfInvoiceFlow ? "sm:col-span-4" : "sm:col-span-5"}>
                      <span className="text-xs font-medium text-stone-600">Description</span>
                      <input
                        value={line.description}
                        onChange={(e) => updateLine(line.id, { description: e.target.value })}
                        readOnly={isInterHoSrfInvoiceFlow}
                        className={inputClass}
                        placeholder="Service / part"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-xs font-medium text-stone-600">Qty</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.qty}
                        onChange={(e) => updateLine(line.id, { qty: e.target.value })}
                        readOnly={isInterHoSrfInvoiceFlow}
                        className={inputClass}
                      />
                    </div>
                    <div className={isInterHoSrfInvoiceFlow ? "sm:col-span-2" : "sm:col-span-3"}>
                      <span className="text-xs font-medium text-stone-600">Rate (INR)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.rate}
                        onChange={(e) => updateLine(line.id, { rate: e.target.value })}
                        readOnly={isInterHoSrfInvoiceFlow}
                        className={inputClass}
                      />
                    </div>
                    {isInterHoSrfInvoiceFlow ? (
                      <div className="sm:col-span-2">
                        <span className="text-xs font-medium text-stone-600">GST %</span>
                        <input
                          value={line.gstPercent?.trim() ? line.gstPercent : "—"}
                          readOnly
                          className={inputClass}
                        />
                      </div>
                    ) : null}
                    <div className={`${isInterHoSrfInvoiceFlow ? "sm:col-span-2" : "sm:col-span-2"} flex sm:justify-end`}>
                      {isInterHoSrfInvoiceFlow ? (
                        <span className="px-3 py-2 text-xs font-medium text-stone-400">Locked</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          disabled={lines.length <= 1}
                          className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {isInterHoSrfInvoiceFlow ? (
                <div className="mt-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px]">
                    <div>
                      <label className="text-xs font-medium text-stone-600">Tax (per spare GST from catalogue)</label>
                      <p className="mt-1 rounded-xl border border-zimson-200/80 bg-zimson-50/40 px-3 py-2.5 text-sm text-stone-700">
                        Each line uses the spare&apos;s GST % from Inventory (not the global 18% default).
                      </p>
                    </div>
                    <div className="rounded-xl border border-zimson-200/80 bg-zimson-50/40 p-3 text-sm">
                      <p className="flex items-center justify-between text-stone-600">
                        <span>Subtotal (excl GST)</span>
                        <span className="font-semibold text-stone-900">₹{taxableValue.toFixed(2)}</span>
                      </p>
                      {interHoGst?.igst ? (
                        <p className="mt-1 flex items-center justify-between text-stone-600">
                          <span>IGST</span>
                          <span className="font-semibold text-stone-900">₹{interHoGst.igst.toFixed(2)}</span>
                        </p>
                      ) : (
                        <>
                          <p className="mt-1 flex items-center justify-between text-stone-600">
                            <span>CGST</span>
                            <span className="font-semibold text-stone-900">₹{cgstAmt.toFixed(2)}</span>
                          </p>
                          <p className="mt-1 flex items-center justify-between text-stone-600">
                            <span>SGST</span>
                            <span className="font-semibold text-stone-900">₹{sgstAmt.toFixed(2)}</span>
                          </p>
                        </>
                      )}
                      <p className="mt-1 border-t border-zimson-200 pt-1.5 flex items-center justify-between font-bold text-zimson-900">
                        <span>Total</span>
                        <span>₹{grandTotal.toFixed(2)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
                    <table className="min-w-full text-sm">
                      <thead className="bg-zimson-50/70 text-xs font-semibold uppercase tracking-wide text-stone-600">
                        <tr>
                          <th className="px-3 py-2 text-left">GST %</th>
                          <th className="px-3 py-2 text-left">Taxable amount</th>
                          <th className="px-3 py-2 text-left">CGST</th>
                          <th className="px-3 py-2 text-left">SGST</th>
                          <th className="px-3 py-2 text-left">IGST</th>
                          <th className="px-3 py-2 text-left">Total tax</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(interHoGst?.taxRows ?? []).map((row, idx) => (
                          <tr key={`${row.description}-${idx}`} className="border-t border-zimson-100">
                            <td className="px-3 py-2 font-semibold text-zimson-900">{row.description}</td>
                            <td className="px-3 py-2">₹{row.taxable.toFixed(2)}</td>
                            <td className="px-3 py-2">₹{row.cgst.toFixed(2)}</td>
                            <td className="px-3 py-2">₹{row.sgst.toFixed(2)}</td>
                            <td className="px-3 py-2">₹{row.igst.toFixed(2)}</td>
                            <td className="px-3 py-2">₹{row.total.toFixed(2)}</td>
                          </tr>
                        ))}
                        {(interHoGst?.taxRows ?? []).length === 0 ? (
                          <tr className="border-t border-zimson-100">
                            <td className="px-3 py-2 text-stone-500" colSpan={6}>
                              No taxable lines.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-stone-500">
                    Example: ₹8,000 @ 14% + ₹12,000 @ 12% → total tax ₹2,560.00, invoice total ₹22,560.00.
                    Default SAC/HSN: <span className="font-mono">{defaultSacHsn}</span>
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-stone-600">Tax % (GST on taxable value)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={taxPercent}
                        onChange={(e) => setTaxPercent(e.target.value)}
                        className={inputClass}
                      />
                      {apiMode ? (
                        <p className="mt-1 text-xs text-stone-500">
                          Default loaded from organisation settings. Default SAC/HSN for invoices:{" "}
                          <span className="font-mono font-medium text-stone-700">{defaultSacHsn}</span>
                          {canOpenTaxSettings ? (
                            <>
                              {" "}
                              ·{" "}
                              <Link to="/settings/tax" className="font-medium text-zimson-800 underline">
                                Edit in Tax &amp; billing
                              </Link>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                    {pricesTaxInclusive ? (
                      <p className="rounded-lg bg-zimson-50 px-3 py-2 text-xs text-stone-700 ring-1 ring-zimson-200/80">
                        <strong>Tax-inclusive rates</strong> are on (from settings when API is on). Line totals include
                        GST; taxable value is backed out using the % above.
                      </p>
                    ) : (
                      <p className="text-xs text-stone-500">
                        Line rates are <strong>tax-exclusive</strong> unless changed in Tax &amp; billing settings.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col justify-end text-right text-sm">
                    <p className="text-stone-600">
                      {pricesTaxInclusive ? "Gross from lines (incl. GST)" : "Subtotal (excl. GST)"}{" "}
                      <span className="font-semibold text-stone-900">
                        {lineTotal.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                      </span>
                    </p>
                    {pricesTaxInclusive ? (
                      <p className="text-stone-600">
                        Taxable (backed out):{" "}
                        <span className="font-semibold text-stone-900">
                          {taxableValue.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                        </span>
                      </p>
                    ) : null}
                    {taxPct > 0 ? (
                      <>
                        <p className="text-stone-600">
                          CGST (½ of GST):{" "}
                          <span className="font-semibold text-stone-900">
                            {cgstAmt.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                          </span>
                        </p>
                        <p className="text-stone-600">
                          SGST (½ of GST):{" "}
                          <span className="font-semibold text-stone-900">
                            {sgstAmt.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                          </span>
                        </p>
                      </>
                    ) : null}
                    <p className="text-stone-600">
                      Total GST:{" "}
                      <span className="font-semibold text-stone-900">
                        {taxAmt.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                      </span>
                    </p>
                    <p className="mt-1 text-base font-bold text-zimson-900">
                      Total: {grandTotal.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                    </p>
                  </div>
                </div>
              )}
            </Card>

            {error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
              >
              {isOnlineOrderFlow || isInterHoSrfInvoiceFlow ? "Create invoice" : "Record bill"}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </div>
  );
}
