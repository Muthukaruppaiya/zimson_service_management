import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  CustomerHandoverOtpModal,
  type HandoverOtpMode,
} from "../../components/service/CustomerHandoverOtpModal";
import { WatchFamilyPicker } from "../../components/service/WatchFamilyPicker";
import { WatchModelPicker } from "../../components/service/WatchModelPicker";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { FormPageShell } from "../../components/layout/FormPageShell";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProcessSuccessModal } from "../../components/ui/ProcessSuccessModal";
import { useAuth } from "../../context/AuthContext";
import { useCustomers } from "../../context/CustomersContext";
import { useBrands } from "../../context/BrandsContext";
import { useRegions } from "../../context/RegionsContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import {
  sanitizeAlphanumericInput,
  sanitizeDecimalInput,
  sanitizeEmailInput,
  sanitizeGstPanInput,
  sanitizeMultilineTextInput,
  sanitizePhoneDigits,
  sanitizeTextInput,
} from "../../lib/inputSanitize";
import { buildDemoServiceInvoiceViewModel, mapQuickBillInvoiceToViewModel } from "../../components/service/mapQuickBillToServiceInvoice";
import { MultiPaymentFields } from "../../components/service/MultiPaymentFields";
import {
  buildMultiPaymentPayload,
  emptyMultiPaymentForm,
  validateMultiPaymentForm,
} from "../../lib/paymentModes";
import { ServiceInvoiceTemplate } from "../../components/service/ServiceInvoiceTemplate";
import { CustomerLinkQr } from "../../components/service/CustomerLinkQr";
import { printServiceInvoice } from "../../lib/printServiceInvoice";
import { sendInvoiceWhatsApp } from "../../lib/sendInvoiceWhatsApp";
import { sendInvoiceEmail } from "../../lib/sendInvoiceEmail";
import type { QuickBillInvoice, QuickBillWarrantyStatus } from "../../types/quickBill";
import type { ServiceInvoiceViewModel } from "../../types/serviceInvoice";
import type { ServiceTaxSettings } from "../../types/serviceTaxSettings";
import { seedStoreToInvoiceProfile } from "../../types/storeInvoice";
import type { SparePriceLine, SpareStockRow } from "../../types/spare";
import {
  isValidGstFormat,
  isValidPanFormat,
  nextQuickBillRef,
  panFromGstin,
} from "../../data/serviceSeed";
import { validateCustomerB2bGstin, ZIMSON_OWN_GSTIN_FIELD_HINT } from "../../lib/zimsonCompanyGst";
import {
  hoNeedsOperatingStorePicker,
  isHoServiceOperator,
  pickDefaultStoreId,
  resolveOperatingRegionId,
  resolveOperatingStoreId,
  storesForRegion,
} from "../../lib/serviceOperatingContext";
import type { TechnicianProfile } from "../../types/technician";
import {
  isFullyOtpVerified,
  UNVERIFIED_CUSTOMER_ALERT_MESSAGE,
} from "../../lib/customerVerification";
import { watchAttachmentDisplayName } from "../../lib/watchAttachmentUpload";
import {
  storeServiceChargeMaxLabel,
  validateStoreServiceAmountInr,
} from "../../lib/serviceChargeLimits";
import {
  WatchServiceDetailFields,
  emptyWatchServiceDetailValues,
  watchServiceDetailsToApiPayload,
  type WatchServiceDetailValues,
} from "../../components/service/WatchServiceDetailFields";
import { inputClass } from "../../lib/uiForm";

type LoadedCustomerRow = {
  id?: string;
  customerCode?: string | null;
  displayName: string;
  phone: string;
  alternatePhone?: string;
  email: string;
  address?: string;
  city?: string;
  billingAddress?: {
    doorNo?: string;
    street?: string;
    city?: string;
    district?: string;
    state?: string;
    pincode?: string;
  };
  customerKind: "B2C" | "B2B";
  company?: string;
  gst?: string;
  pan?: string;
  phoneVerifiedAt?: string | null;
  emailVerifiedAt?: string | null;
};

function phoneLast10(v: string): string {
  const digits = v.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function composeAddress(row: LoadedCustomerRow): string {
  if (row.address?.trim()) return row.address.trim();
  const b = row.billingAddress;
  if (!b) return "";
  const line1 = (b as { addressLine1?: string }).addressLine1 ?? b.doorNo;
  const line2 = (b as { addressLine2?: string }).addressLine2 ?? b.street;
  return [line1, line2, b.city, b.district, b.state, b.pincode]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");
}

type LineItem = { id: string; description: string; amount: string; spareId?: string; qty?: number };

type CompletionState = null | { mode: "demo"; ref: string } | { mode: "api"; invoice: QuickBillInvoice };
type QuickBillSpareOption = {
  id: string;
  sku: string;
  name: string;
  price: number;
  stockQty: number;
};

function emptyLine(): LineItem {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, description: "", amount: "" };
}

/** Responsive form layout — stacks on narrow / quarter-screen laptop windows. */
const qbPage = "min-w-0 max-w-full";
const qbGrid2 = "grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 md:items-start";
/** Two fields per row — same alignment as Model + Serial number */
const qbPairRow = "grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 md:items-start";
const qbField = "min-w-0";

const readOnlyCustomerFieldClass = `${inputClass} cursor-not-allowed bg-stone-100 text-stone-800`;

const qbSuccessBtnBase =
  "inline-flex w-full min-w-0 items-center justify-center rounded-xl px-4 py-2.5 text-center text-sm font-semibold shadow-sm transition sm:w-auto";
const qbSuccessBtnPrimary = `${qbSuccessBtnBase} bg-zimson-600 text-white hover:bg-zimson-700`;
const qbSuccessBtnSecondary = `${qbSuccessBtnBase} border border-zimson-400 bg-white text-zimson-900 hover:bg-zimson-50`;
const qbSuccessBtnOutline = `${qbSuccessBtnBase} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`;

function QuickBillInvoicePanel({
  viewModel,
  onNew,
}: {
  viewModel: ServiceInvoiceViewModel;
  onNew: () => void;
}) {
  return (
    <div className="space-y-6">
      <p className="text-xs text-stone-500 print:hidden">
        Preview uses the same layout as print. Sidebar and top bar are hidden when you print.
      </p>
      <ServiceInvoiceTemplate data={viewModel} idPrefix="qb" />
      <div className="flex flex-wrap gap-3 print:hidden">
        <button
          type="button"
          onClick={() => printServiceInvoice()}
          className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
        >
          Print invoice
        </button>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
        >
          New quick bill
        </button>
        <Link
          to="/service"
          className="inline-flex items-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
        >
          Back to service
        </Link>
      </div>
    </div>
  );
}

