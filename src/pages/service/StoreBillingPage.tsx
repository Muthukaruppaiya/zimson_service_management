import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CustomerHandoverOtpModal,
  type HandoverOtpMode,
} from "../../components/service/CustomerHandoverOtpModal";
import { MultiPaymentFields } from "../../components/service/MultiPaymentFields";
import { ServiceInvoiceTemplate } from "../../components/service/ServiceInvoiceTemplate";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { SrfTraceModal } from "../../components/service/SrfTraceModal";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProcessSuccessModal } from "../../components/ui/ProcessSuccessModal";
import { useAuth } from "../../context/AuthContext";
import { useCustomers } from "../../context/CustomersContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson, ApiError } from "../../lib/api";
import { phoneLast10 } from "../../lib/customerLookup";
import { printServiceInvoice } from "../../lib/printServiceInvoice";
import { sendInvoiceWhatsApp } from "../../lib/sendInvoiceWhatsApp";
import { useMessagingSend } from "../../components/messaging/WhatsAppSendProvider";
import { invoiceWhatsAppResultMessage } from "../../lib/whatsappInvoiceUi";
import {
  autoInvoiceWhatsAppDedupKey,
  shouldAutoSendInvoiceWhatsApp,
} from "../../lib/invoiceWhatsAppAuto";
import { sendInvoiceEmail } from "../../lib/sendInvoiceEmail";
import { jobVisibleToStoreUser } from "../../lib/srfAccess";
import { computeServiceBillGst } from "../../lib/serviceBillGst";
import {
  resolveCustomerSupplyStateCode,
  resolveSellerStateCode,
} from "../../lib/gstSupply";
import { sanitizeDecimalInput } from "../../lib/inputSanitize";
import { formatInr } from "../../lib/formatInr";
import { customerPayableInr } from "../../lib/quickBillPayable";
import { billableServiceChargeInr } from "../../lib/natureOfRepair";
import {
  editorLinesBillableSubtotal,
  editorLinesToGstLines,
  editorLinesToInvoiceBillLines,
  usedSparesToEditorLines,
  type ServiceBillEditorLine,
} from "../../lib/serviceBillEditorLines";
import { ServiceBillLinesCard } from "../../components/service/ServiceBillLinesCard";
import {
  buildStoreBillingGstLines,
  type StoreBillingAdditionalCharge,
} from "../../lib/storeBillingGstPreview";
import {
  buildStoreBillingInvoiceFromClosedJob,
  buildStoreBillingSnapshot,
  buildStoreBillingInvoiceLines,
  resolveCustomerServiceBaseInr,
  resolveStoreBillingAmounts,
  sumUsedSparesInr,
} from "../../lib/storeBillingAmounts";
import { captureInvoicePdfFromViewModel } from "../../lib/renderInvoiceForPdf";
import type { CustomerRecord } from "../../types/customer";
import type { QuickBillEdocInfo } from "../../types/quickBill";
import {
  ADVANCE_CASH_DENOMS,
  buildMultiPaymentPayload,
  emptyMultiPaymentForm,
  validateMultiPaymentForm,
  type AdvancePaymentDetails,
} from "../../lib/paymentModes";
import type { ServiceInvoiceViewModel } from "../../types/serviceInvoice";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";
import { seedStoreToInvoiceProfile } from "../../types/storeInvoice";

type AdditionalChargeLine = {
  id: string;
  lineType: "charge" | "spare";
  description: string;
  spareId: string;
  qty: string;
  amount: string;
};

const billSuccessBtnBase =
  "inline-flex w-full min-w-0 items-center justify-center rounded-xl px-4 py-2.5 text-center text-sm font-semibold shadow-sm transition sm:w-auto";
const billSuccessBtnPrimary = `${billSuccessBtnBase} bg-zimson-600 text-white hover:bg-zimson-700`;
const billSuccessBtnSecondary = `${billSuccessBtnBase} border border-zimson-400 bg-white text-zimson-900 hover:bg-zimson-50`;
const billSuccessBtnOutline = `${billSuccessBtnBase} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`;

function customerAddressText(c: CustomerRecord | null): string {
  if (!c) return "";
  const b = c.billingAddress;
  if (b) {
    return [b.addressLine1, b.addressLine2, b.city, b.district, b.state, b.pincode]
      .map((p) => (p ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }
  return [c.address, c.city].map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
}

export function StoreBillingPage() {
  const { user } = useAuth();
  const { runWhatsAppSend, runEmailSend, whatsappSending, emailSending } = useMessagingSend();
  const { regions } = useRegions();
  const { customers } = useCustomers();
  const { activeSpares } = useSpares();
  const { jobs, closeWithInvoice } = useSrfJobs();
  const [serviceTaxSettings, setServiceTaxSettings] = useState<ServiceTaxSettings | null>(null);
  const [billingInvoiceVm, setBillingInvoiceVm] = useState<ServiceInvoiceViewModel | null>(null);
  const [billSuccessModalOpen, setBillSuccessModalOpen] = useState(false);
  const [billPostActionNote, setBillPostActionNote] = useState<string | null>(null);
  const [screenMode, setScreenMode] = useState<"select" | "invoice">("select");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [billingRefInput, setBillingRefInput] = useState("");
  const [scanSrfInput, setScanSrfInput] = useState("");
  const [billingSelectedId, setBillingSelectedId] = useState("");
  const [multiPaymentForm, setMultiPaymentForm] = useState(emptyMultiPaymentForm);
  const [paidAmountInput, setPaidAmountInput] = useState("");
  const [hoSparesBillRef, setHoSparesBillRef] = useState("");
  const [storeBillRef, setStoreBillRef] = useState("");
  const [handoverVerified, setHandoverVerified] = useState(false);
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [handoverModalMode, setHandoverModalMode] = useState<HandoverOtpMode>("primary");
  const [closingAfterOtp, setClosingAfterOtp] = useState(false);
  const [billingEdoc, setBillingEdoc] = useState<QuickBillEdocInfo | null>(null);
  const [closedSrfId, setClosedSrfId] = useState<string | null>(null);
  const [edocEnabled, setEdocEnabled] = useState(false);
  const [edocBusy, setEdocBusy] = useState(false);
  const [additionalChargeLines, setAdditionalChargeLines] = useState<AdditionalChargeLine[]>([
    { id: `${Date.now()}-charge`, lineType: "charge", description: "", spareId: "", qty: "1", amount: "" },
  ]);
  const [billLines, setBillLines] = useState<ServiceBillEditorLine[]>([]);
  const [serviceChargeInr, setServiceChargeInr] = useState("");
  const [billingStateInput, setBillingStateInput] = useState("");
  const [traceJobId, setTraceJobId] = useState<string | null>(null);
  const autoWhatsAppSentRef = useRef<string | null>(null);

  const currentUserStore = useMemo(() => {
    const sid = user?.storeId ?? "";
    if (!sid) return undefined;
    for (const r of regions) {
      const s = r.stores.find((x) => x.id === sid);
      if (s) return s;
    }
    return undefined;
  }, [regions, user?.storeId]);
  const storeInvoiceForPrint = useMemo(
    () => seedStoreToInvoiceProfile(currentUserStore),
    [currentUserStore],
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void apiJson<{ settings: ServiceTaxSettings }>("/api/settings/tax")
      .then((d) => {
        if (!cancelled) {
          setServiceTaxSettings(d.settings);
        }
      })
      .catch(() => {
        if (!cancelled) setServiceTaxSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    void apiJson<{ enabled?: boolean }>("/api/edoc/status")
      .then((d) => {
        if (!cancelled) setEdocEnabled(Boolean(d.enabled));
      })
      .catch(() => {
        if (!cancelled) setEdocEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const receivedAtStore = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => j.status === "received_at_store" && jobVisibleToStoreUser(j, user));
  }, [jobs, user]);

  const filteredInventory = useMemo(() => {
    const q = billingRefInput.trim().toLowerCase();
    if (!q) return receivedAtStore;
    return receivedAtStore.filter((j) => j.reference.toLowerCase().includes(q));
  }, [receivedAtStore, billingRefInput]);

  const billingJob = useMemo(() => {
    if (!billingSelectedId) return null;
    return receivedAtStore.find((j) => j.id === billingSelectedId) ?? null;
  }, [receivedAtStore, billingSelectedId]);

  const isRejectedNoRepairFlow = billingJob?.customerReestimateResponse === "rejected";
  const billingCustomer = useMemo(() => {
    if (!billingJob?.phone) return null;
    const p10 = phoneLast10(billingJob.phone);
    return customers.find((c) => phoneLast10(c.phone) === p10) ?? null;
  }, [billingJob?.phone, customers]);
  const billingCustomerEmail = billingCustomer?.email?.trim() ?? "";
  const billingCustomerKind = billingCustomer?.customerKind ?? billingJob?.customerKind ?? "B2C";
  const isB2BBilling = billingCustomerKind === "B2B";
  const billingCustomerGst = billingCustomer?.gst?.trim().toUpperCase() ?? "";
  const billingCustomerState =
    billingCustomer?.billingAddress?.state?.trim() ||
    billingCustomer?.city?.trim() ||
    "";
  const billingCustomerAddress = customerAddressText(billingCustomer);
  const invoiceSacHsn = serviceTaxSettings?.defaultSacHsn?.trim() || "9987";

  const spareGstLookup = useCallback(
    (spareId: string) => {
      const sp = activeSpares.find((s) => s.id === spareId);
      return sp?.gstPercent ?? null;
    },
    [activeSpares],
  );

  const spareHsnLookup = useCallback(
    (spareId: string) => {
      const sp = activeSpares.find((s) => s.id === spareId);
      return sp?.hsn?.trim() || null;
    },
    [activeSpares],
  );

  const billingAmounts = useMemo(
    () => (billingJob ? resolveStoreBillingAmounts(billingJob) : null),
    [billingJob],
  );
  const isBrandRepairFlow = billingAmounts?.isBrandRepair ?? false;
  const isInterHoReturnFlow = billingAmounts?.isInterHoReturn ?? false;
  const useQuickBillStyleLines = Boolean(billingJob && !isBrandRepairFlow && !isInterHoReturnFlow && !isRejectedNoRepairFlow);

  const spareOptions = useMemo(
    () =>
      activeSpares.map((s) => ({
        id: s.id,
        sku: s.sku,
        name: s.name,
        hsn: s.hsn?.trim() || null,
        gstPercent: s.gstPercent ?? null,
        price: Number(s.sellingPriceInr ?? s.mrpInr ?? 0),
      })),
    [activeSpares],
  );

  useEffect(() => {
    if (!billingJob || !useQuickBillStyleLines) {
      setBillLines([]);
      setServiceChargeInr("");
      setBillingStateInput("");
      return;
    }
    setBillLines(
      usedSparesToEditorLines(billingJob, (spareId) => {
        if (!spareId) return null;
        return activeSpares.find((s) => s.id === spareId)?.hsn?.trim() || null;
      }),
    );
    setServiceChargeInr("");
    setBillingStateInput(billingCustomerState);
  }, [billingJob?.id, useQuickBillStyleLines, billingCustomerState, activeSpares]);

  const serviceChargeBillable = useMemo(() => {
    const n = Number.parseFloat(serviceChargeInr);
    return billableServiceChargeInr(
      billingJob?.natureOfRepair,
      Number.isFinite(n) && n > 0 ? n : 0,
    );
  }, [serviceChargeInr, billingJob?.natureOfRepair]);

  const effectiveCustomerState = useQuickBillStyleLines ? billingStateInput : billingCustomerState;
  function getSpareUnitPrice(spareId: string): number {
    const spare = activeSpares.find((s) => s.id === spareId);
    return Number(spare?.sellingPriceInr ?? spare?.mrpInr ?? 0);
  }

  function getLineAmount(line: AdditionalChargeLine): number {
    if (line.lineType === "spare") {
      const unit = getSpareUnitPrice(line.spareId);
      const qty = Number.parseFloat(line.qty);
      if (!Number.isFinite(unit) || unit <= 0) return 0;
      if (!Number.isFinite(qty) || qty <= 0) return 0;
      return unit * qty;
    }
    const amt = Number.parseFloat(line.amount);
    return Number.isFinite(amt) && amt > 0 ? amt : 0;
  }

  const previewAdditionalCharges = useMemo((): StoreBillingAdditionalCharge[] => {
    return additionalChargeLines
      .map((line) => {
        if (line.lineType === "spare") {
          const spare = activeSpares.find((s) => s.id === line.spareId);
          const qty = Number.parseFloat(line.qty);
          const amt = getLineAmount(line);
          if (!spare || amt <= 0) return null;
          return {
            description: `Spare: ${spare.sku} - ${spare.name} x ${Number.isFinite(qty) && qty > 0 ? qty : 0}`,
            amountInr: amt,
            spareId: line.spareId,
          };
        }
        const amt = getLineAmount(line);
        if (amt <= 0) return null;
        const desc = line.description.trim() || "Service / labour charge";
        return { description: desc, amountInr: amt };
      })
      .filter((x): x is StoreBillingAdditionalCharge => x != null);
  }, [additionalChargeLines, activeSpares]);

  const additionalChargesTotal = previewAdditionalCharges.reduce((sum, line) => sum + line.amountInr, 0);
  const usedSparesAmountRaw = billingJob ? sumUsedSparesInr(billingJob) : 0;
  const sparesBillableAmount = billingAmounts?.usedSparesAmount ?? 0;
  const brandInvoiceAmount = isBrandRepairFlow ? Number(billingJob?.brandInvoiceAmountInr ?? 0) : 0;
  const repairBaseAmount = isBrandRepairFlow
    ? (billingAmounts?.billableBaseAmount ?? 0)
    : isInterHoReturnFlow
      ? sparesBillableAmount
      : sparesBillableAmount;
  const advanceAmount = Number(billingJob?.advanceInr ?? 0);
  const estimatedAmtInr = billingJob ? resolveCustomerServiceBaseInr(billingJob) : 0;
  const billSubtotalBeforeAdvance = useQuickBillStyleLines
    ? editorLinesBillableSubtotal(billLines, billingJob?.natureOfRepair, serviceChargeInr)
    : repairBaseAmount + additionalChargesTotal;

  const taxPreview = useMemo(() => {
    if (!billingJob || !billingAmounts || isRejectedNoRepairFlow) return null;
    const labourGstPercent = serviceTaxSettings?.gstRatePercent ?? 18;
    const storeGstin =
      storeInvoiceForPrint?.invoiceStoreGstin?.trim() ||
      serviceTaxSettings?.invoiceStoreGstin?.trim() ||
      "";
    const sellerState = resolveSellerStateCode(storeGstin);
    const customerState = resolveCustomerSupplyStateCode({
      customerType: billingCustomerKind,
      customerGstin: billingCustomerGst,
      billingStateName: effectiveCustomerState,
      addressText: billingCustomerAddress,
      cityText: billingCustomer?.city ?? null,
      sellerStateCode: sellerState,
    });
    const gstLines = useQuickBillStyleLines
      ? editorLinesToGstLines(
          billLines,
          billingJob.natureOfRepair,
          serviceChargeBillable,
          invoiceSacHsn,
        )
      : buildStoreBillingGstLines(billingJob, billingAmounts, previewAdditionalCharges, invoiceSacHsn);
    if (gstLines.length === 0) return null;
    return computeServiceBillGst({
      lines: gstLines,
      defaultHsnSac: invoiceSacHsn,
      spareHsnLookup,
      spareGstLookup,
      defaultSacGstPercent: labourGstPercent,
      pricesTaxInclusive: Boolean(serviceTaxSettings?.pricesTaxInclusive),
      natureOfRepair: billingJob.natureOfRepair,
      sellerStateCode: sellerState,
      customerStateCode: customerState,
      billTotalInr: billSubtotalBeforeAdvance,
    });
  }, [
    billingJob,
    billingAmounts,
    isRejectedNoRepairFlow,
    useQuickBillStyleLines,
    billLines,
    serviceChargeBillable,
    previewAdditionalCharges,
    invoiceSacHsn,
    serviceTaxSettings,
    storeInvoiceForPrint,
    billingCustomerKind,
    billingCustomerGst,
    effectiveCustomerState,
    billingCustomerAddress,
    billingCustomer?.city,
    spareHsnLookup,
    spareGstLookup,
    billSubtotalBeforeAdvance,
  ]);

  const invoiceTotalInr = useMemo(() => {
    const payable = customerPayableInr(
      billSubtotalBeforeAdvance,
      taxPreview?.totalTax ?? 0,
      Boolean(serviceTaxSettings?.pricesTaxInclusive),
    );
    return Number.isFinite(payable) ? payable : billSubtotalBeforeAdvance;
  }, [billSubtotalBeforeAdvance, taxPreview?.totalTax, serviceTaxSettings?.pricesTaxInclusive]);

  const standardBillingTotal = useMemo(() => {
    const due = invoiceTotalInr - advanceAmount;
    return Number.isFinite(due) ? Math.max(Math.round(due * 100) / 100, 0) : 0;
  }, [invoiceTotalInr, advanceAmount]);

  useEffect(() => {
    if (!billingJob) return;
    setHoSparesBillRef((billingJob.hoSparesBillRef ?? "").trim());
  }, [billingJob?.id, billingJob?.hoSparesBillRef]);

  useEffect(() => {
    setPaidAmountInput("");
    setMultiPaymentForm(emptyMultiPaymentForm());
  }, [billingJob?.id]);

  const finalBillingAmount = useMemo(() => {
    const raw = paidAmountInput.trim();
    if (!raw) return standardBillingTotal;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : standardBillingTotal;
  }, [paidAmountInput, standardBillingTotal]);
  useEffect(() => {
    setHandoverVerified(false);
    setHandoverModalOpen(false);
  }, [billingJob?.id]);

  function validateBeforeHandoverOtp(): boolean {
    if (!Number.isFinite(finalBillingAmount) || finalBillingAmount < 0) {
      setMessage({ type: "err", text: "Enter a valid final billing amount." });
      return false;
    }
    const payErr = validateMultiPaymentForm(multiPaymentForm, finalBillingAmount);
    if (payErr) {
      setMessage({ type: "err", text: payErr });
      return false;
    }
    return true;
  }

  function openHandoverOtp(mode: HandoverOtpMode) {
    if (!validateBeforeHandoverOtp()) return;
    setHandoverModalMode(mode);
    setHandoverModalOpen(true);
  }

  function onHandoverVerified() {
    setHandoverVerified(true);
    setHandoverModalOpen(false);
    if (billingJob) void finalizeInvoiceAfterOtp(billingJob.id);
  }

  function addChargeLine() {
    setAdditionalChargeLines((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        lineType: "charge",
        description: "",
        spareId: "",
        qty: "1",
        amount: "",
      },
    ]);
  }

  function removeChargeLine(id: string) {
    setAdditionalChargeLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.id !== id)));
  }

  function updateChargeLine(id: string, patch: Partial<AdditionalChargeLine>) {
    setAdditionalChargeLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function applyScannedSrf(raw: string) {
    const scanned = raw.trim().toUpperCase();
    if (!scanned) return;
    const hit = receivedAtStore.find((j) => j.reference.trim().toUpperCase() === scanned);
    if (!hit) {
      setMessage({ type: "err", text: `Scanned SRF not found in pending list: ${scanned}` });
      return;
    }
    setBillingRefInput(scanned);
    setBillingSelectedId(hit.id);
    setScreenMode("invoice");
    setMessage({ type: "ok", text: `SRF ${hit.reference} selected from barcode scan.` });
  }

  async function closeJob(
    jobId: string,
    storeBillingSnapshot?: import("../../lib/storeBillingSnapshot").StoreBillingSnapshot,
  ) {
    return closeWithInvoice(jobId, { hoSparesBillRef, storeBillRef, storeBillingSnapshot });
  }

  async function closeRejectedNoBilling(jobId: string) {
    await closeWithInvoice(jobId, { noBillingHandover: true });
  }

  async function finalizeInvoiceAfterOtp(jobId: string) {
    const job = receivedAtStore.find((x) => x.id === jobId);
    if (!job) {
      setMessage({ type: "err", text: "SRF not found in store inventory." });
      return;
    }
    const finalAmount = finalBillingAmount;
    if (!Number.isFinite(finalAmount) || finalAmount < 0) {
      setMessage({ type: "err", text: "Enter a valid final billing amount." });
      return;
    }
    const payPayload = buildMultiPaymentPayload(multiPaymentForm, finalAmount);
    if ("error" in payPayload) {
      setMessage({ type: "err", text: payPayload.error });
      return;
    }
    const payErr = validateMultiPaymentForm(multiPaymentForm, finalAmount);
    if (payErr) {
      setMessage({ type: "err", text: payErr });
      return;
    }
    setClosingAfterOtp(true);
    setMessage(null);
    try {
      const snapshot = buildStoreBillingSnapshot({
        job,
        useQuickBillStyleLines,
        billLines,
        serviceChargeBillable,
        additionalCharges: previewAdditionalCharges,
        defaultSacHsn: invoiceSacHsn,
        billSubtotalInr: billSubtotalBeforeAdvance,
        collectionAmountInr: finalAmount,
        collectionPaymentMode: payPayload.paymentMode,
        paymentDetails: payPayload.paymentDetails,
      });
      const closeOut = await closeJob(jobId, snapshot);
      const cust = customers.find((c) => phoneLast10(c.phone) === phoneLast10(job.phone));
      setBillingEdoc(closeOut.edoc ?? null);
      setClosedSrfId(jobId);
      const closedJob = {
        ...job,
        invoiceNumber: closeOut.invoiceNumber ?? job.invoiceNumber ?? null,
        storeBillingSnapshot: snapshot,
        edocIrn: closeOut.edoc?.irn ?? null,
        edocAckNo: closeOut.edoc?.ackNo ?? null,
        edocQr: closeOut.edoc?.qrUrl ?? null,
        edocStatus: closeOut.edoc?.ok ? "SUCCESS" : closeOut.edoc?.skipped ? "SKIPPED" : closeOut.edoc ? "FAILED" : null,
        edocError: closeOut.edoc?.error ?? closeOut.edoc?.skipReason ?? null,
      };
      setBillingInvoiceVm(
        buildStoreBillingInvoiceFromClosedJob(closedJob, {
          taxSettings: serviceTaxSettings,
          defaultHsnSac: invoiceSacHsn,
          storeInvoice: storeInvoiceForPrint,
          customer: cust ?? null,
          storeBillingSnapshot: snapshot,
          collectionAmountInr: finalAmount,
          collectionPaymentMode: payPayload.paymentMode,
          collectionPaymentDetails: payPayload.paymentDetails,
          spareHsnLookup,
          spareGstLookup,
          generatedBy: user?.displayName?.trim() || user?.email?.trim() || user?.id || null,
          edocIrn: closeOut.edoc?.irn,
          edocAckNo: closeOut.edoc?.ackNo,
          edocQr: closeOut.edoc?.qrUrl,
        }),
      );
      setBillPostActionNote(null);
      setBillSuccessModalOpen(true);
      setHandoverVerified(false);
      setMessage({
        type: "ok",
        text: closeOut.invoiceNumber
          ? `SRF closed. Tax invoice ${closeOut.invoiceNumber} is ready to print.`
          : "SRF closed. Tax invoice is ready to print.",
      });
      setBillingSelectedId("");
      setBillingRefInput("");
      setPaidAmountInput("");
      setMultiPaymentForm(emptyMultiPaymentForm());
      setBillLines([]);
      setServiceChargeInr("");
      setAdditionalChargeLines([
        { id: `${Date.now()}-charge`, lineType: "charge", description: "", spareId: "", qty: "1", amount: "" },
      ]);
    } catch (e) {
      const errText = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not close SRF.";
      setMessage({ type: "err", text: errText });
    } finally {
      setClosingAfterOtp(false);
    }
  }

  async function retryStoreBillingEdoc() {
    if (!closedSrfId) return;
    setEdocBusy(true);
    setBillPostActionNote(null);
    try {
      const out = await apiJson<{ edoc: QuickBillEdocInfo }>(
        `/api/edoc/srf-jobs/${encodeURIComponent(closedSrfId)}/generate-einvoice`,
        { method: "POST" },
      );
      setBillingEdoc(out.edoc);
      setBillingInvoiceVm((prev) =>
        prev
          ? {
              ...prev,
              irn: out.edoc?.irn?.trim() || null,
              ackNo: out.edoc?.ackNo?.trim() || null,
              einvoiceQr: out.edoc?.qrUrl?.trim() || null,
            }
          : prev,
      );
      if (out.edoc?.ok) {
        setBillPostActionNote(`GST e-invoice registered. IRN: ${out.edoc.irn ?? "—"}`);
      } else if (out.edoc?.skipped) {
        setBillPostActionNote(`E-invoice skipped: ${out.edoc.skipReason ?? "Not applicable."}`);
      } else {
        setBillPostActionNote(`E-invoice failed: ${out.edoc?.error ?? out.edoc?.skipReason ?? "IRP error."}`);
      }
    } catch (e) {
      setBillPostActionNote(e instanceof Error ? e.message : "Could not generate e-invoice.");
    } finally {
      setEdocBusy(false);
    }
  }

  const resolveBillingInvoicePdfBlob = useCallback(async () => {
    if (!billingInvoiceVm) throw new Error("Invoice is not ready.");
    return captureInvoicePdfFromViewModel(billingInvoiceVm, "srf-store-bill");
  }, [billingInvoiceVm]);

  const handleSendBillingInvoiceWhatsApp = useCallback(async () => {
    if (!billingInvoiceVm) return;
    const p10 = phoneLast10(billingInvoiceVm.billTo.phone ?? "");
    if (p10.length !== 10) {
      setBillPostActionNote("Customer mobile (10 digits) is required for WhatsApp delivery.");
      return;
    }
    setBillPostActionNote(null);
    await runWhatsAppSend(async () => {
      try {
        const pdfBlob = await resolveBillingInvoicePdfBlob();
        const wa = await sendInvoiceWhatsApp({
          phone: p10,
          customerName: billingInvoiceVm.billTo.name.trim() || "Customer",
          invoiceNumber: billingInvoiceVm.invoiceNumber,
          pdfBlob,
        });
        const msg = invoiceWhatsAppResultMessage(wa);
        const ok = Boolean(wa.messageId) || Boolean(wa.dryRun);
        if (ok) {
          setBillPostActionNote(
            wa.dryRun
              ? `Test mode: PDF on API server${wa.localViewUrl ? ` — open ${wa.localViewUrl}` : ""}. Set WHATSAPP_INVOICE_DRY_RUN=false to send real WhatsApp.`
              : "Invoice sent on WhatsApp successfully.",
          );
        }
        return { ok, message: msg };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not send invoice on WhatsApp.";
        setBillPostActionNote(msg);
        return { ok: false, message: msg };
      }
    });
  }, [billingInvoiceVm, resolveBillingInvoicePdfBlob, runWhatsAppSend]);

  const handleSendBillingInvoiceEmail = useCallback(async () => {
    if (!billingInvoiceVm) return;
    const to = (billingInvoiceVm.billTo.email ?? billingCustomerEmail).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setBillPostActionNote("Customer email is required to send the invoice.");
      return;
    }
    setBillPostActionNote(null);
    await runEmailSend(async () => {
      try {
        const pdfBlob = await resolveBillingInvoicePdfBlob();
        await sendInvoiceEmail({
          email: to,
          customerName: billingInvoiceVm.billTo.name.trim() || "Customer",
          invoiceNumber: billingInvoiceVm.invoiceNumber,
          totalInr: billingInvoiceVm.netPayable ?? billingInvoiceVm.totalAmount,
          pdfBlob,
        });
        const msg = "Invoice sent by email successfully (PDF attached).";
        setBillPostActionNote(msg);
        return { ok: true, message: msg };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not send invoice by email.";
        setBillPostActionNote(msg);
        return { ok: false, message: msg };
      }
    });
  }, [billingInvoiceVm, billingCustomerEmail, resolveBillingInvoicePdfBlob, runEmailSend]);

  useEffect(() => {
    if (!billSuccessModalOpen || !billingInvoiceVm) return;
    const dedupKey = autoInvoiceWhatsAppDedupKey(billingInvoiceVm.invoiceNumber, billingEdoc);
    if (autoWhatsAppSentRef.current === dedupKey) return;
    if (!shouldAutoSendInvoiceWhatsApp(billingEdoc, billingInvoiceVm.billTo.phone)) return;
    autoWhatsAppSentRef.current = dedupKey;
    void handleSendBillingInvoiceWhatsApp();
  }, [
    billSuccessModalOpen,
    billingInvoiceVm,
    billingEdoc,
    handleSendBillingInvoiceWhatsApp,
  ]);

  if (!user) return null;

  return (
    <div>
      <div className={billingInvoiceVm ? "print:hidden" : undefined}>
      <ServiceBreadcrumb current="Store billing" />
      <PageHeader title="Store billing / customer collection" description="" />

      <Card title="Billing module" subtitle="">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setScreenMode("select")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              screenMode === "select"
                ? "bg-zimson-600 text-white"
                : "border border-zimson-300 bg-white text-zimson-900 hover:bg-zimson-50"
            }`}
          >
            1. Select SRF
          </button>
          <button
            type="button"
            onClick={() => setScreenMode("invoice")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              screenMode === "invoice"
                ? "bg-zimson-600 text-white"
                : "border border-zimson-300 bg-white text-zimson-900 hover:bg-zimson-50"
            }`}
          >
            2. Invoice Details
          </button>
        </div>

        {screenMode === "select" ? (
          <>
            <div className="mb-3 grid gap-3 md:grid-cols-4">
              <label className="text-sm md:col-span-2">
                SRF reference search
                <input
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  placeholder="Enter SRF reference"
                  value={billingRefInput}
                  onChange={(e) => setBillingRefInput(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Select SRF
                <select
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  value={billingSelectedId}
                  onChange={(e) => {
                    setBillingSelectedId(e.target.value);
                    if (e.target.value) setScreenMode("invoice");
                  }}
                >
                  <option value="">Select...</option>
                  {filteredInventory.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.reference} - {j.customerName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Scan SRF barcode
                <input
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  placeholder="Scan SRF barcode and press Enter"
                  value={scanSrfInput}
                  onChange={(e) => setScanSrfInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    applyScannedSrf(scanSrfInput);
                    setScanSrfInput("");
                  }}
                />
              </label>
              <div className="rounded-xl border border-zimson-200/80 bg-zimson-50/60 px-3 py-2 text-sm">
                <p className="text-xs text-stone-600">Pending in store inventory</p>
                <p className="text-lg font-semibold text-zimson-900">{filteredInventory.length}</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zimson-200 bg-zimson-50/70 text-xs font-semibold uppercase text-stone-600">
                  <tr>
                    <th className="px-3 py-2">SRF</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Watch</th>
                    <th className="px-3 py-2">Estimate</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-stone-500" colSpan={5}>
                        No pending SRFs found for billing.
                      </td>
                    </tr>
                  ) : (
                    filteredInventory.map((j) => (
                      <tr key={j.id} className="border-b border-zimson-100 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">
                          <button
                            type="button"
                            onClick={() => setTraceJobId(j.id)}
                            className="hover:text-indigo-600 hover:underline"
                          >
                            {j.reference}
                          </button>
                        </td>
                        <td className="px-3 py-2">{j.customerName}</td>
                        <td className="px-3 py-2">{j.watchBrand} {j.watchModel}</td>
                        <td className="px-3 py-2">INR {Number(j.estimateTotalInr ?? 0).toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setBillingSelectedId(j.id);
                              setScreenMode("invoice");
                            }}
                            className="rounded-lg border border-zimson-300 bg-white px-2 py-1 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                          >
                            Select & continue
                          </button>
                          <button
                            type="button"
                            onClick={() => setTraceJobId(j.id)}
                            className="ml-2 rounded-lg border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
                          >
                            View details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : !billingJob ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Select SRF first from step 1 to continue invoice creation.
          </div>
        ) : (
          <div className="mt-4 space-y-4 rounded-xl border border-zimson-200/80 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-stone-700">
                <span className="font-mono font-semibold text-zimson-900">{billingJob.reference}</span> ·{" "}
                {billingJob.customerName} · {billingJob.watchBrand} {billingJob.watchModel}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTraceJobId(billingJob.id)}
                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
                >
                  View full details
                </button>
                <button
                  type="button"
                  onClick={() => setScreenMode("select")}
                  className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                >
                  Change selected SRF
                </button>
              </div>
            </div>
            {isRejectedNoRepairFlow ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Customer rejected re-estimate and the watch is being returned without repair. Use handover
                without billing when the customer collects the watch.
              </div>
            ) : null}
            {isInterHoReturnFlow ? (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
                Inter-HO return: bill repair HO spares (from repair invoice) plus any labour/service charges you enter below.
                GST is applied on spares + charges; booking advance is deducted from the final total.
                {(billingJob.hoSparesBillRef ?? "").trim() ? (
                  <span className="mt-1 block text-xs">
                    Repair HO invoice ref:{" "}
                    <span className="font-mono font-semibold">{billingJob.hoSparesBillRef}</span>
                  </span>
                ) : null}
              </div>
            ) : null}
            {useQuickBillStyleLines && billingJob ? (
              <ServiceBillLinesCard
                watchBrand={billingJob.watchBrand}
                spareOptions={spareOptions}
                lines={billLines}
                onLinesChange={setBillLines}
                serviceChargeInr={serviceChargeInr}
                onServiceChargeInrChange={setServiceChargeInr}
                customerBillingState={billingStateInput}
                onCustomerBillingStateChange={setBillingStateInput}
                customerType={billingCustomerKind}
                customerGst={billingCustomerGst}
                customerAddress={billingCustomerAddress}
                customerCity={billingCustomer?.city}
                serviceSacHsn={invoiceSacHsn}
                serviceTaxSettings={serviceTaxSettings}
                storeGstin={
                  storeInvoiceForPrint?.invoiceStoreGstin?.trim() ||
                  serviceTaxSettings?.invoiceStoreGstin?.trim()
                }
                natureOfRepair={billingJob.natureOfRepair}
                taxPreview={taxPreview}
                billSubtotalInr={billSubtotalBeforeAdvance}
                advanceInr={advanceAmount}
                standardTotalInr={standardBillingTotal}
                userRole={user?.role}
                labourChargesOnly={user?.role === "store_user"}
                onValidationError={(msg) => {
                  if (msg) setMessage({ type: "err", text: msg });
                  else if (message?.type === "err") setMessage(null);
                }}
              />
            ) : null}
            {!useQuickBillStyleLines ? (
            <div className="rounded-xl bg-zimson-50 p-3 text-sm text-stone-700">
              <p className="font-semibold text-zimson-900">
                {isBrandRepairFlow
                  ? "Brand repair invoice"
                  : isInterHoReturnFlow
                    ? "Repair HO spares (on tax invoice)"
                    : "Supervisor used spares"}
              </p>
              {isBrandRepairFlow ? (
                <div className="mt-2 overflow-x-auto rounded-xl border border-violet-200/80 bg-white">
                  <table className="min-w-full text-left text-xs">
                    <tbody>
                      <tr className="border-b border-violet-100">
                        <th className="w-48 bg-violet-50/60 px-3 py-2 font-semibold text-stone-700">Brand invoice ref</th>
                        <td className="px-3 py-2 font-semibold text-zimson-900">{billingJob.brandInvoiceRef ?? "-"}</td>
                      </tr>
                      <tr className="border-b border-violet-100">
                        <th className="bg-violet-50/60 px-3 py-2 font-semibold text-stone-700">Brand invoice amount</th>
                        <td className="px-3 py-2 font-semibold text-zimson-900">INR {brandInvoiceAmount.toFixed(2)}</td>
                      </tr>
                      {billingJob.brandEstimateInr ? (
                        <tr>
                          <th className="bg-violet-50/60 px-3 py-2 font-semibold text-stone-700">Brand estimate</th>
                          <td className="px-3 py-2 text-stone-700">INR {Number(billingJob.brandEstimateInr).toFixed(2)}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ) : billingJob.usedSpares && billingJob.usedSpares.length > 0 ? (
                <div className="mt-2 overflow-x-auto rounded-xl border border-zimson-200/80 bg-white">
                  <table className="min-w-full text-left text-xs">
                    <thead className="border-b border-zimson-200 bg-zimson-50/60 text-stone-600">
                      <tr>
                        <th className="px-3 py-2">Spare</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Unit</th>
                        <th className="px-3 py-2">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingJob.usedSpares.map((x, idx) => (
                        <tr key={`${x.name}-${idx}`} className="border-b border-zimson-100 last:border-0">
                          <td className="px-3 py-2">{x.name}</td>
                          <td className="px-3 py-2">{x.qty}</td>
                          <td className="px-3 py-2">INR {Number(x.unitPriceInr ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2 font-semibold text-zimson-900">INR {Number(x.lineTotalInr ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-1 text-xs text-amber-700">No spares slip submitted yet.</p>
              )}
            </div>
            ) : null}
            {!isRejectedNoRepairFlow && !useQuickBillStyleLines ? (
              <div className="rounded-xl border border-zimson-200/80 bg-zimson-50/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-zimson-900">Additional line items (labour / service charges)</p>
                  <button
                    type="button"
                    onClick={addChargeLine}
                    className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                  >
                    Add line item
                  </button>
                </div>
                <div className="space-y-2">
                  {additionalChargeLines.map((line) => (
                    <div key={line.id} className="grid gap-2 md:grid-cols-[120px_1fr_130px_130px_76px]">
                      <select
                        className="rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
                        value={line.lineType}
                        onChange={(e) =>
                          updateChargeLine(line.id, {
                            lineType: e.target.value as "charge" | "spare",
                            description: "",
                            spareId: "",
                            qty: "1",
                            amount: "",
                          })
                        }
                      >
                        <option value="charge">Charge</option>
                        <option value="spare">Spare</option>
                      </select>
                      {line.lineType === "spare" ? (
                        <select
                          className="rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
                          value={line.spareId}
                          onChange={(e) => updateChargeLine(line.id, { spareId: e.target.value })}
                        >
                          <option value="">Select spare</option>
                          {activeSpares.map((sp) => (
                            <option key={sp.id} value={sp.id}>
                              {sp.sku} - {sp.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
                          placeholder="Description (e.g. Labour charge)"
                          value={line.description}
                          onChange={(e) => updateChargeLine(line.id, { description: e.target.value })}
                        />
                      )}
                      {line.lineType === "spare" ? (
                        <input
                          className="rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
                          type="number"
                          min={1}
                          step={1}
                          placeholder="Qty"
                          value={line.qty}
                          onChange={(e) => updateChargeLine(line.id, { qty: e.target.value })}
                        />
                      ) : (
                        <input
                          className="rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="Amount"
                          value={line.amount}
                          onChange={(e) => updateChargeLine(line.id, { amount: e.target.value })}
                        />
                      )}
                      <input
                        className="rounded-xl border border-zimson-300 bg-zimson-50 px-3 py-2 text-sm"
                        readOnly
                        value={`INR ${getLineAmount(line).toFixed(2)}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeChargeLine(line.id)}
                        disabled={additionalChargeLines.length <= 1}
                        className="rounded-xl border border-zimson-300 bg-white px-2 py-2 text-xs font-semibold text-zimson-900 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {!isRejectedNoRepairFlow && !useQuickBillStyleLines ? (
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <tbody>
                  <tr className="border-b border-zimson-100">
                    <th className="w-56 bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">
                      {isBrandRepairFlow
                        ? "Brand invoice amount"
                        : isInterHoReturnFlow
                          ? "Repair HO spares (taxable)"
                          : "Spares amount (actual)"}
                    </th>
                    <td className="px-3 py-2 font-semibold text-zimson-900">
                      INR {repairBaseAmount.toFixed(2)}
                    </td>
                  </tr>
                  {isInterHoReturnFlow ? (
                    <tr className="border-b border-zimson-100">
                      <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Service estimate (reference only)</th>
                      <td className="px-3 py-2 text-stone-600">{formatInr(estimatedAmtInr)}</td>
                    </tr>
                  ) : null}
                  {!isInterHoReturnFlow ? (
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Estimated amt</th>
                    <td className="px-3 py-2 font-semibold text-zimson-900">{formatInr(estimatedAmtInr)}</td>
                  </tr>
                  ) : null}
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Advance received</th>
                    <td className="px-3 py-2 font-semibold text-zimson-900">
                      INR {advanceAmount.toFixed(2)}
                    </td>
                  </tr>
                  {advanceAmount > 0 && billingJob?.advancePaymentMode ? (
                    <tr className="border-b border-zimson-100">
                      <th className="bg-zimson-50/70 px-3 py-2 align-top font-semibold text-stone-700">
                        Advance payment (at booking)
                      </th>
                      <td className="px-3 py-2 text-sm text-stone-800">
                        <span className="font-semibold text-zimson-900">{billingJob.advancePaymentMode}</span>
                        {(() => {
                          const det = billingJob.advancePaymentDetails as AdvancePaymentDetails | null | undefined;
                          if (!det) return null;
                          if (billingJob.advancePaymentMode === "Cash" && det.cash) {
                            const c = det.cash;
                            const parts: string[] = [];
                            for (const { key, label } of ADVANCE_CASH_DENOMS) {
                              const q = Number(c[key]);
                              if (Number.isFinite(q) && q > 0) parts.push(`${label.replace(" ×", "")}: ${q}`);
                            }
                            const coins = Number(c.coinsInr);
                            if (Number.isFinite(coins) && coins > 0) parts.push(`Coins: INR ${coins.toFixed(2)}`);
                            return parts.length ? (
                              <span className="mt-1 block text-xs text-stone-600">{parts.join(" · ")}</span>
                            ) : null;
                          }
                          if (det.reference) {
                            return (
                              <span className="mt-1 block text-xs text-stone-600">Ref: {det.reference}</span>
                            );
                          }
                          return null;
                        })()}
                      </td>
                    </tr>
                  ) : null}
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Additional charges</th>
                    <td className="px-3 py-2 font-semibold text-zimson-900">
                      INR {additionalChargesTotal.toFixed(2)}
                    </td>
                  </tr>
                  {isInterHoReturnFlow ? (
                    <tr className="border-b border-zimson-100">
                      <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Taxable subtotal (spares + charges)</th>
                      <td className="px-3 py-2 font-semibold text-zimson-900">
                        INR {billSubtotalBeforeAdvance.toFixed(2)}
                      </td>
                    </tr>
                  ) : null}
                  {taxPreview ? (
                    <tr className="border-b border-zimson-100">
                      <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">GST</th>
                      <td className="px-3 py-2 font-semibold text-zimson-900">
                        INR {(taxPreview.totalTax ?? 0).toFixed(2)}
                      </td>
                    </tr>
                  ) : null}
                  {isInterHoReturnFlow ? (
                    <tr className="border-b border-zimson-100">
                      <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Invoice total (incl. GST)</th>
                      <td className="px-3 py-2 font-semibold text-zimson-900">
                        {formatInr(invoiceTotalInr)}
                      </td>
                    </tr>
                  ) : null}
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Standard billing total (incl. GST − advance)</th>
                    <td className="px-3 py-2 font-semibold text-zimson-900">
                      {formatInr(standardBillingTotal)}
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Final our billing amount</th>
                    <td className="px-3 py-2 font-semibold text-zimson-900">
                      {formatInr(finalBillingAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            ) : null}
            {!isRejectedNoRepairFlow ? (
              <>
            {useQuickBillStyleLines ? (
              <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
                <table className="min-w-full text-left text-sm">
                  <tbody>
                    <tr className="border-b border-zimson-100">
                      <th className="w-56 bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Estimated amt</th>
                      <td className="px-3 py-2 font-semibold text-zimson-900">{formatInr(estimatedAmtInr)}</td>
                    </tr>
                    <tr className="border-b border-zimson-100">
                      <th className="w-56 bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Advance received</th>
                      <td className="px-3 py-2 font-semibold text-zimson-900">INR {advanceAmount.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Final our billing amount</th>
                      <td className="px-3 py-2 font-semibold text-zimson-900">{formatInr(finalBillingAmount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                HO bill reference
                <input
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  value={hoSparesBillRef}
                  onChange={(e) => setHoSparesBillRef(e.target.value)}
                  placeholder="HO bill ref"
                />
              </label>
              <label className="text-sm">
                Store bill reference
                <input
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  value={storeBillRef}
                  onChange={(e) => setStoreBillRef(e.target.value)}
                  placeholder="Store bill ref"
                />
              </label>
            </div>
            <label className="block text-sm">
              Final our billing amount (INR)
              <input
                className="mt-1 w-full max-w-xs rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                value={paidAmountInput}
                onChange={(e) => {
                  setMessage(null);
                  setPaidAmountInput(sanitizeDecimalInput(e.target.value));
                }}
                placeholder={
                  Number.isFinite(standardBillingTotal) ? String(standardBillingTotal) : "0"
                }
              />
              <p className="mt-1 text-xs text-stone-500">
                Leave blank to use balance due {formatInr(standardBillingTotal)} (after GST and advance).
              </p>
            </label>
            <MultiPaymentFields
              idPrefix="store-bill"
              amountLabel="collection"
              targetInr={finalBillingAmount}
              form={multiPaymentForm}
              onChange={setMultiPaymentForm}
            />
            <p className="text-xs text-stone-600">
              After OTP is verified (primary mobile/email or other number/email), the tax invoice is generated
              automatically — same as Quick Bill.
            </p>
            {edocEnabled && isB2BBilling ? (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
                <strong>B2B — GST e-invoice mandatory.</strong> IRN will be registered automatically when the invoice
                is generated{ billingCustomerGst ? ` (buyer GSTIN ${billingCustomerGst})` : " — ensure customer GSTIN is on file" }.
              </div>
            ) : null}
              </>
            ) : null}
            {isRejectedNoRepairFlow ? (
              <button
                type="button"
                onClick={() => {
                  void closeRejectedNoBilling(billingJob.id)
                    .then(() => {
                      setMessage({ type: "ok", text: "Watch handed over and SRF closed without billing (re-estimate rejected)." });
                      setBillingSelectedId("");
                      setBillingRefInput("");
                    })
                    .catch((e) => {
                      setMessage({ type: "err", text: e instanceof Error ? e.message : "Could not complete no-billing handover." });
                    });
                }}
                className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
              >
                Handover to customer without billing
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => openHandoverOtp("primary")}
                  disabled={
                    handoverVerified ||
                    closingAfterOtp ||
                    (phoneLast10(billingJob.phone).length !== 10 &&
                      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingCustomerEmail))
                  }
                  className="rounded-xl border border-indigo-400 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send OTP to primary (mobile / email)
                </button>
                <button
                  type="button"
                  onClick={() => openHandoverOtp("custom")}
                  disabled={handoverVerified || closingAfterOtp}
                  className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send OTP to other number / email
                </button>
                {handoverVerified ? (
                  <span className="text-sm font-semibold text-emerald-700">OTP verified — generating invoice…</span>
                ) : null}
                {closingAfterOtp ? (
                  <span className="text-sm font-medium text-stone-600">Saving bill…</span>
                ) : null}
              </div>
            )}
          </div>
        )}

        {message ? (
          <p
            className={
              message.type === "ok"
                ? "mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200"
                : "mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200"
            }
          >
            {message.text}
          </p>
        ) : null}
      </Card>

      </div>

      {billingInvoiceVm ? (
        <div className="hidden print:block" aria-hidden>
          <ServiceInvoiceTemplate data={billingInvoiceVm} idPrefix="srf-store-bill" />
        </div>
      ) : null}

      {billingInvoiceVm && billSuccessModalOpen ? (
        <ProcessSuccessModal
          open
          title="Billing complete"
          description={`Invoice ${billingInvoiceVm.invoiceNumber} · SRF ${billingInvoiceVm.serviceReference ?? ""}`}
          onBackdropClick={() => setBillSuccessModalOpen(false)}
          actions={
            <>
              <button type="button" className={billSuccessBtnPrimary} onClick={() => printServiceInvoice()}>
                Print invoice
              </button>
              <button
                type="button"
                className={billSuccessBtnSecondary}
                disabled={emailSending || whatsappSending}
                onClick={() => void handleSendBillingInvoiceEmail()}
              >
                {emailSending ? "Sending email…" : "Send invoice by email"}
              </button>
              <button
                type="button"
                className={billSuccessBtnSecondary}
                disabled={whatsappSending || emailSending}
                onClick={() => void handleSendBillingInvoiceWhatsApp()}
              >
                {whatsappSending ? "Sending on WhatsApp…" : "Send invoice on WhatsApp"}
              </button>
              <button type="button" className={billSuccessBtnOutline} onClick={() => setBillSuccessModalOpen(false)}>
                Close
              </button>
              {edocEnabled && billingInvoiceVm?.billTo?.gstin?.trim() && billingEdoc && !billingEdoc.ok && !billingEdoc.skipped ? (
                <button
                  type="button"
                  className={billSuccessBtnSecondary}
                  disabled={edocBusy}
                  onClick={() => void retryStoreBillingEdoc()}
                >
                  {edocBusy ? "Generating IRN…" : "Retry e-invoice"}
                </button>
              ) : null}
              <button
                type="button"
                className={billSuccessBtnSecondary}
                onClick={() => {
                  autoWhatsAppSentRef.current = null;
                  setBillingInvoiceVm(null);
                  setBillSuccessModalOpen(false);
                  setBillPostActionNote(null);
                  setBillingEdoc(null);
                  setClosedSrfId(null);
                  setScreenMode("select");
                }}
              >
                Done — next SRF
              </button>
            </>
          }
        >
          {billingEdoc && billingInvoiceVm?.billTo?.gstin?.trim() ? (
            <div
              className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
                billingEdoc.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : billingEdoc.skipped
                    ? "border-stone-200 bg-stone-50 text-stone-800"
                    : "border-amber-200 bg-amber-50 text-amber-950"
              }`}
            >
              {billingEdoc.ok ? (
                <p>
                  <strong>GST e-invoice registered.</strong> IRN:{" "}
                  <span className="font-mono break-all">{billingEdoc.irn}</span>
                  {billingEdoc.ackNo ? <> · Ack: {billingEdoc.ackNo}</> : null}
                </p>
              ) : billingEdoc.skipped ? (
                <p>
                  <strong>E-invoice skipped:</strong> {billingEdoc.skipReason ?? "Not applicable."}
                </p>
              ) : (
                <p>
                  <strong>E-invoice not generated:</strong>{" "}
                  {billingEdoc.error ?? billingEdoc.skipReason ?? "IRP error."} Invoice is saved — retry below or from
                  Invoice history.
                </p>
              )}
            </div>
          ) : null}
          {billPostActionNote ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950 ring-1 ring-amber-200/80">
              {billPostActionNote}
            </p>
          ) : (
            <p className="text-sm text-stone-700">
              The invoice is sent on WhatsApp automatically when e-invoice is registered (or for B2C). You can also use{" "}
              <strong>Print invoice</strong>, <strong>Send invoice by email</strong>, or resend on WhatsApp below.
            </p>
          )}
        </ProcessSuccessModal>
      ) : null}

      <CustomerHandoverOtpModal
        open={handoverModalOpen}
        mode={handoverModalMode}
        onClose={() => setHandoverModalOpen(false)}
        contactPhone={billingJob?.phone ?? ""}
        contactEmail={billingCustomerEmail}
        onHandoverVerified={onHandoverVerified}
      />

      {traceJobId ? <SrfTraceModal srfId={traceJobId} onClose={() => setTraceJobId(null)} /> : null}
    </div>
  );
}