export function QuickBillPage() {
  const apiMode = useApiMode();
  const { user } = useAuth();
  const { getById, customers } = useCustomers();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { regions } = useRegions();
  const currentUserStore = useMemo(() => {
    const sid = user?.storeId?.trim();
    if (!sid) return undefined;
    for (const r of regions) {
      const s = r.stores.find((x) => x.id === sid);
      if (s) return s;
    }
    return undefined;
  }, [regions, user?.storeId]);
  const { brands: catalogBrands } = useBrands();
  const brandNames = useMemo(() => catalogBrands.map((b) => b.name), [catalogBrands]);
  const { spares } = useSpares();
  const [billingRegionId, setBillingRegionId] = useState("");
  const [billingStoreId, setBillingStoreId] = useState("");
  const [customerType, setCustomerType] = useState<"B2C" | "B2B">("B2C");
  const [customerName, setCustomerName] = useState("");
  /** Keeps new-customer navigate URL stable without putting `customerName` in `checkCustomerInDb` deps (which retriggered lookup and cleared `customerChecked`). */
  const customerNameForNavRef = useRef("");
  customerNameForNavRef.current = customerName.trim();

  const redirectToCustomerRegister = useCallback(
    (phoneRaw: string) => {
      const q = new URLSearchParams();
      if (phoneRaw.trim()) q.set("phone", phoneRaw.trim());
      const name = customerNameForNavRef.current;
      if (name) q.set("name", name);
      q.set("returnTo", "/service/quick-bill");
      navigate(`/service/quick-bill/new-customer?${q.toString()}`, { replace: true });
    },
    [navigate],
  );
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [gst, setGst] = useState("");
  const [pan, setPan] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");

  const [watchBrand, setWatchBrand] = useState("");
  const [watchFamily, setWatchFamily] = useState("");
  const [watchFamilyIsNew, setWatchFamilyIsNew] = useState(false);
  const [watchModel, setWatchModel] = useState("");
  const [watchModelIsNew, setWatchModelIsNew] = useState(false);
  const [watchRef, setWatchRef] = useState("");
  const [watchRemark, setWatchRemark] = useState("");
  const [watchServiceDetails, setWatchServiceDetails] = useState<WatchServiceDetailValues>(
    emptyWatchServiceDetailValues,
  );
  const [warrantyStatus, setWarrantyStatus] = useState<QuickBillWarrantyStatus>("unspecified");
  const [watchDocumentPath, setWatchDocumentPath] = useState<string | null>(null);
  const [watchImagePath, setWatchImagePath] = useState<string | null>(null);
  const [captureSession, setCaptureSession] = useState<{
    sessionId: string;
    token: string;
    captureUrl: string;
  } | null>(null);
  const [captureLinkBusy, setCaptureLinkBusy] = useState(false);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);

  const [lines, setLines] = useState<LineItem[]>([]);
  const [serviceChargeInr, setServiceChargeInr] = useState("");
  const [partPick, setPartPick] = useState("");
  const [technicianId, setTechnicianId] = useState<string>("");
  const [technicians, setTechnicians] = useState<TechnicianProfile[]>([]);
  const [multiPaymentForm, setMultiPaymentForm] = useState(emptyMultiPaymentForm);
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<CompletionState>(null);
  const [billSuccessModalOpen, setBillSuccessModalOpen] = useState(false);
  const [billPostActionNote, setBillPostActionNote] = useState<string | null>(null);
  const [whatsappSending, setWhatsappSending] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [isSavingBill, setIsSavingBill] = useState(false);

  const [spareOptions, setSpareOptions] = useState<QuickBillSpareOption[]>([]);
  const [spareOptionsLoading, setSpareOptionsLoading] = useState(false);
  const [barcodeSku, setBarcodeSku] = useState("");
  const [invoiceHsnSac, setInvoiceHsnSac] = useState("9987");
  const [serviceTaxSettings, setServiceTaxSettings] = useState<ServiceTaxSettings | null>(null);

  const [customerChecked, setCustomerChecked] = useState(false);
  const [customerCheckMsg, setCustomerCheckMsg] = useState<string | null>(null);
  const [checkingCustomer, setCheckingCustomer] = useState(false);
  /** Phone entered but not in customer master — verify via OTP mobile on this screen. */
  const [walkInPending, setWalkInPending] = useState(false);
  const [loadedCustomerId, setLoadedCustomerId] = useState<string | null>(null);
  const [loadedCustomerCode, setLoadedCustomerCode] = useState<string | null>(null);
  /** Existing customer row applied from API / local lookup — master fields stay read-only. */
  const customerLockedFromDb = Boolean(loadedCustomerId && customerChecked);

  const clearLoadedCustomer = useCallback(() => {
    setLoadedCustomerId(null);
    setLoadedCustomerCode(null);
    setCustomerChecked(false);
    setCustomerCheckMsg(null);
    setPhoneVerifiedAt(null);
    setEmailVerifiedAt(null);
    setHandoverVerified(false);
    verifiedBillPhoneLast10Ref.current = "";
    lastAutoLookupPhoneRef.current = "";
    unverifiedAlertShownForRef.current = null;
  }, []);
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null);
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<string | null>(null);
  const unverifiedAlertShownForRef = useRef<string | null>(null);
  const [handoverVerified, setHandoverVerified] = useState(false);
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [handoverModalMode, setHandoverModalMode] = useState<HandoverOtpMode>("primary");
  const autoLookupTimerRef = useRef<number | null>(null);
  const lastAutoLookupPhoneRef = useRef("");
  /** Set synchronously when a customer row is applied; OTP gate trusts this if `customerChecked` lags one frame. */
  const verifiedBillPhoneLast10Ref = useRef("");
  const phoneInputRef = useRef("");
  phoneInputRef.current = phone.trim();

  const applyLoadedCustomer = useCallback((data: LoadedCustomerRow) => {
    setCustomerType(data.customerKind);
    setCustomerName((data.displayName ?? "").trim());
    setPhone((data.phone ?? "").trim());
    setEmail(data.email ?? "");
    setCompany(data.company ?? "");
    setGst(data.gst ?? "");
    setPan(data.pan ?? "");
    setAddress(composeAddress(data));
    setCity(data.city?.trim() || data.billingAddress?.city?.trim() || "");
    setLoadedCustomerId(data.id?.trim() || null);
    setLoadedCustomerCode(data.customerCode?.trim() || null);
    setPhoneVerifiedAt(data.phoneVerifiedAt ?? null);
    setEmailVerifiedAt(data.emailVerifiedAt ?? null);
    const p10 = phoneLast10((data.phone ?? "").trim());
    verifiedBillPhoneLast10Ref.current = p10.length === 10 ? p10 : "";
    setCustomerChecked(true);
    setWalkInPending(false);
    setHandoverVerified(false);
    lastAutoLookupPhoneRef.current = p10.length === 10 ? p10 : "";
    const custKey = data.id?.trim() || p10;
    if (custKey && !isFullyOtpVerified(data.phoneVerifiedAt, data.emailVerifiedAt)) {
      if (unverifiedAlertShownForRef.current !== custKey) {
        unverifiedAlertShownForRef.current = custKey;
        window.alert(UNVERIFIED_CUSTOMER_ALERT_MESSAGE);
      }
    }
  }, []);

  const checkCustomerInDb = useCallback(async () => {
    setError(null);
    setCustomerCheckMsg(null);
    const rawPhone = phoneInputRef.current;
    if (!rawPhone) {
      setCustomerChecked(false);
      verifiedBillPhoneLast10Ref.current = "";
      setCustomerCheckMsg(null);
      return;
    }
    const p10 = phoneLast10(rawPhone);
    if (p10.length !== 10) {
      setCustomerChecked(false);
      if (p10.length > 0) verifiedBillPhoneLast10Ref.current = "";
      setCustomerCheckMsg(p10.length > 0 ? "Enter full 10-digit mobile number." : null);
      return;
    }
    setCheckingCustomer(true);
    try {
      const data = await apiJson<{ customer: LoadedCustomerRow | null }>(
        `/api/customers?phone=${encodeURIComponent(rawPhone)}`,
      );
      if (data.customer) {
        applyLoadedCustomer(data.customer);
        setCustomerCheckMsg("Existing customer found and loaded.");
      } else {
        const local = customers.find((c) => phoneLast10(c.phone) === p10);
        if (local) {
          applyLoadedCustomer({
            id: local.id,
            customerCode: local.customerCode,
            displayName: local.displayName,
            phone: local.phone,
            alternatePhone: local.alternatePhone,
            email: local.email,
            address: local.address,
            city: local.city,
            billingAddress: local.billingAddress,
            customerKind: local.customerKind,
            company: local.company,
            gst: local.gst,
            pan: local.pan,
            phoneVerifiedAt: local.phoneVerifiedAt ?? null,
            emailVerifiedAt: local.emailVerifiedAt ?? null,
          });
          setCustomerCheckMsg("Existing customer found locally.");
        } else {
          setCustomerChecked(false);
          verifiedBillPhoneLast10Ref.current = "";
          setWalkInPending(false);
          setLoadedCustomerId(null);
          setLoadedCustomerCode(null);
          setHandoverVerified(false);
          setCustomerCheckMsg("New mobile — opening customer registration…");
          redirectToCustomerRegister(rawPhone);
          return;
        }
      }
    } catch (e) {
      const local = customers.find((c) => phoneLast10(c.phone) === p10);
      if (local) {
        applyLoadedCustomer({
          id: local.id,
          customerCode: local.customerCode,
          displayName: local.displayName,
          phone: local.phone,
          alternatePhone: local.alternatePhone,
          email: local.email,
          address: local.address,
          city: local.city,
          billingAddress: local.billingAddress,
          customerKind: local.customerKind,
          company: local.company,
          gst: local.gst,
          pan: local.pan,
          phoneVerifiedAt: local.phoneVerifiedAt ?? null,
          emailVerifiedAt: local.emailVerifiedAt ?? null,
        });
        setCustomerCheckMsg("Customer found locally (server lookup unavailable).");
      } else {
        setError(e instanceof Error ? e.message : "Could not check customer.");
      }
    } finally {
      setCheckingCustomer(false);
    }
  }, [applyLoadedCustomer, customers, redirectToCustomerRegister]);

  useEffect(() => {
    const rp = searchParams.get("restorePhone");
    if (!rp) return;
    setPhone(rp);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useLayoutEffect(() => {
    const customerId = searchParams.get("customerId");
    const phoneHint = searchParams.get("phone");
    const resume = searchParams.get("resumeCustomer");
    if (!customerId) return;
    if (resume && resume !== "1") return;
    if (phoneHint) setPhone((prev) => prev.trim() || phoneHint);

    const fromRecord = (row: LoadedCustomerRow) => {
      applyLoadedCustomer(row);
      setCustomerCheckMsg("Customer saved — continue with watch and bill lines.");
    };

    const local = getById(customerId);
    if (local) {
      fromRecord({
        id: local.id,
        customerCode: local.customerCode,
        displayName: local.displayName,
        phone: local.phone,
        alternatePhone: local.alternatePhone,
        email: local.email,
        address: local.address,
        city: local.city,
        billingAddress: local.billingAddress,
        customerKind: local.customerKind,
        company: local.company,
        gst: local.gst,
        pan: local.pan,
        phoneVerifiedAt: local.phoneVerifiedAt ?? null,
        emailVerifiedAt: local.emailVerifiedAt ?? null,
      });
      setSearchParams({}, { replace: true });
      return;
    }

    if (!phoneHint) {
      setSearchParams({}, { replace: true });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const byId = await apiJson<{ customer: LoadedCustomerRow | null }>(
          `/api/customers?id=${encodeURIComponent(customerId)}`,
        );
        if (!cancelled && byId.customer) {
          fromRecord(byId.customer);
          return;
        }

        let found: LoadedCustomerRow | null = null;
        for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
          const data = await apiJson<{ customer: LoadedCustomerRow | null }>(
            `/api/customers?phone=${encodeURIComponent(phoneHint)}`,
          );
          if (data.customer) {
            found = data.customer;
            break;
          }
          await new Promise((r) => setTimeout(r, 140));
        }
        if (!cancelled && found) fromRecord(found);
        else if (!cancelled) setError("Could not load the new customer. Try registration again.");
      } catch {
        if (!cancelled) setError("Could not load saved customer. Check API connection.");
      } finally {
        if (!cancelled) setSearchParams({}, { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, getById, setSearchParams, applyLoadedCustomer]);

  useEffect(() => {
    if (customerType === "B2B" && isValidGstFormat(gst)) {
      const derived = panFromGstin(gst);
      if (derived) setPan((prev) => prev.trim() || derived);
    }
  }, [gst, customerType]);

  useEffect(() => {
    const normalized = phoneLast10(phone);
    if (normalized === lastAutoLookupPhoneRef.current) return;
    verifiedBillPhoneLast10Ref.current = "";
    setCustomerChecked(false);
    setWalkInPending(false);
    setHandoverVerified(false);
    setLoadedCustomerId(null);
    setLoadedCustomerCode(null);
    if (autoLookupTimerRef.current) window.clearTimeout(autoLookupTimerRef.current);
    autoLookupTimerRef.current = window.setTimeout(() => {
      lastAutoLookupPhoneRef.current = normalized;
      void checkCustomerInDb();
    }, 450);
    return () => {
      if (autoLookupTimerRef.current) window.clearTimeout(autoLookupTimerRef.current);
    };
  }, [phone, checkCustomerInDb]);

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

  const effectiveBillingRegionId = useMemo(
    () => resolveOperatingRegionId(user?.role, user?.regionId, billingRegionId),
    [user?.role, user?.regionId, billingRegionId],
  );
  const effectiveBillingStoreId = useMemo(
    () => resolveOperatingStoreId(user?.role, user?.storeId, user?.storeIds, billingStoreId),
    [user?.role, user?.storeId, user?.storeIds, billingStoreId],
  );
  const billingStoreOptions = useMemo(
    () => storesForRegion(regions, effectiveBillingRegionId),
    [regions, effectiveBillingRegionId],
  );
  const showHoBillingLocation = isHoServiceOperator(user?.role);

  const priceRegionQuery = useMemo(() => {
    return effectiveBillingRegionId ? `?regionId=${encodeURIComponent(effectiveBillingRegionId)}` : "";
  }, [effectiveBillingRegionId]);

  const stockQuerySuffix = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("aggregate", "region");
    if (user?.role === "super_admin" && billingRegionId.trim()) {
      qs.set("regionId", billingRegionId.trim());
    }
    return `?${qs.toString()}`;
  }, [user?.role, billingRegionId]);

  useEffect(() => {
    if (!apiMode || user?.role !== "super_admin") return;
    if (regions.length > 0 && !billingRegionId) setBillingRegionId(regions[0]!.id);
  }, [apiMode, user?.role, regions, billingRegionId]);

  useEffect(() => {
    if (!apiMode || !hoNeedsOperatingStorePicker(user?.role, user?.storeId, user?.storeIds)) return;
    if (!effectiveBillingRegionId) return;
    const defaultId = pickDefaultStoreId(regions, effectiveBillingRegionId, user?.storeId);
    if (defaultId && !billingStoreId) setBillingStoreId(defaultId);
  }, [
    apiMode,
    user?.role,
    user?.storeId,
    user?.storeIds,
    regions,
    effectiveBillingRegionId,
    billingStoreId,
  ]);

  useEffect(() => {
    if (!billingStoreId || billingStoreOptions.some((s) => s.id === billingStoreId)) return;
    const defaultId = pickDefaultStoreId(regions, effectiveBillingRegionId, null);
    if (defaultId) setBillingStoreId(defaultId);
  }, [billingStoreId, billingStoreOptions, regions, effectiveBillingRegionId]);

  useEffect(() => {
    void apiJson<{ rows: TechnicianProfile[] }>("/api/service/technicians?activeOnly=1")
      .then((out) => {
        setTechnicians(out.rows);
        setTechnicianId((prev) => prev || out.rows[0]?.id || "");
      })
      .catch(() => setTechnicians([]));
  }, []);

  function onWatchBrandChange(nextBrand: string) {
    setWatchBrand(nextBrand);
    setWatchFamily("");
    setWatchFamilyIsNew(false);
    setWatchModel("");
    setWatchModelIsNew(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function loadBrandSpareOptions() {
      if (spares.length === 0) {
        setSpareOptions([]);
        return;
      }
      setSpareOptionsLoading(true);
      try {
        const resolved = await Promise.all(
          spares.map(async (spare) => {
            try {
              const [priceData, stockData] = await Promise.all([
                apiJson<{ prices: SparePriceLine[] }>(
                  `/api/catalog/spares/${encodeURIComponent(spare.id)}/prices${priceRegionQuery}`,
                ),
                apiJson<{ stock: SpareStockRow[] }>(
                  `/api/catalog/spares/${encodeURIComponent(spare.id)}/stock${stockQuerySuffix}`,
                ),
              ]);
              const matchedPrice = priceData.prices.find(
                (p) => p.brand.trim().toLowerCase() === watchBrand.trim().toLowerCase(),
              );
              if (!matchedPrice) return null;
              const stockQty = stockData.stock.reduce((sum, row) => sum + row.quantity, 0);
              return {
                id: spare.id,
                sku: spare.sku,
                name: spare.name,
                price: matchedPrice.price,
                stockQty,
              } satisfies QuickBillSpareOption;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        const sorted = resolved
          .filter((r): r is QuickBillSpareOption => Boolean(r))
          .sort((a, b) => a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku));
        setSpareOptions(sorted);
      } catch {
        if (!cancelled) setSpareOptions([]);
      } finally {
        if (!cancelled) setSpareOptionsLoading(false);
      }
    }
    void loadBrandSpareOptions();
    return () => {
      cancelled = true;
    };
  }, [spares, watchBrand, priceRegionQuery, stockQuerySuffix]);

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addChargeLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function handleManualLineAmount(id: string, raw: string) {
    const amount = sanitizeDecimalInput(raw);
    const n = Number.parseFloat(amount);
    if (Number.isFinite(n) && n > 0) {
      const err = validateStoreServiceAmountInr(n, user?.role);
      if (err) {
        setError(err);
        return;
      }
    }
    setError(null);
    updateLine(id, { amount });
  }

  function handleServiceChargeChange(raw: string) {
    const amount = sanitizeDecimalInput(raw);
    const n = Number.parseFloat(amount);
    if (Number.isFinite(n) && n > 0) {
      const err = validateStoreServiceAmountInr(n, user?.role);
      if (err) {
        setError(err);
        return;
      }
    }
    setError(null);
    setServiceChargeInr(amount);
  }

  async function addPartLine(spareId: string) {
    const spare = spareOptions.find((s) => s.id === spareId);
    if (!spare) {
      const fallback = spares.find((s) => s.id === spareId);
      setError(
        fallback
          ? `No ${watchBrand} price for ${fallback.name} (${fallback.sku}) in this region — add it under Inventory → Spare catalogue.`
          : "Spare not found.",
      );
      return;
    }
    try {
      if (spare.stockQty <= 0) {
        setError(`${spare.name} (${spare.sku}) is out of stock.`);
        setPartPick("");
        return;
      }
      setLines((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          description: `${spare.name} (${spare.sku})`,
          amount: String(spare.price),
          spareId: spare.id,
          qty: 1,
        },
      ]);
      setError(null);
      setPartPick("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not fetch spare amount/stock.");
      setPartPick("");
    }
  }

  function addScannedSku() {
    const sku = barcodeSku.trim().toUpperCase();
    if (!sku) return;
    const option = spareOptions.find((s) => s.sku.toUpperCase() === sku);
    if (!option) {
      setError(
        `Scanned SKU ${sku} has no ${watchBrand} price in this region (or is out of stock).`,
      );
      setBarcodeSku("");
      return;
    }
    void addPartLine(option.id);
    setBarcodeSku("");
  }

  const captureUrl = useMemo(() => {
    if (!captureSession?.captureUrl) return "";
    return new URL(captureSession.captureUrl, window.location.origin).toString();
  }, [captureSession?.captureUrl]);

  const refreshCaptureSession = useCallback(async () => {
    if (!captureSession?.sessionId || !apiMode) return;
    try {
      const data = await apiJson<{
        documentPath: string | null;
        imagePath: string | null;
      }>(`/api/service/quick-bill/capture-session/${encodeURIComponent(captureSession.sessionId)}`);
      if (data.documentPath) setWatchDocumentPath(data.documentPath);
      if (data.imagePath) setWatchImagePath(data.imagePath);
      const parts: string[] = [];
      if (data.documentPath) parts.push("document");
      if (data.imagePath) parts.push("image");
      setCaptureMsg(parts.length > 0 ? `Customer uploaded: ${parts.join(" & ")}.` : "Waiting for customer uploads…");
    } catch {
      /* ignore poll errors */
    }
  }, [apiMode, captureSession?.sessionId]);

  useEffect(() => {
    if (!captureSession?.sessionId || !apiMode) return;
    void refreshCaptureSession();
    const t = window.setInterval(() => void refreshCaptureSession(), 6000);
    return () => window.clearInterval(t);
  }, [captureSession?.sessionId, apiMode, refreshCaptureSession]);

  async function createCaptureLink() {
    if (!apiMode) {
      setError("Customer upload link requires API mode.");
      return;
    }
    const regionId = effectiveBillingRegionId;
    const storeId = effectiveBillingStoreId;
    if (!regionId || !storeId) {
      setError(
        showHoBillingLocation
          ? "Select billing region and store before generating an upload link."
          : "Your login must be mapped to a store to generate an upload link.",
      );
      return;
    }
    setCaptureLinkBusy(true);
    setCaptureMsg(null);
    setError(null);
    try {
      const data = await apiJson<{
        sessionId: string;
        token: string;
        captureUrl: string;
      }>("/api/service/quick-bill/capture-session", {
        method: "POST",
        json: {
          regionId,
          storeId,
          customerName: customerName.trim() || "Customer",
          watchBrand: watchBrand.trim(),
          watchModel: watchModel.trim(),
        },
      });
      setCaptureSession(data);
      setCaptureMsg("Share the QR or link with the customer.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create upload link.");
    } finally {
      setCaptureLinkBusy(false);
    }
  }

  async function refreshCaptureLink() {
    if (!captureSession?.sessionId || !apiMode) return;
    setCaptureLinkBusy(true);
    try {
      const data = await apiJson<{
        sessionId: string;
        token: string;
        captureUrl: string;
        documentPath: string | null;
        imagePath: string | null;
      }>(`/api/service/quick-bill/capture-session/${encodeURIComponent(captureSession.sessionId)}/refresh`, {
        method: "POST",
      });
      setCaptureSession({ sessionId: data.sessionId, token: data.token, captureUrl: data.captureUrl });
      if (data.documentPath) setWatchDocumentPath(data.documentPath);
      if (data.imagePath) setWatchImagePath(data.imagePath);
      setCaptureMsg("New upload link generated.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not refresh link.");
    } finally {
      setCaptureLinkBusy(false);
    }
  }

  async function removeCaptureAttachment(kind: "doc" | "img") {
    if (captureSession?.sessionId && apiMode) {
      try {
        await apiJson(
          `/api/service/quick-bill/capture-session/${encodeURIComponent(captureSession.sessionId)}/attachment?kind=${kind}`,
          { method: "DELETE" },
        );
      } catch {
        /* still clear local */
      }
    }
    if (kind === "doc") setWatchDocumentPath(null);
    else setWatchImagePath(null);
  }

  function clearWatchDocumentUpload() {
    if (!window.confirm("Remove the uploaded document? The customer can upload again from the capture link.")) return;
    void removeCaptureAttachment("doc");
  }

  function clearWatchImageUpload() {
    if (!window.confirm("Remove the uploaded image? The customer can upload again from the capture link.")) return;
    void removeCaptureAttachment("img");
  }

  function validateBeforeOtp(opts?: { skipHandoverCheck?: boolean }): boolean {
    setError(null);
    if (
      customerChecked &&
      loadedCustomerId &&
      !isFullyOtpVerified(phoneVerifiedAt, emailVerifiedAt)
    ) {
      window.alert(UNVERIFIED_CUSTOMER_ALERT_MESSAGE);
    }
    if (customerType === "B2B") {
      if (!company.trim()) {
        setError("B2B: company / legal name is required to create the customer.");
        return false;
      }
      if (!isValidGstFormat(gst)) {
        setError("B2B: enter a valid 15-character GSTIN.");
        return false;
      }
      const zimsonGstErr = validateCustomerB2bGstin(gst);
      if (zimsonGstErr) {
        setError(zimsonGstErr);
        return false;
      }
      const panValue = pan.trim() || panFromGstin(gst) || "";
      if (!isValidPanFormat(panValue)) {
        setError("B2B: enter a valid PAN or GSTIN that contains a valid PAN.");
        return false;
      }
      if (!customerName.trim() || !phone.trim()) {
        setError("B2B: contact person name and phone are required for the customer record.");
        return false;
      }
    }
    const phoneDigits = phoneLast10(phone.trim());
    if (phoneDigits.length === 10) {
      if (!opts?.skipHandoverCheck && !handoverVerified) {
        setError(
          "Verify handover with OTP (primary or other mobile/email) before generating the invoice.",
        );
        return false;
      }
      const inCustomersList = customers.some((c) => phoneLast10(c.phone) === phoneDigits);
      if (!customerChecked && !inCustomersList && !walkInPending) {
        setError("Wait for customer lookup to finish.");
        return false;
      }
      if (!customerChecked && inCustomersList) {
        const hit = customers.find((c) => phoneLast10(c.phone) === phoneDigits);
        if (hit) {
          applyLoadedCustomer({
            id: hit.id,
            customerCode: hit.customerCode,
            displayName: hit.displayName,
            phone: hit.phone,
            alternatePhone: hit.alternatePhone,
            email: hit.email,
            address: hit.address,
            city: hit.city,
            billingAddress: hit.billingAddress,
            customerKind: hit.customerKind,
            company: hit.company,
            gst: hit.gst,
            pan: hit.pan,
            phoneVerifiedAt: hit.phoneVerifiedAt ?? null,
            emailVerifiedAt: hit.emailVerifiedAt ?? null,
          });
        }
      }
    }
    if (!watchBrand || !watchFamily.trim() || !watchModel.trim()) {
      setError("Choose watch brand, family, and model (pick from list or use + add new).");
      return false;
    }
    if (apiMode && user?.role === "super_admin" && !billingRegionId.trim()) {
      setError("Select billing region (required to load prices and save the bill).");
      return false;
    }
    if (apiMode && user?.role === "admin" && !user?.regionId?.trim()) {
      setError("Your account is missing a region. Contact an administrator.");
      return false;
    }
    if (apiMode && hoNeedsOperatingStorePicker(user?.role, user?.storeId, user?.storeIds) && !effectiveBillingStoreId) {
      setError("Select billing store (required for upload link and to save the bill).");
      return false;
    }
    const parsed = lines
      .map((l) => ({
        description: l.description.trim(),
        amount: Number.parseFloat(l.amount),
      }))
      .filter((l) => l.description && !Number.isNaN(l.amount) && l.amount >= 0);
    const extra = Number.parseFloat(serviceChargeInr);
    if (parsed.length === 0 && (!Number.isFinite(extra) || extra <= 0)) {
      setError("Add at least one service line, a service/repair charge, or pick a part from the catalog.");
      return false;
    }
    if (Number.isFinite(extra) && extra < 0) {
      setError("Service / repair charge cannot be negative.");
      return false;
    }
    for (const l of lines) {
      const desc = l.description.trim();
      const amount = Number.parseFloat(l.amount);
      if (!desc || Number.isNaN(amount) || amount < 0) continue;
      if (!l.spareId) {
        const err = validateStoreServiceAmountInr(amount, user?.role);
        if (err) {
          setError(err);
          return false;
        }
      }
    }
    if (Number.isFinite(extra) && extra > 0) {
      const err = validateStoreServiceAmountInr(extra, user?.role);
      if (err) {
        setError(err);
        return false;
      }
    }
    const billTotal =
      lines.reduce((sum, l) => {
        const n = Number.parseFloat(l.amount);
        return sum + (Number.isNaN(n) ? 0 : n);
      }, 0) + (Number.isFinite(extra) && extra > 0 ? extra : 0);
    const payErr = validateMultiPaymentForm(multiPaymentForm, billTotal);
    if (payErr) {
      setError(payErr);
      return false;
    }
    return true;
  }

  function openHandoverOtp(mode: HandoverOtpMode) {
    if (!validateBeforeOtp({ skipHandoverCheck: true })) return;
    setHandoverModalMode(mode);
    setHandoverModalOpen(true);
  }

  async function saveBill(opts?: { skipHandoverCheck?: boolean }) {
    setError(null);
    if (!validateBeforeOtp(opts)) return;
    const parsedLines = lines
      .map((l) => ({
        description: l.description.trim(),
        amount: Number.parseFloat(l.amount),
        spareId: l.spareId,
        qty: l.qty ?? 1,
      }))
      .filter((l) => l.description && !Number.isNaN(l.amount) && l.amount >= 0);

    if (apiMode) {
      const regionId = effectiveBillingRegionId;
      if (!regionId) {
        setError("Missing region for this account. Select billing region or re-login.");
        return;
      }
      const storeIdForBill =
        user?.role === "store_user"
          ? user.storeId
          : effectiveBillingStoreId || null;
      if (
        (user?.role === "admin" || user?.role === "super_admin") &&
        hoNeedsOperatingStorePicker(user?.role, user?.storeId, user?.storeIds) &&
        !storeIdForBill
      ) {
        setError("Select a billing store at the top of the page before saving.");
        return;
      }
      const tech = technicians.find((t) => t.id === technicianId);
      const billTotal =
        parsedLines.reduce((sum, l) => sum + l.amount, 0) +
        (() => {
          const n = Number.parseFloat(serviceChargeInr);
          return Number.isFinite(n) && n > 0 ? n : 0;
        })();
      const paymentPayload = buildMultiPaymentPayload(multiPaymentForm, billTotal);
      if ("error" in paymentPayload) {
        setError(paymentPayload.error);
        return;
      }
      setIsSavingBill(true);
      try {
        const { invoice } = await apiJson<{ invoice: QuickBillInvoice }>("/api/service/quick-bills", {
          method: "POST",
          json: {
            regionId,
            storeId: storeIdForBill,
            customerType,
            customerId: loadedCustomerId,
            customerCode: loadedCustomerCode,
            customerName: customerName.trim() || null,
            phone: phone.trim() || null,
            email: email.trim() || null,
            company: company.trim() || null,
            gst: gst.trim().toUpperCase() || null,
            pan: pan.trim().toUpperCase() || null,
            address: address.trim() || null,
            city: city.trim() || null,
            watchBrand,
            watchFamily: watchFamily.trim(),
            watchModel: watchModel.trim(),
            watchRef: watchRef.trim() || null,
            watchRemark: watchRemark.trim(),
            ...watchServiceDetailsToApiPayload(watchServiceDetails),
            warrantyStatus,
            watchDocumentPath,
            watchImagePath,
            captureSessionId: captureSession?.sessionId ?? null,
            technicianId: technicianId || null,
            technicianName: tech?.fullName ?? null,
            paymentMode: paymentPayload.paymentMode,
            paymentDetails: paymentPayload.paymentDetails,
            notes: notes.trim(),
            persistNewWatchModel: watchModelIsNew,
            persistNewWatchFamily: watchFamilyIsNew,
            serviceChargeInr: (() => {
              const n = Number.parseFloat(serviceChargeInr);
              return Number.isFinite(n) && n > 0 ? n : undefined;
            })(),
            lines: parsedLines.map((l) => ({
              description: l.description,
              amount: l.amount,
              spareId: l.spareId,
              qty: l.qty,
            })),
          },
        });
        setCompletion({ mode: "api", invoice });
        setBillPostActionNote(null);
        setBillSuccessModalOpen(true);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not save quick bill to the server.");
      } finally {
        setIsSavingBill(false);
      }
      return;
    }

    setCompletion({ mode: "demo", ref: nextQuickBillRef() });
    setBillPostActionNote(null);
    setBillSuccessModalOpen(true);
  }

  function onHandoverVerified() {
    const p10 = phoneLast10(phone.trim());
    setHandoverVerified(true);
    verifiedBillPhoneLast10Ref.current = p10.length === 10 ? p10 : verifiedBillPhoneLast10Ref.current;
    setCustomerCheckMsg(null);
    setError(null);
    setHandoverModalOpen(false);
    void saveBill({ skipHandoverCheck: true });
  }

  const total =
    lines.reduce((sum, l) => {
      const n = Number.parseFloat(l.amount);
      return sum + (Number.isNaN(n) ? 0 : n);
    }, 0) + (() => {
      const n = Number.parseFloat(serviceChargeInr);
      return Number.isFinite(n) && n > 0 ? n : 0;
    })();

  const invoiceVmOptions = useMemo(
    () => ({
      defaultHsnSac: invoiceHsnSac,
      taxSettings: serviceTaxSettings,
      storeInvoice: seedStoreToInvoiceProfile(currentUserStore),
      generatedBy: user?.displayName?.trim() || user?.email?.trim() || user?.id || null,
    }),
    [invoiceHsnSac, serviceTaxSettings, currentUserStore, user?.displayName, user?.email, user?.id],
  );

  function resetForm() {
    setBillSuccessModalOpen(false);
    setBillPostActionNote(null);
    setCustomerType("B2C");
    setCustomerName("");
    setPhone("");
    setEmail("");
    setCompany("");
    setGst("");
    setPan("");
    setAddress("");
    setCity("");
    setWatchBrand("");
    setWatchFamily("");
    setWatchFamilyIsNew(false);
    setWatchModel("");
    setWatchModelIsNew(false);
    setWatchRef("");
    setWatchRemark("");
    setWatchServiceDetails(emptyWatchServiceDetailValues());
    setWarrantyStatus("unspecified");
    setWatchDocumentPath(null);
    setWatchImagePath(null);
    setLines([]);
    setServiceChargeInr("");
    setPartPick("");
    setTechnicianId(technicians[0]?.id ?? "");
    setMultiPaymentForm(emptyMultiPaymentForm());
    setNotes("");
    setError(null);
    setCompletion(null);
    setIsSavingBill(false);
    setHandoverVerified(false);
    setHandoverModalOpen(false);
    setCustomerChecked(false);
    setCustomerCheckMsg(null);
    lastAutoLookupPhoneRef.current = "";
    verifiedBillPhoneLast10Ref.current = "";
    setWhatsappSending(false);
    setEmailSending(false);
  }

  const handleSendInvoiceWhatsApp = useCallback(
    async (inv: QuickBillInvoice) => {
      const p10 = (inv.phone ?? phone).replace(/\D/g, "").slice(-10);
      if (p10.length !== 10) {
        setBillPostActionNote("Customer mobile (10 digits) is required for WhatsApp delivery.");
        return;
      }
      setWhatsappSending(true);
      setBillPostActionNote(null);
      try {
        const wa = await sendInvoiceWhatsApp({
          phone: p10,
          customerName: (inv.customerName ?? customerName).trim() || "Customer",
          invoiceNumber: inv.invoiceNumber || inv.billNumber,
        });
        setBillPostActionNote(
          wa.dryRun
            ? `Test mode: PDF on API server${wa.localViewUrl ? ` — open ${wa.localViewUrl}` : ""}. Set WHATSAPP_INVOICE_DRY_RUN=false to send real WhatsApp (uses Qikberry Work Drive if no public URL).`
            : "Invoice sent on WhatsApp successfully.",
        );
      } catch (e) {
        setBillPostActionNote(e instanceof Error ? e.message : "Could not send invoice on WhatsApp.");
      } finally {
        setWhatsappSending(false);
      }
    },
    [phone, customerName],
  );

  const handleSendInvoiceEmail = useCallback(
    async (inv: QuickBillInvoice) => {
      const to = (inv.email ?? email).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        setBillPostActionNote("Customer email is required to send the invoice.");
        return;
      }
      setEmailSending(true);
      setBillPostActionNote(null);
      try {
        await sendInvoiceEmail({
          email: to,
          customerName: (inv.customerName ?? customerName).trim() || "Customer",
          invoiceNumber: inv.invoiceNumber || inv.billNumber,
          totalInr: inv.totalInr,
        });
        setBillPostActionNote("Invoice sent by email successfully (PDF attached).");
      } catch (e) {
        setBillPostActionNote(e instanceof Error ? e.message : "Could not send invoice by email.");
      } finally {
        setEmailSending(false);
      }
    },
    [email, customerName],
  );

  if (completion?.mode === "api") {
    const inv = completion.invoice;
    const qbVm = mapQuickBillInvoiceToViewModel(inv, invoiceVmOptions);
    const totalFmt = inv.totalInr.toLocaleString(undefined, { style: "currency", currency: "INR" });

    return (
      <div>
        <ProcessSuccessModal
          open={billSuccessModalOpen}
          title="Quick bill saved successfully"
          description={`Invoice ${inv.billNumber} · ${totalFmt}`}
          onBackdropClick={() => setBillSuccessModalOpen(false)}
          actions={
            <>
              <button type="button" className={qbSuccessBtnPrimary} onClick={() => printServiceInvoice()}>
                Print invoice
              </button>
              <button
                type="button"
                className={qbSuccessBtnSecondary}
                disabled={emailSending || whatsappSending}
                onClick={() => void handleSendInvoiceEmail(inv)}
              >
                {emailSending ? "Sending email…" : "Send invoice by email"}
              </button>
              <button
                type="button"
                className={qbSuccessBtnSecondary}
                disabled={whatsappSending || emailSending}
                onClick={() => void handleSendInvoiceWhatsApp(inv)}
              >
                {whatsappSending ? "Sending on WhatsApp…" : "Send invoice on WhatsApp"}
              </button>
              <Link to="/service" className={`${qbSuccessBtnOutline} no-underline`}>
                Home
              </Link>
              <button type="button" className={qbSuccessBtnOutline} onClick={() => setBillSuccessModalOpen(false)}>
                View invoice below
              </button>
            </>
          }
        >
          {billPostActionNote ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950 ring-1 ring-amber-200/80">
              {billPostActionNote}
            </p>
          ) : (
            <p className="mt-3 text-xs text-stone-500">
              Email sends the invoice PDF via SMTP. WhatsApp uses your approved invoice template when configured.
            </p>
          )}
        </ProcessSuccessModal>

        <ServiceBreadcrumb current="Quick bill" className="print:hidden" />
        <PageHeader
          title="Quick bill"
          description="Bill saved. Print or start another sale from this screen — no separate invoicing page."
          className="print:hidden"
        />
        <QuickBillInvoicePanel viewModel={qbVm} onNew={resetForm} />
        <div className="mt-8 print:hidden">
          <Link
            to="/service/quick-bill-history"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Open quick bill history page
          </Link>
        </div>
      </div>
    );
  }

  if (completion?.mode === "demo") {
    const techName = technicians.find((t) => t.id === technicianId)?.fullName ?? null;
    const placeOfSupply =
      user?.regionId != null
        ? (regions.find((r) => r.id === user.regionId)?.name ?? user.regionId)
        : "—";
    const demoLines = lines
      .map((l) => ({
        description: l.description.trim(),
        amount: Number.parseFloat(l.amount),
      }))
      .filter((l) => l.description && !Number.isNaN(l.amount) && l.amount >= 0);
    const demoPayment = buildMultiPaymentPayload(multiPaymentForm, total);
    const demoVm = buildDemoServiceInvoiceViewModel(
      {
        billNumber: completion.ref,
        placeOfSupply,
        customerType,
        customerName,
        company,
        phone,
        email,
        gst,
        pan,
        customerCode: loadedCustomerCode ?? undefined,
        address: address.trim() || undefined,
        watchBrand,
        watchFamily: watchFamily.trim() || undefined,
        watchModel: watchModel.trim(),
        watchRef,
        watchRemark,
        ...watchServiceDetails,
        warrantyStatus,
        watchDocumentPath,
        watchImagePath,
        technicianName: techName,
        paymentMode: "error" in demoPayment ? "Cash" : demoPayment.paymentMode,
        paymentDetails: "error" in demoPayment ? {} : demoPayment.paymentDetails,
        notes,
        lines: demoLines,
        total,
      },
      invoiceVmOptions,
    );
    const demoTotalFmt = total.toLocaleString(undefined, { style: "currency", currency: "INR" });
    return (
      <div>
        <ProcessSuccessModal
          open={billSuccessModalOpen}
          title="Quick bill completed (demo)"
          description={`Reference ${completion.ref} · ${demoTotalFmt}`}
          onBackdropClick={() => setBillSuccessModalOpen(false)}
          actions={
            <>
              <button type="button" className={qbSuccessBtnPrimary} onClick={() => printServiceInvoice()}>
                Print invoice
              </button>
              <button
                type="button"
                className={qbSuccessBtnSecondary}
                disabled={
                  emailSending || !apiMode || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
                }
                onClick={() => {
                  setEmailSending(true);
                  void sendInvoiceEmail({
                    email: email.trim(),
                    customerName: customerName.trim() || "Customer",
                    invoiceNumber: completion.ref,
                    totalInr: total,
                  })
                    .then(() => setBillPostActionNote("Invoice sent by email successfully."))
                    .catch((e) =>
                      setBillPostActionNote(e instanceof Error ? e.message : "Could not send invoice by email."),
                    )
                    .finally(() => setEmailSending(false));
                }}
              >
                {emailSending ? "Sending email…" : "Send invoice by email"}
              </button>
              <Link to="/service" className={`${qbSuccessBtnOutline} no-underline`}>
                Home
              </Link>
              <button type="button" className={qbSuccessBtnOutline} onClick={() => setBillSuccessModalOpen(false)}>
                View invoice below
              </button>
            </>
          }
        >
          {billPostActionNote ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950 ring-1 ring-amber-200/80">
              {billPostActionNote}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-stone-500">
            Customer delivery covers email, SMS, and WhatsApp once integrations are enabled.
          </p>
        </ProcessSuccessModal>

        <ServiceBreadcrumb current="Quick bill" className="print:hidden" />
        <PageHeader title="Quick bill" description="Quick bill preview." className="print:hidden" />
        <QuickBillInvoicePanel viewModel={demoVm} onNew={resetForm} />
      </div>
    );
  }

  return (
    <FormPageShell breadcrumb="Quick bill" title="Quick bill">
      <div className={qbPage}>
      {apiMode && showHoBillingLocation ? (
        <Card
          title="Billing location"
          subtitle="Regional spare prices and the store on the quick bill. Required for HO admin accounts."
          className="mb-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {user?.role === "super_admin" ? (
              <label htmlFor="qb-bill-region" className="text-sm">
                <span className="text-xs font-medium text-stone-600">Region *</span>
                <select
                  id="qb-bill-region"
                  value={billingRegionId}
                  onChange={(e) => {
                    setBillingRegionId(e.target.value);
                    setBillingStoreId("");
                  }}
                  className={inputClass}
                >
                  <option value="">Select region</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="text-sm">
                <span className="text-xs font-medium text-stone-600">Region</span>
                <p className="mt-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-stone-800">
                  {regions.find((r) => r.id === user?.regionId)?.name ?? user?.regionId ?? "—"}
                </p>
              </div>
            )}
            {hoNeedsOperatingStorePicker(user?.role, user?.storeId, user?.storeIds) ? (
              <label htmlFor="qb-bill-store" className="text-sm">
                <span className="text-xs font-medium text-stone-600">Store *</span>
                <select
                  id="qb-bill-store"
                  value={billingStoreId}
                  onChange={(e) => setBillingStoreId(e.target.value)}
                  className={inputClass}
                  disabled={!effectiveBillingRegionId}
                >
                  <option value="">Select store</option>
                  {billingStoreOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </Card>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
        }}
        className="min-w-0 space-y-4 sm:space-y-5"
      >
        <Card
          title="Customer"
          subtitle={
            customerType === "B2B"
              ? "Business — customer master with GST & PAN (mandatory)"
              : ""
          }
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-4">
              <label
                className={`flex items-center gap-2 text-sm ${customerLockedFromDb ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
              >
                <input
                  type="radio"
                  name="qb-cust"
                  checked={customerType === "B2C"}
                  disabled={customerLockedFromDb}
                  onChange={() => {
                    setCustomerType("B2C");
                    setError(null);
                  }}
                  className="text-zimson-600 focus:ring-zimson-500"
                />
                B2C
              </label>
              <label
                className={`flex items-center gap-2 text-sm ${customerLockedFromDb ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
              >
                <input
                  type="radio"
                  name="qb-cust"
                  checked={customerType === "B2B"}
                  disabled={customerLockedFromDb}
                  onChange={() => {
                    setCustomerType("B2B");
                    setError(null);
                  }}
                  className="text-zimson-600 focus:ring-zimson-500"
                />
                B2B
              </label>
            </div>
            {customerLockedFromDb ? (
              <button
                type="button"
                onClick={clearLoadedCustomer}
                className="rounded-lg border border-zimson-400 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
              >
                Change customer
              </button>
            ) : null}
          </div>

          {customerType === "B2B" ? (
            <p className="mb-4 rounded-xl border border-zimson-200 bg-zimson-50/80 px-3 py-2 text-xs text-stone-700">
              Create / attach a <strong>business customer</strong>: company, GSTIN, PAN, and primary
              contact are required before completing the bill.
            </p>
          ) : null}

          <div className={qbGrid2}>
            <div className={qbField}>
              <label htmlFor="qb-customer-id" className="text-xs font-medium text-stone-600">
                Customer ID
              </label>
              <input
                id="qb-customer-id"
                readOnly
                value={loadedCustomerCode ?? ""}
                className={`${inputClass} bg-zimson-50/80 font-mono`}
                placeholder="—"
              />
            </div>
            <div className={qbField}>
              <label htmlFor="qb-phone" className="text-xs font-medium text-stone-600">
                {customerType === "B2B" ? "Contact phone *" : "Phone (optional)"}
              </label>
              <input
                id="qb-phone"
                value={phone}
                readOnly={customerLockedFromDb}
                onChange={
                  customerLockedFromDb
                    ? undefined
                    : (e) => setPhone(sanitizePhoneDigits(e.target.value, 15))
                }
                className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                placeholder="+91 …"
              />
            </div>
            {customerType === "B2B" ? (
              <div className={`${qbField} md:col-span-2`}>
                <label htmlFor="qb-company" className="text-xs font-medium text-stone-600">
                  Company name *
                </label>
                <input
                  id="qb-company"
                  value={company}
                  readOnly={customerLockedFromDb}
                  onChange={
                    customerLockedFromDb
                      ? undefined
                      : (e) => setCompany(sanitizeTextInput(e.target.value, 240))
                  }
                  className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                  placeholder="Registered business name"
                />
              </div>
            ) : null}
            {customerType === "B2B" ? (
              <>
                <div className={qbField}>
                  <label htmlFor="qb-gst" className="text-xs font-medium text-stone-600">
                    GSTIN *
                  </label>
                  <input
                    id="qb-gst"
                    value={gst}
                    readOnly={customerLockedFromDb}
                    onChange={
                      customerLockedFromDb
                        ? undefined
                        : (e) => setGst(sanitizeGstPanInput(e.target.value, 15))
                    }
                    className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                    placeholder="15-character GSTIN"
                    maxLength={15}
                  />
                  {!customerLockedFromDb ? (
                    <p className="mt-1 break-words text-[11px] leading-snug text-amber-900/90">
                      {ZIMSON_OWN_GSTIN_FIELD_HINT}
                    </p>
                  ) : null}
                </div>
                <div className={qbField}>
                  <label htmlFor="qb-pan" className="text-xs font-medium text-stone-600">
                    PAN *
                  </label>
                  <input
                    id="qb-pan"
                    value={pan}
                    readOnly={customerLockedFromDb}
                    onChange={
                      customerLockedFromDb
                        ? undefined
                        : (e) => setPan(sanitizeGstPanInput(e.target.value, 10))
                    }
                    className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                  />
                </div>
              </>
            ) : null}
            <div className={qbField}>
              <label htmlFor="qb-name" className="text-xs font-medium text-stone-600">
                {customerType === "B2B" ? "Contact person *" : "Customer name (optional)"}
              </label>
              <input
                id="qb-name"
                value={customerName}
                readOnly={customerLockedFromDb}
                onChange={
                  customerLockedFromDb
                    ? undefined
                    : (e) => setCustomerName(sanitizeTextInput(e.target.value, 240))
                }
                className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                placeholder={customerType === "B2B" ? "Name on account" : "Walk-in — optional"}
              />
            </div>
            <div className={qbField}>
              <label htmlFor="qb-email" className="text-xs font-medium text-stone-600">
                Email (optional)
              </label>
              <input
                id="qb-email"
                type="email"
                value={email}
                readOnly={customerLockedFromDb}
                onChange={
                  customerLockedFromDb ? undefined : (e) => setEmail(sanitizeEmailInput(e.target.value))
                }
                className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                placeholder="optional"
              />
            </div>
            {checkingCustomer ? (
              <p className="md:col-span-2 text-xs text-stone-500">Checking customer in DB…</p>
            ) : null}
            {customerCheckMsg ? (
              <p className="md:col-span-2 rounded-xl bg-zimson-50 px-3 py-2 text-sm text-stone-700">
                {customerCheckMsg}
                {customerLockedFromDb ? (
                  <span className="mt-1 block text-xs text-stone-600">
                    Customer master data is read-only. Use Change customer to search another mobile.
                  </span>
                ) : null}
              </p>
            ) : null}
            {customerChecked && loadedCustomerId && !isFullyOtpVerified(phoneVerifiedAt, emailVerifiedAt) ? (
              <div
                className="md:col-span-2 rounded-xl border-2 border-amber-500 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950"
                role="alert"
              >
                Alert: Customer not verified — complete mobile and email OTP in customer registration.
                <button
                  type="button"
                  onClick={() => redirectToCustomerRegister(phone.trim())}
                  className="ml-2 font-semibold text-zimson-900 underline"
                >
                  Verify now
                </button>
              </div>
            ) : null}
          </div>
        </Card>

        <Card title="Watch on counter" subtitle="">
          <div className="flex min-w-0 flex-col gap-4">
            <div className={qbPairRow}>
              <div className={qbField}>
                <label htmlFor="qb-brand" className="text-xs font-medium text-stone-600">
                  Brand *
                </label>
                <select
                  id="qb-brand"
                  value={watchBrand}
                  onChange={(e) => onWatchBrandChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select brand</option>
                  {brandNames.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div className={qbField}>
                <WatchFamilyPicker
                  watchBrand={watchBrand}
                  apiMode={apiMode}
                  family={watchFamily}
                  onFamilyChange={setWatchFamily}
                  onSelectionModeChange={setWatchFamilyIsNew}
                  disableAutoSelect
                  inputClass={inputClass}
                  idPrefix="qb"
                />
              </div>
            </div>
            <div className={qbPairRow}>
            <div className={qbField}>
              <WatchModelPicker
                watchBrand={watchBrand}
                apiMode={apiMode}
                model={watchModel}
                onModelChange={setWatchModel}
                onSelectionModeChange={setWatchModelIsNew}
                disableAutoSelect
                inputClass={inputClass}
                idPrefix="qb"
                serialHint={watchRef}
                onSerialHintFromModel={setWatchRef}
              />
            </div>
            <div className={qbField}>
              <label htmlFor="qb-ref" className="text-xs font-medium text-stone-600">
                Serial number (optional)
              </label>
              <input
                id="qb-ref"
                value={watchRef}
                onChange={(e) => setWatchRef(sanitizeAlphanumericInput(e.target.value, 48))}
                className={inputClass}
                placeholder="Case / movement serial"
              />
            </div>
            </div>
            <WatchServiceDetailFields
              idPrefix="qb"
              inputClass={inputClass}
              values={watchServiceDetails}
              onChange={(patch) => setWatchServiceDetails((prev) => ({ ...prev, ...patch }))}
            />
            <div className={qbField}>
              <label htmlFor="qb-watch-remark" className="text-xs font-medium text-stone-600">
                Remark
              </label>
              <textarea
                id="qb-watch-remark"
                rows={2}
                value={watchRemark}
                onChange={(e) => setWatchRemark(sanitizeTextInput(e.target.value, 200))}
                className={inputClass}
                placeholder="Condition notes, accessories, etc."
              />
            </div>
            <div className={qbField}>
              <label htmlFor="qb-warranty" className="text-xs font-medium text-stone-600">
                Warranty
              </label>
              <select
                id="qb-warranty"
                value={warrantyStatus}
                onChange={(e) => setWarrantyStatus(e.target.value as QuickBillWarrantyStatus)}
                className={inputClass}
              >
                <option value="unspecified">Not specified</option>
                <option value="none">No manufacturer warranty</option>
                <option value="under_warranty">Under warranty (bill impact — to finalise)</option>
                <option value="extended">Extended warranty (bill impact — to finalise)</option>
              </select>
            </div>
            <div className={`${qbField} min-w-0 rounded-xl border border-zimson-200 bg-zimson-50/50 p-3 sm:p-4`}>
              <p className="text-sm font-semibold text-zimson-900">Document &amp; watch image (customer link)</p>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">
                Like SRF booking: generate a QR/link for the customer to upload document and watch photo from their phone. Store staff do not upload files here.
              </p>
              <div className="mt-3 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start">
                <div className="mx-auto w-full max-w-[200px] shrink-0 lg:mx-0">
                  {captureUrl ? (
                    <CustomerLinkQr
                      url={captureUrl}
                      size={180}
                      mode="qr"
                      caption="Scan to upload"
                      className="mx-auto text-center"
                    />
                  ) : (
                    <div className="flex min-h-[140px] items-center justify-center rounded-lg border border-dashed border-zimson-300 bg-white p-4 text-center text-xs text-stone-500">
                      QR appears after you generate a link
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2 text-sm">
                  {captureUrl ? (
                    <p className="break-all text-xs text-stone-500">{captureUrl}</p>
                  ) : null}
                  {captureMsg ? (
                    <p className="rounded-lg bg-white px-3 py-2 text-xs text-zimson-900">{captureMsg}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {!captureSession ? (
                      <button
                        type="button"
                        disabled={captureLinkBusy || !apiMode}
                        onClick={() => void createCaptureLink()}
                        className="rounded-lg bg-zimson-700 px-4 py-2 text-xs font-semibold text-white hover:bg-zimson-800 disabled:opacity-50"
                      >
                        {captureLinkBusy ? "Generating…" : "Generate upload link"}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={captureLinkBusy}
                          onClick={() => void refreshCaptureSession()}
                          className="rounded-lg border border-zimson-300 bg-white px-4 py-2 text-xs font-semibold text-zimson-900"
                        >
                          Refresh uploads
                        </button>
                        <button
                          type="button"
                          disabled={captureLinkBusy}
                          onClick={() => void refreshCaptureLink()}
                          className="rounded-lg border border-zimson-300 bg-white px-4 py-2 text-xs font-semibold text-zimson-900"
                        >
                          New link
                        </button>
                        {captureUrl ? (
                          <a
                            href={captureUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg bg-zimson-700 px-4 py-2 text-xs font-semibold text-white"
                          >
                            Open capture page
                          </a>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </div>
              {(watchDocumentPath || watchImagePath) ? (
                <div className="mt-4 rounded-lg border border-zimson-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Uploaded from customer link</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {watchDocumentPath ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                        <p className="text-xs font-semibold text-emerald-900">Document</p>
                        <p className="mt-1 truncate text-xs text-emerald-800">
                          {watchAttachmentDisplayName(watchDocumentPath)}
                        </p>
                        {watchDocumentPath.startsWith("/") ? (
                          <a
                            href={watchDocumentPath}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-block text-xs font-semibold text-zimson-700 underline"
                          >
                            Open document
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={clearWatchDocumentUpload}
                          className="mt-2 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-stone-200 p-3 text-xs text-stone-500">
                        No document yet
                      </div>
                    )}
                    {watchImagePath ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                        <p className="text-xs font-semibold text-emerald-900">Watch image</p>
                        {watchImagePath.startsWith("/") ? (
                          <img
                            src={watchImagePath}
                            alt="Watch from customer"
                            className="mt-2 max-h-40 w-full rounded-md border border-stone-200 object-contain bg-white"
                          />
                        ) : (
                          <p className="mt-1 text-xs text-emerald-800">{watchAttachmentDisplayName(watchImagePath)}</p>
                        )}
                        <button
                          type="button"
                          onClick={clearWatchImageUpload}
                          className="mt-2 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-stone-200 p-3 text-xs text-stone-500">
                        No watch image yet
                      </div>
                    )}
                  </div>
                </div>
              ) : captureSession ? (
                <p className="mt-4 text-xs text-stone-500">Waiting for customer to upload document and/or watch image…</p>
              ) : null}
            </div>
          </div>
        </Card>

        <Card title="Service lines" subtitle="">
          <div className="mb-4 flex min-w-0 flex-col gap-3 border-b border-zimson-100 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Add lines</p>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-md sm:flex-row">
                <input
                  value={barcodeSku}
                  onChange={(e) => setBarcodeSku(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addScannedSku();
                    }
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-zimson-400 bg-white px-2 py-2 text-xs font-semibold text-zimson-900 shadow-sm"
                  placeholder="Scan barcode / SKU"
                  aria-label="Scan barcode sku"
                />
                <button
                  type="button"
                  onClick={addScannedSku}
                  className="shrink-0 rounded-lg border border-zimson-400 bg-white px-3 py-2 text-xs font-semibold text-zimson-900 shadow-sm hover:bg-zimson-50"
                >
                  Add by scan
                </button>
              </div>
              <select
                value={partPick}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) void addPartLine(v);
                }}
                className="min-w-0 w-full rounded-lg border border-zimson-400 bg-white px-2 py-2 text-xs font-semibold text-zimson-900 shadow-sm sm:min-w-[12rem] sm:flex-1"
                aria-label="Add part from catalog"
              >
                <option value="">
                  {spareOptionsLoading
                    ? "Loading spares for selected brand…"
                    : `+ Spare with ${watchBrand} price in region…`}
                </option>
                {spareOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.sku}) — ₹{s.price} · qty {s.stockQty}
                    {s.stockQty <= 0 ? " · Out of stock" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-3">
            {lines.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zimson-200 bg-zimson-50/40 px-3 py-4 text-sm text-stone-600">
                Add spares from the catalog above. Use &quot;Add charge line&quot; or service charge below for labour /
                repair fees.
              </p>
            ) : (
              lines.map((line, index) => (
                <div
                  key={line.id}
                  className="grid min-w-0 grid-cols-1 gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-3 sm:grid-cols-[1fr_minmax(0,9rem)_auto] sm:items-end"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-stone-600">
                      {line.spareId ? "Spare" : "Description"}
                    </span>
                    <input
                      value={line.description}
                      readOnly={Boolean(line.spareId)}
                      onChange={
                        line.spareId
                          ? undefined
                          : (e) => updateLine(line.id, { description: sanitizeTextInput(e.target.value, 200) })
                      }
                      className={line.spareId ? `${inputClass} cursor-not-allowed bg-stone-100` : inputClass}
                      placeholder={`Line ${index + 1}`}
                    />
                  </div>
                  <div className="min-w-0 w-full">
                    <span className="text-xs font-medium text-stone-600">Amount (INR)</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.amount}
                      readOnly={Boolean(line.spareId)}
                      onChange={
                        line.spareId ? undefined : (e) => handleManualLineAmount(line.id, e.target.value)
                      }
                      className={line.spareId ? `${inputClass} cursor-not-allowed bg-stone-100` : inputClass}
                      placeholder="0"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 sm:w-auto"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addChargeLine}
                className="rounded-lg border border-zimson-400 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
              >
                Add charge line
              </button>
            </div>
            <div className="mt-4 w-full max-w-md rounded-xl border border-zimson-200/80 bg-white/80 p-3">
              <label htmlFor="qb-svc" className="text-xs font-medium text-stone-600">
                Service / repair charge (INR, optional)
              </label>
              <p className="text-[11px] text-stone-500">{storeServiceChargeMaxLabel(user?.role)}</p>
              <input
                id="qb-svc"
                type="number"
                min={0}
                step={0.01}
                value={serviceChargeInr}
                onChange={(e) => handleServiceChargeChange(e.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </div>
          </div>
          <p className="mt-4 text-right text-sm font-semibold text-stone-900">
            Total: {total.toLocaleString(undefined, { style: "currency", currency: "INR" })}
          </p>
        </Card>

        <Card title="Assignment & payment">
          <div className={qbGrid2}>
            <div className={qbField}>
              <label htmlFor="qb-tech" className="text-xs font-medium text-stone-600">
                Technician
              </label>
              <select
                id="qb-tech"
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value)}
                className={inputClass}
              >
                <option value="">Select technician</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} · {t.grade}
                  </option>
                ))}
              </select>
            </div>
            <div className={`${qbField} md:col-span-2`}>
              <MultiPaymentFields
                idPrefix="qb"
                amountLabel="bill"
                targetInr={total}
                form={multiPaymentForm}
                onChange={setMultiPaymentForm}
              />
            </div>
            <div className={`${qbField} md:col-span-2`}>
              <label htmlFor="qb-notes" className="text-xs font-medium text-stone-600">
                Notes
              </label>
              <textarea
                id="qb-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(sanitizeMultilineTextInput(e.target.value, 500))}
                className={inputClass}
                placeholder="Optional remarks for receipt"
              />
            </div>
          </div>
        </Card>

        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
            {error}
          </p>
        ) : null}

        <div className="space-y-3">
          <p className="text-xs text-stone-600">
            After OTP is verified (primary or other mobile/email), the bill is saved and the success popup opens
            automatically.
          </p>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => openHandoverOtp("primary")}
              disabled={
                handoverVerified ||
                isSavingBill ||
                (phoneLast10(phone).length !== 10 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
              }
              className="w-full rounded-xl border border-indigo-400 bg-indigo-50 px-4 py-2.5 text-center text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-5"
            >
              Send OTP to primary (mobile / email)
            </button>
            <button
              type="button"
              onClick={() => openHandoverOtp("custom")}
              disabled={handoverVerified || isSavingBill}
              className="w-full rounded-xl border border-indigo-400 bg-indigo-50 px-4 py-2.5 text-center text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-5"
            >
              Send OTP to other number / email
            </button>
            {isSavingBill ? (
              <span className="text-center text-sm font-medium text-stone-600 sm:text-left">Saving quick bill…</span>
            ) : null}
            <Link
              to="/service"
              className="inline-flex w-full items-center justify-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-center text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50 sm:w-auto sm:px-5"
            >
              Cancel
            </Link>
          </div>
        </div>
      </form>

      <CustomerHandoverOtpModal
        open={handoverModalOpen}
        mode={handoverModalMode}
        onClose={() => setHandoverModalOpen(false)}
        contactPhone={phone}
        contactEmail={email}
        onHandoverVerified={onHandoverVerified}
      />
      </div>
    </FormPageShell>
  );
}
