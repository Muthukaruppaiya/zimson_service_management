import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DemoOtpGate } from "../../components/service/DemoOtpGate";
import { useMessageAlert } from "../../hooks/useMessageAlert";
import { WatchFamilyPicker } from "../../components/service/WatchFamilyPicker";
import { CustomerLinkQr } from "../../components/service/CustomerLinkQr";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { Stepper } from "../../components/ui/Stepper";
import { useAuth } from "../../context/AuthContext";
import { useBrands } from "../../context/BrandsContext";
import { useCustomers } from "../../context/CustomersContext";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson, ApiError, useApiMode } from "../../lib/api";
import {
  buildMultiPaymentPayload,
  emptyMultiPaymentForm,
  formatPaymentSummary,
  validateMultiPaymentForm,
} from "../../lib/paymentModes";
import { MultiPaymentFields } from "../../components/service/MultiPaymentFields";
import { printEstimateDocument, printSrfDocument } from "../../lib/serviceDocuments";
import {
  generateDemoOtp,
  isValidGstFormat,
  isValidPanFormat,
  watchModelsForBrand,
} from "../../data/serviceSeed";
import type { CustomerAddressBlock } from "../../types/customer";
import type { SrfJob } from "../../types/srfJob";
import { UNVERIFIED_CUSTOMER_ALERT_MESSAGE } from "../../lib/customerVerification";
import { formatInr } from "../../lib/formatInr";
import {
  SRF_REPAIR_ROUTE_OPTIONS,
  normalizeSrfRepairRoute,
  type SrfRepairRoute,
} from "../../lib/srfRepairRoute";

const steps = ["Customer", "Watch", "Photos", "Estimate + OTP", "Review"] as const;

/**
 * Step 2 — "After-service handover store" dropdown.
 * Set to `true` when you want staff to pick another store; `false` keeps the control visible but read-only (still uses selected value / login store).
 */
const ENABLE_SRF_HANDOVER_STORE_SELECT = false;

/** Map DB billing JSON or legacy flat address into the SRF step-1 form. */
function formFieldsFromBillingOrLegacy(
  billing: CustomerAddressBlock | undefined | null,
  legacyLine?: string,
  legacyCity?: string,
): { line: string; city: string; state: string; country: string; pin: string } {
  const hasStructured =
    billing &&
    [billing.doorNo, billing.street, billing.city, billing.district, billing.state, billing.countryId, billing.pincode].some(
      (x) => String(x ?? "").trim(),
    );
  if (hasStructured && billing) {
    const line = [billing.doorNo, billing.street, billing.district]
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .join(", ");
    return {
      line: line || String(legacyLine ?? "").trim(),
      city: String(billing.city ?? "").trim() || String(legacyCity ?? "").trim(),
      state: String(billing.state ?? "").trim(),
      country: String(billing.countryId ?? "").trim(),
      pin: String(billing.pincode ?? "").trim(),
    };
  }
  return {
    line: String(legacyLine ?? "").trim(),
    city: String(legacyCity ?? "").trim(),
    state: "",
    country: "",
    pin: "",
  };
}

function isVerifiedTimestamp(iso: string | null): boolean {
  return Boolean(iso && String(iso).trim());
}

/** Customer is treated as fully OTP-verified after registration flow (mobile + email). */
function isFullyOtpVerified(phoneAt: string | null, emailAt: string | null): boolean {
  return isVerifiedTimestamp(phoneAt) && isVerifiedTimestamp(emailAt);
}

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none ring-zimson-400/40 placeholder:text-stone-400 transition focus:border-zimson-500 focus:ring-2";

type SrfWatchModelRow = { id: string; brand: string; model: string; refHint: string };

type SrfPhotoThumb = { id: string; photoKind?: string; filePath: string };

function photoKindLabel(kind?: string): string {
  const k = (kind ?? "other").trim();
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : "Other";
}

function SrfPhotoThumbTile({
  photo,
  imgClassName,
  wrapperClassName,
  onPreview,
}: {
  photo: SrfPhotoThumb;
  imgClassName: string;
  wrapperClassName?: string;
  onPreview: (photo: SrfPhotoThumb) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPreview(photo)}
      title="Click to preview"
      className={`group w-full cursor-zoom-in text-left transition hover:border-zimson-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-zimson-500 ${wrapperClassName ?? ""}`}
    >
      <img
        src={`/${photo.filePath}`}
        alt={photo.photoKind ?? "watch photo"}
        className={`${imgClassName} w-full rounded object-cover`}
      />
      <p className="mt-1 text-[11px] capitalize text-stone-600 group-hover:text-zimson-800">{photo.photoKind ?? "other"}</p>
    </button>
  );
}

export function SrfBookingV2Page() {
  const { user } = useAuth();
  const apiMode = useApiMode();
  const { regions } = useRegions();
  const { brands: catalogBrands } = useBrands();
  const { getById, customers } = useCustomers();
  const { showError: showOtpError, alertModal } = useMessageAlert();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { createDraftJob, refreshPhotoSession, finalizeJob, cancelDraftSrf, patchStoreDraftSrf, refreshJobs } = useSrfJobs();
  const brandNames = useMemo(() => catalogBrands.map((b) => b.name), [catalogBrands]);

  const [step, setStep] = useState(0);
  const [customerType, setCustomerType] = useState<"B2C" | "B2B">("B2C");
  const [customerName, setCustomerName] = useState("");
  const customerNameForNavRef = useRef("");
  customerNameForNavRef.current = customerName.trim();
  const [phone, setPhone] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [email, setEmail] = useState("");
  /** Street / door / building (line 1); city, state, country, PIN are separate. */
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [country, setCountry] = useState("");
  const [pincode, setPincode] = useState("");
  const [company, setCompany] = useState("");
  const [gst, setGst] = useState("");
  const [pan, setPan] = useState("");
  const [watchBrand, setWatchBrand] = useState("");
  const [watchFamily, setWatchFamily] = useState("");
  const [dbWatchModels, setDbWatchModels] = useState<SrfWatchModelRow[]>([]);
  const [catalogModelKey, setCatalogModelKey] = useState("");
  const [customModelText, setCustomModelText] = useState("");
  const [serial, setSerial] = useState("");
  const [savingWatchModel, setSavingWatchModel] = useState(false);
  const [watchModelSaveMsg, setWatchModelSaveMsg] = useState<string | null>(null);
  const [handoverStoreId, setHandoverStoreId] = useState("");
  /** Default: send to HO (standard dispatch flow). */
  const [repairRoute, setRepairRoute] = useState<SrfRepairRoute>("send_to_ho");
  const [complaint, setComplaint] = useState("");
  const [estimateAmount, setEstimateAmount] = useState("");
  const [estimatedFinishDate, setEstimatedFinishDate] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advancePaymentForm, setAdvancePaymentForm] = useState(emptyMultiPaymentForm);
  const [estimateRemarks, setEstimateRemarks] = useState("");
  const [obsCaseCrystal, setObsCaseCrystal] = useState("");
  const [obsGlassCrystal, setObsGlassCrystal] = useState("");
  const [obsStrapBracelet, setObsStrapBracelet] = useState("");
  const [obsHands, setObsHands] = useState("");
  const [obsCrownPushers, setObsCrownPushers] = useState("");
  const [obsMovement, setObsMovement] = useState("");
  const [obsWaterResistance, setObsWaterResistance] = useState("");
  const [obsAdditionalNotes, setObsAdditionalNotes] = useState("");
  const [repMovementOverhaul, setRepMovementOverhaul] = useState("");
  const [repPolishing, setRepPolishing] = useState("");
  const [repWaterKit, setRepWaterKit] = useState("");
  const [repBezel, setRepBezel] = useState("");
  const [repCrownStem, setRepCrownStem] = useState("");
  const [repGlassCrystal, setRepGlassCrystal] = useState("");
  const [repDialHands, setRepDialHands] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [srfRef, setSrfRef] = useState<string | null>(null);
  const [finalizedRepairRoute, setFinalizedRepairRoute] = useState<SrfRepairRoute>("send_to_ho");
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ srfId: string; reference: string; token: string; captureUrl: string } | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [photoPreview, setPhotoPreview] = useState<SrfPhotoThumb[]>([]);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [photoLightbox, setPhotoLightbox] = useState<{ src: string; label: string } | null>(null);

  const openPhotoPreview = useCallback((photo: SrfPhotoThumb) => {
    setPhotoLightbox({ src: `/${photo.filePath}`, label: photoKindLabel(photo.photoKind) });
  }, []);

  useEffect(() => {
    if (!photoLightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhotoLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoLightbox]);
  const [awaitingOtp, setAwaitingOtp] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [customerChecked, setCustomerChecked] = useState(false);
  const [customerExists, setCustomerExists] = useState(false);
  const [customerCheckMsg, setCustomerCheckMsg] = useState<string | null>(null);
  const [checkingCustomer, setCheckingCustomer] = useState(false);
  /** ISO timestamps from DB when customer was verified via OTP (null = not verified). */
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null);
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<string | null>(null);
  const [loadedCustomerId, setLoadedCustomerId] = useState<string | null>(null);
  const [loadedCustomerCode, setLoadedCustomerCode] = useState<string | null>(null);
  const [walkInPending, setWalkInPending] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const autoLookupTimerRef = useRef<number | null>(null);
  const lastAutoLookupPhoneRef = useRef("");
  const unverifiedAlertShownForRef = useRef<string | null>(null);

  const catalogModels = useMemo(() => {
    const seed = watchModelsForBrand(watchBrand).map((m) => ({
      id: m.id,
      brand: m.brand,
      model: m.model,
      refHint: m.refHint,
    }));
    const by = new Map<string, SrfWatchModelRow>();
    for (const m of seed) by.set(m.model.trim().toLowerCase(), m);
    for (const m of dbWatchModels) {
      const key = m.model.trim().toLowerCase();
      if (!by.has(key)) by.set(key, m);
    }
    return [...by.values()].sort((a, b) => a.model.localeCompare(b.model));
  }, [watchBrand, dbWatchModels]);

  const resolvedWatchModel = useMemo(() => {
    if (catalogModelKey === "__new__") return customModelText.trim();
    return catalogModelKey.trim();
  }, [catalogModelKey, customModelText]);

  useEffect(() => {
    if (!apiMode || !watchBrand.trim()) {
      setDbWatchModels([]);
      return;
    }
    let cancelled = false;
    setDbWatchModels([]);
    void apiJson<{ models: { id: string; brand: string; model: string; refHint: string | null }[] }>(
      `/api/service/watch-models?brand=${encodeURIComponent(watchBrand)}`,
    )
      .then((out) => {
        if (cancelled) return;
        setDbWatchModels(
          out.models.map((row) => ({
            id: row.id,
            brand: row.brand,
            model: row.model,
            refHint: row.refHint ?? "",
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setDbWatchModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [apiMode, watchBrand]);

  const fallbackStoreId = Array.isArray(user?.storeIds) && user.storeIds.length > 0 ? user.storeIds[0] : "";
  const currentStoreId = String(user?.storeId ?? fallbackStoreId ?? "").trim();
  const currentRegionId = String(user?.regionId ?? "").trim();
  const handoverStoreOptions = useMemo(() => {
    const region = regions.find((r) => r.id === currentRegionId);
    return region?.stores ?? [];
  }, [regions, currentRegionId]);
  const currentUserStore = useMemo(() => {
    const sid = currentStoreId;
    if (!sid) return undefined;
    for (const r of regions) {
      const s = r.stores.find((x) => x.id === sid);
      if (s) return s;
    }
    return undefined;
  }, [regions, currentStoreId]);
  const redirectToCustomerRegister = useCallback(
    (phoneRaw: string) => {
      const q = new URLSearchParams();
      if (phoneRaw.trim()) q.set("phone", phoneRaw.trim());
      const name = customerNameForNavRef.current;
      if (name) q.set("name", name);
      q.set("returnTo", "/service/srf");
      navigate(`/service/srf/new-customer?${q.toString()}`, { replace: true });
    },
    [navigate],
  );
  const estimateTotal = Number.parseFloat(estimateAmount) || 0;
  const advanceTotal = Number.parseFloat(advanceAmount) || 0;
  const advancePaymentSummary = useMemo(() => {
    if (advanceTotal <= 0) return "—";
    const built = buildMultiPaymentPayload(advancePaymentForm, advanceTotal);
    if ("error" in built) return built.error;
    return formatPaymentSummary(built.paymentMode, built.paymentDetails);
  }, [advanceTotal, advancePaymentForm]);
  const syncModelForBrand = useCallback((nextBrand: string) => {
    setWatchBrand(nextBrand);
    setWatchFamily("");
    const ms = watchModelsForBrand(nextBrand);
    if (ms.length === 0) {
      setCatalogModelKey("__new__");
      setCustomModelText("");
      setSerial("");
    } else {
      setCatalogModelKey(ms[0]!.model);
      setCustomModelText("");
      setSerial(ms[0]?.refHint ?? "");
    }
  }, []);

  useEffect(() => {
    if (brandNames.length === 0) return;
    if (!watchBrand || !brandNames.includes(watchBrand)) {
      syncModelForBrand(brandNames[0]!);
    }
  }, [brandNames, watchBrand, syncModelForBrand]);

  useEffect(() => {
    if (catalogModelKey === "__new__") return;
    const match = catalogModels.some((m) => m.model === catalogModelKey);
    if (match) return;
    if (catalogModels.length === 0) {
      setCatalogModelKey("__new__");
      setCustomModelText("");
      setSerial("");
      return;
    }
    setCatalogModelKey(catalogModels[0]!.model);
    setCustomModelText("");
    if (catalogModels[0]?.refHint) setSerial(catalogModels[0].refHint);
    else setSerial("");
  }, [catalogModels, catalogModelKey]);

  useEffect(() => {
    if (!handoverStoreId && currentStoreId) setHandoverStoreId(currentStoreId);
  }, [handoverStoreId, currentStoreId]);

  function validateCustomer() {
    if (!customerName.trim() || !phone.trim()) {
      setError("Customer name and phone are required.");
      return false;
    }
    if (customerType === "B2B") {
      if (!company.trim() || !isValidGstFormat(gst) || !isValidPanFormat(pan)) {
        setError("For B2B, company + valid GSTIN + valid PAN are required.");
        return false;
      }
    }
    if (!customerChecked && !walkInPending) {
      setError("Please check customer mobile against DB first.");
      return false;
    }
    return true;
  }

  function validateWatch() {
    if (!watchBrand || !watchFamily.trim() || !resolvedWatchModel || !serial.trim()) {
      setError("Watch brand, family, model, and serial are required.");
      return false;
    }
    return true;
  }
  function validateEstimate() {
    if (!complaint.trim()) {
      setError("Watch complaint is required.");
      return false;
    }
    if (!estimateAmount.trim() || estimateTotal <= 0) {
      setError("Enter a valid estimate amount.");
      return false;
    }
    if (advanceAmount.trim() && (!Number.isFinite(advanceTotal) || advanceTotal < 0)) {
      setError("Advance amount must be a valid non-negative number.");
      return false;
    }
    if (advanceTotal > 0) {
      const payErr = validateMultiPaymentForm(advancePaymentForm, advanceTotal);
      if (payErr) {
        setError(payErr);
        return false;
      }
    }
    return true;
  }

  async function ensureDraft() {
    if (draft) return draft;
    const regionId = String(user?.regionId ?? "").trim();
    const storeId = currentStoreId;
    const destinationStoreId = String(handoverStoreId || currentStoreId).trim();
    const customerNameValue = customerName.trim();
    const phoneValue = phone.trim();
    const watchBrandValue = watchBrand.trim();
    const watchFamilyValue = watchFamily.trim();
    const watchModelValue = resolvedWatchModel.trim();
    const serialValue = serial.trim();
    if (!regionId || !storeId) {
      throw new Error("Current login is not mapped to store/region. Please re-login and select the store.");
    }
    if (
      !customerNameValue ||
      !phoneValue ||
      !watchBrandValue ||
      !watchFamilyValue ||
      !watchModelValue ||
      !serialValue ||
      !destinationStoreId
    ) {
      throw new Error("Customer and watch details are required before creating SRF draft.");
    }
    const row = await createDraftJob({
      regionId,
      storeId,
      customerName: customerNameValue,
      phone: phoneValue,
      customerKind: customerType,
      company: customerType === "B2B" ? company : undefined,
      watchBrand: watchBrandValue,
      watchFamily: watchFamilyValue,
      watchModel: watchModelValue,
      serial: serialValue,
      destinationStoreId,
      repairRoute,
      complaint: "",
      estimateTotalInr: 0,
      selectedPartIds: [],
    });
    setDraft(row);
    return row;
  }

  async function refreshPhotoStatus() {
    try {
      const row = await ensureDraft();
      const data = await apiJson<{ photoCount: number; photos?: Array<{ id: string; photoKind?: string; filePath: string }> }>(
        `/api/public/srf-photo/session?token=${encodeURIComponent(row.token)}`,
      );
      setPhotoCount(data.photoCount ?? 0);
      setPhotoPreview(data.photos ?? []);
      setPhotoMsg((data.photoCount ?? 0) > 0 ? `${data.photoCount} photo(s) uploaded.` : "No photos yet.");
    } catch (e) {
      setPhotoMsg(e instanceof Error ? e.message : "Could not check uploads.");
    }
  }

  useEffect(() => {
    if (step !== 2) return;
    void refreshPhotoStatus();
    const t = window.setInterval(() => void refreshPhotoStatus(), 6000);
    return () => window.clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step !== 4 || !draft) return;
    void refreshPhotoStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draft?.srfId]);

  async function goNext() {
    setError(null);
    try {
      if (step === 0) {
        if (!validateCustomer()) return;
        if (
          customerExists &&
          customerChecked &&
          !isFullyOtpVerified(phoneVerifiedAt, emailVerifiedAt)
        ) {
          window.alert(UNVERIFIED_CUSTOMER_ALERT_MESSAGE);
        }
      }
      if (step === 1) {
        if (!validateWatch()) return;
        await ensureDraft();
      }
      if (step === 2 && photoCount <= 0) {
        setError("Upload at least one photo to continue.");
        return;
      }
      if (step === 3 && !validateEstimate()) return;
      setStep((s) => Math.min(s + 1, steps.length - 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not proceed to next step.");
    }
  }
  function goBack() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleCancelDraftSrf() {
    if (!draft) return;
    const r = cancelReason.trim();
    if (r.length < 3) {
      setError("Enter a cancellation reason (at least 3 characters).");
      return;
    }
    setCancelBusy(true);
    setError(null);
    try {
      await cancelDraftSrf(draft.srfId, r);
      setDraft(null);
      setPhotoCount(0);
      setPhotoPreview([]);
      setCancelReason("");
      setStep(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel SRF.");
    } finally {
      setCancelBusy(false);
    }
  }

  async function saveDraftEditsAndGoWatchStep() {
    if (!draft) {
      setStep(1);
      return;
    }
    setError(null);
    try {
      await patchStoreDraftSrf(draft.srfId, {
        customerName,
        phone,
        watchBrand,
        watchFamily: watchFamily.trim(),
        watchModel: resolvedWatchModel.trim(),
        serial,
      });
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save edits.");
    }
  }

  function phone10(v: string): string {
    const digits = v.replace(/\D/g, "");
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  type LoadedCustomer = {
    id?: string;
    customerCode?: string | null;
    displayName: string;
    phone: string;
    alternatePhone?: string;
    email: string;
    address?: string;
    city?: string;
    billingAddress?: CustomerAddressBlock | null;
    customerKind: "B2C" | "B2B";
    company?: string;
    gst?: string;
    pan?: string;
    phoneVerifiedAt?: string | null;
    emailVerifiedAt?: string | null;
  };

  function applyLoadedCustomer(data: LoadedCustomer) {
    setCustomerExists(true);
    setCustomerChecked(true);
    setWalkInPending(false);
    setLoadedCustomerId(data.id?.trim() || null);
    setLoadedCustomerCode(data.customerCode?.trim() || null);
    setCustomerType(data.customerKind);
    setCustomerName((data.displayName ?? "").trim());
    setPhone((data.phone ?? "").trim());
    setAlternatePhone(data.alternatePhone ?? "");
    setEmail(data.email ?? "");
    const f = formFieldsFromBillingOrLegacy(data.billingAddress, data.address, data.city);
    setAddress(f.line);
    setCity(f.city);
    setStateName(f.state);
    setCountry(f.country);
    setPincode(f.pin);
    setCompany(data.company ?? "");
    setGst(data.gst ?? "");
    setPan(data.pan ?? "");
    setPhoneVerifiedAt(data.phoneVerifiedAt != null && String(data.phoneVerifiedAt).trim() ? String(data.phoneVerifiedAt) : null);
    setEmailVerifiedAt(data.emailVerifiedAt != null && String(data.emailVerifiedAt).trim() ? String(data.emailVerifiedAt) : null);
    lastAutoLookupPhoneRef.current = phone10((data.phone ?? "").trim());
    const custKey = data.id?.trim() || phone10((data.phone ?? "").trim());
    if (custKey && !isFullyOtpVerified(data.phoneVerifiedAt ?? null, data.emailVerifiedAt ?? null)) {
      if (unverifiedAlertShownForRef.current !== custKey) {
        unverifiedAlertShownForRef.current = custKey;
        window.alert(UNVERIFIED_CUSTOMER_ALERT_MESSAGE);
      }
    }
  }

  useEffect(() => {
    const rp = searchParams.get("restorePhone");
    if (!rp) return;
    setPhone(rp);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useLayoutEffect(() => {
    const resumeStep = searchParams.get("resumeStep");
    const customerId = searchParams.get("customerId");
    const phoneHint = searchParams.get("phone");
    if (resumeStep !== "1" || !customerId) return;

    const fromRecord = (row: LoadedCustomer) => {
      applyLoadedCustomer(row);
      setCustomerCheckMsg("Customer registered. Continue with watch details.");
      setStep(1);
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
        const data = await apiJson<{ customer: LoadedCustomer | null }>(
          `/api/customers?phone=${encodeURIComponent(phoneHint)}`,
        );
        if (!cancelled && data.customer) {
          fromRecord(data.customer);
        } else if (!cancelled) {
          setError("Could not load the new customer. Try the registration page again.");
        }
      } catch {
        if (!cancelled) setError("Could not load saved customer. Check API connection.");
      } finally {
        if (!cancelled) setSearchParams({}, { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, getById, setSearchParams]);

  const continueSrfId = searchParams.get("continue")?.trim() ?? "";

  useLayoutEffect(() => {
    if (!continueSrfId || !user) return;

    let cancelled = false;
    const stripContinueParam = () => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("continue");
          return next;
        },
        { replace: true },
      );
    };

    void (async () => {
      try {
        const { jobs: list } = await apiJson<{ jobs: SrfJob[] }>("/api/service/srf-jobs");
        if (cancelled) return;
        const job = list.find((j) => j.id === continueSrfId);
        if (!job) {
          setError("Could not open this SRF. It may belong to another store or no longer exist.");
          stripContinueParam();
          return;
        }
        if (job.status !== "draft" && job.status !== "photo_pending") {
          setError("This SRF is no longer a pending booking.");
          stripContinueParam();
          return;
        }

        setError(null);
        setCustomerType(job.customerKind);
        setCustomerName(job.customerName);
        setPhone(job.phone);
        setCompany(job.company ?? "");
        setGst("");
        setPan("");

        const dest = String(job.destinationStoreId ?? job.storeId ?? "").trim();
        if (dest) setHandoverStoreId(dest);

        const brand = job.watchBrand.trim();
        setWatchBrand(brand);
        setWatchFamily((job.watchFamily ?? "").trim());
        const model = job.watchModel.trim();
        const seedModels = watchModelsForBrand(brand);
        const hit = seedModels.find((m) => m.model.trim() === model);
        if (hit) {
          setCatalogModelKey(hit.model);
          setCustomModelText("");
        } else {
          setCatalogModelKey("__new__");
          setCustomModelText(model);
        }
        setSerial(job.serial);

        setCustomerChecked(true);
        setCustomerExists(true);
        setCustomerCheckMsg("Resumed booking — review customer/watch if needed, then continue.");

        try {
          const data = await apiJson<{ customer: LoadedCustomer | null }>(
            `/api/customers?phone=${encodeURIComponent(job.phone)}`,
          );
          if (!cancelled && data.customer) applyLoadedCustomer(data.customer);
        } catch {
          /* optional */
        }

        const sess = await refreshPhotoSession(job.id);
        if (cancelled) return;

        setDraft({
          srfId: job.id,
          reference: job.reference,
          token: sess.token,
          captureUrl: sess.captureUrl,
        });
        setPhotoCount(job.photoCount ?? 0);
        setPhotoPreview(
          (job.photos ?? []).map((p) => ({
            id: p.id,
            photoKind: p.photoKind,
            filePath: p.filePath,
          })),
        );

        const pc = job.photoCount ?? 0;
        setStep(pc > 0 ? 3 : 2);
        /* Do not set srfRef here — it switches the whole page to the post-finalize success view. */

        await refreshJobs().catch(() => {});
        stripContinueParam();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not resume this booking.");
          stripContinueParam();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot resume from ?continue=; avoid re-running on form state churn
  }, [continueSrfId, user?.id, refreshPhotoSession, refreshJobs, setSearchParams]);

  async function checkCustomerInDb() {
    setError(null);
    setCustomerCheckMsg(null);
    if (!phone.trim()) {
      setCustomerChecked(false);
      setCustomerExists(false);
      setCustomerCheckMsg(null);
      setPhoneVerifiedAt(null);
      setEmailVerifiedAt(null);
      return;
    }
    const p10 = phone10(phone.trim());
    if (p10.length !== 10) {
      setCustomerChecked(false);
      setCustomerExists(false);
      setCustomerCheckMsg("Enter full 10-digit mobile number.");
      setPhoneVerifiedAt(null);
      setEmailVerifiedAt(null);
      return;
    }
    setCheckingCustomer(true);
    try {
      const data = await apiJson<{ customer: LoadedCustomer | null }>(`/api/customers?phone=${encodeURIComponent(phone.trim())}`);
      if (data.customer) {
        applyLoadedCustomer(data.customer);
        setCustomerCheckMsg("Existing customer found and loaded from DB.");
      } else {
        const local = customers.find((c) => phone10(c.phone) === p10);
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
          setCustomerExists(false);
          setCustomerChecked(false);
          setPhoneVerifiedAt(null);
          setEmailVerifiedAt(null);
          setWalkInPending(false);
          setLoadedCustomerId(null);
          setLoadedCustomerCode(null);
          setCustomerCheckMsg("New mobile — opening customer registration…");
          redirectToCustomerRegister(phone.trim());
          return;
        }
      }
    } catch (e) {
      const local = customers.find((c) => phone10(c.phone) === p10);
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
  }

  useEffect(() => {
    if (step !== 0) return;
    const normalized = phone10(phone);
    if (normalized === lastAutoLookupPhoneRef.current) return;
    setCustomerChecked(false);
    setCustomerExists(false);
    setWalkInPending(false);
    setLoadedCustomerId(null);
    setLoadedCustomerCode(null);
    setPhoneVerifiedAt(null);
    setEmailVerifiedAt(null);
    if (autoLookupTimerRef.current) window.clearTimeout(autoLookupTimerRef.current);
    autoLookupTimerRef.current = window.setTimeout(() => {
      lastAutoLookupPhoneRef.current = normalized;
      void checkCustomerInDb();
    }, 450);
    return () => {
      if (autoLookupTimerRef.current) window.clearTimeout(autoLookupTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, step]);

  async function regenerateCaptureLink() {
    if (!draft) return;
    const data = await refreshPhotoSession(draft.srfId);
    setDraft((prev) => (prev ? { ...prev, token: data.token, captureUrl: data.captureUrl } : prev));
    setPhotoCount(0);
    setPhotoMsg("Capture link regenerated.");
  }

  function beginOtp() {
    if (!validateEstimate()) return;
    setAwaitingOtp(generateDemoOtp());
    setOtpInput("");
  }

  function verifyOtpAndProceed() {
    if (!awaitingOtp) return;
    if (otpInput.trim() !== awaitingOtp) {
      showOtpError("Incorrect OTP. Please check the code and try again.", "OTP verification failed");
      return;
    }
    setAwaitingOtp(null);
    setOtpInput("");
    setStep(4);
  }

  async function saveNewWatchModelToCatalog() {
    const model =
      catalogModelKey === "__new__"
        ? customModelText.trim()
        : catalogModels.length === 0
          ? customModelText.trim()
          : "";
    if (!watchBrand.trim() || !model) return;
    if (!apiMode) {
      setWatchModelSaveMsg(null);
      setError("Turn on API mode (VITE_USE_API) to save models to the server.");
      return;
    }
    setSavingWatchModel(true);
    setWatchModelSaveMsg(null);
    setError(null);
    try {
      await apiJson<{ ok: boolean }>("/api/service/watch-models", {
        method: "POST",
        json: {
          brand: watchBrand.trim(),
          model,
          refHint: serial.trim() || null,
        },
      });
      const list = await apiJson<{ models: { id: string; brand: string; model: string; refHint: string | null }[] }>(
        `/api/service/watch-models?brand=${encodeURIComponent(watchBrand)}`,
      );
      setDbWatchModels(
        list.models.map((row) => ({
          id: row.id,
          brand: row.brand,
          model: row.model,
          refHint: row.refHint ?? "",
        })),
      );
      setCatalogModelKey(model);
      setCustomModelText("");
      setWatchModelSaveMsg("Saved — model is in the list for this brand.");
      window.setTimeout(() => setWatchModelSaveMsg(null), 4000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save model.");
    } finally {
      setSavingWatchModel(false);
    }
  }

  async function finalizeAndPrint() {
    setError(null);
    try {
      const row = await ensureDraft();
      const advancePay =
        advanceTotal > 0 ? buildMultiPaymentPayload(advancePaymentForm, advanceTotal) : null;
      if (advancePay && "error" in advancePay) {
        setError(advancePay.error);
        return;
      }
      const out = await finalizeJob(row.srfId, {
        complaint,
        estimateTotalInr: estimateTotal,
        estimatedFinishDate: estimatedFinishDate || null,
        advanceInr: advanceTotal,
        advancePaymentMode: advancePay ? advancePay.paymentMode : null,
        advancePaymentDetails: advancePay ? advancePay.paymentDetails : {},
        selectedPartIds: [],
        repairRoute,
      });
      printSrfDocument({
        reference: row.reference,
        customerName,
        phone,
        watchBrand,
        watchModel: resolvedWatchModel.trim(),
        serial,
        complaint,
        estimateTotalInr: estimateTotal,
        estimatedFinishDate: estimatedFinishDate || null,
        advanceInr: advanceTotal,
        advancePaymentMode: advancePay ? advancePay.paymentMode : null,
        advancePaymentDetails: advancePay ? advancePay.paymentDetails : null,
        photos: photoPreview,
      });
      printEstimateDocument(
        {
          ...(row as unknown as object),
          id: row.srfId,
          reference: row.reference,
          customerName,
          phone,
          watchBrand,
          watchModel: resolvedWatchModel.trim(),
          serial,
          complaint,
          estimateTotalInr: estimateTotal,
          estimatedFinishDate: estimatedFinishDate || null,
          usedSpares: [],
        } as unknown as import("../../types/srfJob").SrfJob,
        {
          observations: {
            caseCrystal: obsCaseCrystal,
            glassCrystal: obsGlassCrystal,
            strapBracelet: obsStrapBracelet,
            hands: obsHands,
            crownPushers: obsCrownPushers,
            movement: obsMovement,
            waterResistance: obsWaterResistance,
            additionalNotes: obsAdditionalNotes || estimateRemarks,
          },
          suggestedRepairs: {
            movementOverhaul: repMovementOverhaul,
            polishing: repPolishing,
            waterKit: repWaterKit,
            bezel: repBezel,
            crownStem: repCrownStem,
            glassCrystal: repGlassCrystal,
            dialHands: repDialHands,
          },
        },
      );
      setSrfRef(row.reference);
      setFinalizedRepairRoute(repairRoute);
      setTrackingUrl(out.trackingUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create SRF.");
    }
  }

  const captureUrl = useMemo(() => {
    if (!draft) return "";
    return new URL(draft.captureUrl, window.location.origin).toString();
  }, [draft]);

  if (srfRef) {
    return (
      <div>
        <ServiceBreadcrumb current="SRF booking" />
        <Card title="Service request booked" subtitle="SRF created — SRF form and estimate sent to print. Tax invoice is issued at store billing when the customer collects the watch.">
          <p className="text-sm text-stone-700">
            SRF reference <span className="font-mono font-bold text-zimson-900">{srfRef}</span>
          </p>
          <p className="mt-2 text-sm text-stone-600">
            {finalizedRepairRoute === "store_self" ? (
              <>
                Status is <strong>Pending store assign</strong>. Assign repair at your store, then bill the customer when
                done — this SRF is <strong>not</strong> sent to dispatch.
              </>
            ) : (
              <>
                Status is <strong>At store</strong>. Use store dispatch to create internal transfer at end of day.
              </>
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/service/srf" className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white">
              Book another SRF
            </Link>
            {finalizedRepairRoute === "store_self" ? (
              <Link
                to="/service/store-assign"
                className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900"
              >
                Go to store assign
              </Link>
            ) : (
              <Link
                to="/service/store-dispatch"
                className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900"
              >
                Go to dispatch
              </Link>
            )}
          </div>
          {trackingUrl ? (
            <div className="mt-5 rounded-xl border border-zimson-200 bg-zimson-50/40 p-4">
              <p className="text-sm font-semibold text-zimson-900">Customer tracking link</p>
              <p className="mt-1 break-all font-mono text-xs text-stone-700">{trackingUrl}</p>
              <p className="mt-1 text-xs text-stone-600">Share this URL with the customer via SMS/WhatsApp or scan the QR code.</p>
              <CustomerLinkQr url={trackingUrl} size={240} mode="qr" caption="Scan QR code to open customer review" className="mt-3" />
            </div>
          ) : null}
        </Card>
      </div>
    );
  }

  return (
    <div>
      <ServiceBreadcrumb current="SRF booking" />
      <PageHeader title="SRF booking" description="" />
      <div className="mb-6 rounded-2xl border border-zimson-200/80 bg-white/90 p-4 shadow-sm">
        <Stepper steps={[...steps]} activeIndex={step} />
      </div>
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      <div key={step} className="animate-srf-step-enter">
      {step === 0 ? (
        <Card title="Step 1 — Customer">
          <div className="mb-3 flex gap-4">
            <label className="text-sm"><input type="radio" checked={customerType === "B2C"} onChange={() => setCustomerType("B2C")} /> B2C</label>
            <label className="text-sm"><input type="radio" checked={customerType === "B2B"} onChange={() => setCustomerType("B2B")} /> B2B</label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm md:col-span-2">
              Customer ID
              <input
                readOnly
                className={`${inputClass} bg-zimson-50/80 font-mono`}
                value={loadedCustomerCode ?? ""}
                placeholder="—"
              />
            </label>
            <label className="text-sm md:col-span-2">
              Phone
              <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          <div className="mt-3 text-xs text-stone-500">
            {checkingCustomer ? "Checking customer in DB…" : "Customer check runs automatically after you enter a mobile number."}
          </div>
          {customerCheckMsg ? (
            <p className="mt-3 rounded-xl bg-zimson-50 px-3 py-2 text-sm text-stone-700">{customerCheckMsg}</p>
          ) : null}
          {phone10(phone).length === 10 && !checkingCustomer ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2 space-y-2">
                <label className="block text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <span>Customer name</span>
                    {customerExists && customerChecked ? (
                      isFullyOtpVerified(phoneVerifiedAt, emailVerifiedAt) ? (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Verified
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Unverified
                        </span>
                      )
                    ) : null}
                  </span>
                  <input className={inputClass} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </label>
                {customerExists && customerChecked && !isFullyOtpVerified(phoneVerifiedAt, emailVerifiedAt) ? (
                  <div
                    className="rounded-xl border-2 border-amber-500 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950"
                    role="alert"
                  >
                    Alert: Customer not verified — complete mobile and email OTP before handover.
                  </div>
                ) : null}
                {customerExists && customerChecked && !isFullyOtpVerified(phoneVerifiedAt, emailVerifiedAt) ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-amber-950">
                      Complete mobile and email OTP on customer registration to mark this customer verified.
                    </p>
                    <button
                      type="button"
                      onClick={() => redirectToCustomerRegister(phone.trim())}
                      className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                    >
                      Verify with OTP
                    </button>
                  </div>
                ) : null}
              </div>
              <label className="text-sm">Email<input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="text-sm">Alternate mobile<input className={inputClass} value={alternatePhone} onChange={(e) => setAlternatePhone(e.target.value)} /></label>
              <label className="text-sm md:col-span-2">
                Street / building address
                <textarea
                  className={inputClass}
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Door no., street, area"
                />
              </label>
              <label className="text-sm">
                City
                <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
              <label className="text-sm">
                State
                <input className={inputClass} value={stateName} onChange={(e) => setStateName(e.target.value)} />
              </label>
              <label className="text-sm">
                Country
                <input className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. India" />
              </label>
              <label className="text-sm">
                PIN code
                <input
                  className={inputClass}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="6-digit PIN"
                />
              </label>
              {customerType === "B2B" ? (
                <>
                  <label className="text-sm">Company<input className={inputClass} value={company} onChange={(e) => setCompany(e.target.value)} /></label>
                  <label className="text-sm">GSTIN<input className={inputClass} value={gst} onChange={(e) => setGst(e.target.value)} /></label>
                  <label className="text-sm">PAN<input className={inputClass} value={pan} onChange={(e) => setPan(e.target.value)} /></label>
                </>
              ) : null}
            </div>
          ) : null}
          {!customerExists && customerChecked ? (
            <p className="mt-2 text-sm text-amber-700">Customer must be created before moving to Watch details.</p>
          ) : null}
          <div className="mt-4 flex justify-end"><button type="button" onClick={() => void goNext()} className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white">Next</button></div>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card title="Step 2 — Watch">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">Brand<select className={inputClass} value={watchBrand} onChange={(e) => syncModelForBrand(e.target.value)}>{brandNames.map((b) => <option key={b}>{b}</option>)}</select></label>
            <WatchFamilyPicker
              watchBrand={watchBrand}
              apiMode={apiMode}
              family={watchFamily}
              onFamilyChange={setWatchFamily}
              inputClass={inputClass}
              idPrefix="srf"
            />
            <div className="md:col-span-2">
              <label htmlFor="srf-model" className="text-sm">
                Model
              </label>
              {catalogModels.length > 0 ? (
                <>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <select
                        id="srf-model"
                        className={inputClass.replace("mt-1 ", "")}
                        value={catalogModelKey === "__new__" ? "__new__" : catalogModelKey}
                        onChange={(e) => {
                          const v = e.target.value;
                          setWatchModelSaveMsg(null);
                          if (v === "__new__") {
                            setCatalogModelKey("__new__");
                            setCustomModelText("");
                            return;
                          }
                          setCatalogModelKey(v);
                          setCustomModelText("");
                          const m = catalogModels.find((x) => x.model === v);
                          if (m?.refHint) setSerial(m.refHint);
                        }}
                      >
                        {catalogModels.map((m) => (
                          <option key={m.id} value={m.model}>
                            {m.model}
                          </option>
                        ))}
                        <option value="__new__">+ Add new model…</option>
                      </select>
                    </div>
                    {catalogModelKey === "__new__" && apiMode ? (
                      <button
                        type="button"
                        disabled={!customModelText.trim() || savingWatchModel}
                        title="Save new model to database (uses serial field as ref. hint if filled)"
                        onClick={() => void saveNewWatchModelToCatalog()}
                        className="shrink-0 rounded-md border border-zimson-500 bg-zimson-600 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingWatchModel ? "…" : "Save"}
                      </button>
                    ) : null}
                  </div>
                  {catalogModelKey === "__new__" ? (
                    <input
                      className={`${inputClass} mt-2`}
                      placeholder="Type new model name"
                      value={customModelText}
                      onChange={(e) => {
                        setCustomModelText(e.target.value);
                        setWatchModelSaveMsg(null);
                      }}
                      aria-label="New model name"
                    />
                  ) : null}
                </>
              ) : (
                <div>
                  <p className="mb-1 text-xs text-amber-900">No saved models for this brand — enter the model name.</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <input
                      id="srf-model-custom"
                      className={`${inputClass.replace("mt-1 ", "")} min-w-0 flex-1 basis-[min(100%,14rem)]`}
                      placeholder="Model name"
                      value={customModelText}
                      onChange={(e) => {
                        setCustomModelText(e.target.value);
                        setCatalogModelKey("__new__");
                        setWatchModelSaveMsg(null);
                      }}
                    />
                    {apiMode ? (
                      <button
                        type="button"
                        disabled={!customModelText.trim() || savingWatchModel}
                        title="Save new model to database (uses serial field as ref. hint if filled)"
                        onClick={() => void saveNewWatchModelToCatalog()}
                        className="shrink-0 rounded-md border border-zimson-500 bg-zimson-600 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingWatchModel ? "…" : "Save"}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
              {watchModelSaveMsg ? <p className="mt-1 text-xs text-emerald-800">{watchModelSaveMsg}</p> : null}
            </div>
            <label className="text-sm">Serial<input className={inputClass} value={serial} onChange={(e) => setSerial(e.target.value)} /></label>
            <label className="text-sm sm:col-span-2">
              Repair routing
              <select
                className={inputClass}
                value={repairRoute}
                onChange={(e) => setRepairRoute(normalizeSrfRepairRoute(e.target.value))}
              >
                {SRF_REPAIR_ROUTE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-stone-600">
                {SRF_REPAIR_ROUTE_OPTIONS.find((o) => o.value === repairRoute)?.hint}
              </span>
            </label>
            <label className="text-sm">
              After-service handover store
              <select
                className={`${inputClass} disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-600`}
                value={handoverStoreId}
                onChange={(e) => setHandoverStoreId(e.target.value)}
                disabled={!ENABLE_SRF_HANDOVER_STORE_SELECT}
                title={
                  ENABLE_SRF_HANDOVER_STORE_SELECT
                    ? undefined
                    : "Locked to your login store for now. Set ENABLE_SRF_HANDOVER_STORE_SELECT to true in SrfBookingV2Page.tsx to allow changing this."
                }
              >
                {handoverStoreOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex justify-between">
            <button type="button" onClick={goBack} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900">Back</button>
            <button type="button" onClick={() => void goNext()} className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white">Generate QR</button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card title="Step 3 — Photos">
          <div className="grid gap-5 md:grid-cols-[220px,1fr]">
            <div className="rounded-xl border border-zimson-200 p-3 text-center">
              {captureUrl ? (
                <CustomerLinkQr url={captureUrl} size={260} mode="qr" caption="Scan QR to upload photos" className="mx-auto text-center" />
              ) : (
                <p className="text-sm">Generating QR...</p>
              )}
              <p className="mt-2 break-all text-xs text-stone-500">{captureUrl}</p>
            </div>
            <div className="space-y-3">
              <p className="text-sm">Scan QR and upload images from camera page. Link auto-disables after SRF finalize.</p>
              <p className="text-sm">Uploaded photos: <strong>{photoCount}</strong></p>
              {photoMsg ? <p className="rounded-xl bg-zimson-50 px-3 py-2 text-sm">{photoMsg}</p> : null}
              {photoPreview.length > 0 && !draft ? (
                <div className="rounded-xl border border-zimson-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Preview</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {photoPreview.map((p) => (
                      <SrfPhotoThumbTile
                        key={p.id}
                        photo={p}
                        imgClassName="h-28"
                        wrapperClassName="rounded-lg border border-zimson-200 p-1.5"
                        onPreview={openPhotoPreview}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void refreshPhotoStatus()} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900">Refresh status</button>
                <button type="button" onClick={() => void regenerateCaptureLink()} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900">Regenerate link</button>
                {captureUrl ? <a href={captureUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-zimson-700 px-4 py-2 text-sm font-semibold text-white">Open capture page</a> : null}
              </div>
              {draft ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-950">
                  <p className="font-semibold text-amber-950">Waiting on photos (draft / photo pending)</p>
                  {/* <p className="mt-1 text-xs text-amber-900">
                    Edit customer or watch details on file, or cancel this SRF if the booking should not continue.
                  </p> */}
                  {photoPreview.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-amber-200/90 bg-white/90 p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900">Uploaded image preview</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {photoPreview.map((p) => (
                          <SrfPhotoThumbTile
                            key={`amber-${p.id}`}
                            photo={p}
                            imgClassName="h-24"
                            wrapperClassName="rounded-md border border-amber-100 p-1"
                            onPreview={openPhotoPreview}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void saveDraftEditsAndGoWatchStep()}
                    className="mt-2 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100"
                  >
                    Edit customer &amp; watch
                  </button>
                  <label className="mt-3 block text-xs font-medium text-amber-950">Cancel reason</label>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-xs text-stone-900"
                    rows={2}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Reason for cancelling this SRF"
                  />
                  <button
                    type="button"
                    disabled={cancelBusy}
                    onClick={() => void handleCancelDraftSrf()}
                    className="mt-2 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
                  >
                    {cancelBusy ? "Cancelling…" : "Cancel SRF"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex justify-between">
            <button type="button" onClick={goBack} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900">Back</button>
            <button type="button" onClick={() => void goNext()} className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white">Next</button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card title="Step 4 — Estimate + OTP">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm md:col-span-2">Watch complaint<textarea className={inputClass} rows={3} value={complaint} onChange={(e) => setComplaint(e.target.value)} /></label>
            <label className="text-sm">
              Estimate amount (₹)
              <input className={inputClass} value={estimateAmount} onChange={(e) => setEstimateAmount(e.target.value)} />
            </label>
            <label className="text-sm">
              Advance amount (₹)
              <input className={inputClass} value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="0.00" />
            </label>
            <label className="text-sm">Estimated service finish date<input type="date" className={inputClass} value={estimatedFinishDate} onChange={(e) => setEstimatedFinishDate(e.target.value)} /></label>
            {advanceTotal > 0 ? (
              <MultiPaymentFields
                idPrefix="srf-advance"
                amountLabel="advance"
                targetInr={advanceTotal}
                form={advancePaymentForm}
                onChange={setAdvancePaymentForm}
              />
            ) : null}
            <label className="text-sm md:col-span-2">Remarks<input className={inputClass} value={estimateRemarks} onChange={(e) => setEstimateRemarks(e.target.value)} placeholder="Optional remarks" /></label>
            <div className="md:col-span-2 rounded-xl border border-zimson-200 bg-white p-3">
              <p className="text-sm font-semibold text-zimson-900">Watch condition / observation</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-stone-600">Case / Crystal<input className={inputClass} value={obsCaseCrystal} onChange={(e) => setObsCaseCrystal(e.target.value)} /></label>
                <label className="text-xs text-stone-600">Glass / Crystal<input className={inputClass} value={obsGlassCrystal} onChange={(e) => setObsGlassCrystal(e.target.value)} /></label>
                <label className="text-xs text-stone-600">Strap / Bracelet<input className={inputClass} value={obsStrapBracelet} onChange={(e) => setObsStrapBracelet(e.target.value)} /></label>
                <label className="text-xs text-stone-600">Hands<input className={inputClass} value={obsHands} onChange={(e) => setObsHands(e.target.value)} /></label>
                <label className="text-xs text-stone-600">Crown / Pushers<input className={inputClass} value={obsCrownPushers} onChange={(e) => setObsCrownPushers(e.target.value)} /></label>
                <label className="text-xs text-stone-600">Movement<input className={inputClass} value={obsMovement} onChange={(e) => setObsMovement(e.target.value)} /></label>
                <label className="text-xs text-stone-600">Water resistance<input className={inputClass} value={obsWaterResistance} onChange={(e) => setObsWaterResistance(e.target.value)} /></label>
                <label className="text-xs text-stone-600 sm:col-span-2">Additional notes<input className={inputClass} value={obsAdditionalNotes} onChange={(e) => setObsAdditionalNotes(e.target.value)} /></label>
              </div>
            </div>
            <div className="md:col-span-2 rounded-xl border border-zimson-200 bg-white p-3">
              <p className="text-sm font-semibold text-zimson-900">Suggested repairs</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-stone-600">Movement overhaul<input className={inputClass} value={repMovementOverhaul} onChange={(e) => setRepMovementOverhaul(e.target.value)} /></label>
                <label className="text-xs text-stone-600">Polishing (Case / Bracelet)<input className={inputClass} value={repPolishing} onChange={(e) => setRepPolishing(e.target.value)} /></label>
                <label className="text-xs text-stone-600">Replace water resistant kit<input className={inputClass} value={repWaterKit} onChange={(e) => setRepWaterKit(e.target.value)} /></label>
                <label className="text-xs text-stone-600">Replace bezel<input className={inputClass} value={repBezel} onChange={(e) => setRepBezel(e.target.value)} /></label>
                <label className="text-xs text-stone-600">Replace Crown / Stem<input className={inputClass} value={repCrownStem} onChange={(e) => setRepCrownStem(e.target.value)} /></label>
                <label className="text-xs text-stone-600">Replace Glass / Crystal<input className={inputClass} value={repGlassCrystal} onChange={(e) => setRepGlassCrystal(e.target.value)} /></label>
                <label className="text-xs text-stone-600">Replace Dial / Hands<input className={inputClass} value={repDialHands} onChange={(e) => setRepDialHands(e.target.value)} /></label>
              </div>
            </div>
            <div className="md:col-span-2 rounded-xl bg-zimson-50 px-3 py-2 text-sm">
              Estimate: <strong>{formatInr(estimateTotal)}</strong> · Advance: <strong>{formatInr(advanceTotal)}</strong>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={goBack} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900">Back</button>
            <button type="button" onClick={beginOtp} className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white">
              Send OTP
            </button>
          </div>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card title="Step 5 — Review and create">
          <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <tbody>
                {(loadedCustomerCode || loadedCustomerId) ? (
                  <tr className="border-b border-zimson-100">
                    <th className="w-56 bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Customer ID</th>
                    <td className="px-3 py-2 font-mono font-semibold text-zimson-900">{loadedCustomerCode ?? "—"}</td>
                  </tr>
                ) : null}
                <tr className="border-b border-zimson-100">
                  <th className="w-56 bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Customer</th>
                  <td className="px-3 py-2 text-stone-800">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span>
                        {customerName} · {phone}
                      </span>
                      {isFullyOtpVerified(phoneVerifiedAt, emailVerifiedAt) ? (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Verified
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Unverified
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-zimson-100">
                  <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700 align-top">Address</th>
                  <td className="px-3 py-2 text-stone-800 whitespace-pre-line">
                    {[
                      address.trim(),
                      [city, stateName, country].filter((x) => x.trim()).join(", "),
                      pincode.trim(),
                    ]
                      .filter(Boolean)
                      .join("\n") || "—"}
                  </td>
                </tr>
                <tr className="border-b border-zimson-100">
                  <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Watch</th>
                  <td className="px-3 py-2 text-stone-800">
                    {watchBrand}
                    {watchFamily.trim() ? ` · ${watchFamily.trim()}` : ""} {resolvedWatchModel.trim()} · {serial}
                  </td>
                </tr>
                <tr className="border-b border-zimson-100">
                  <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">After-service handover store</th>
                  <td className="px-3 py-2 text-stone-800">{handoverStoreOptions.find((s) => s.id === handoverStoreId)?.name ?? (handoverStoreId || "-")}</td>
                </tr>
                <tr className="border-b border-zimson-100">
                  <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Watch complaint</th>
                  <td className="px-3 py-2 text-stone-800">{complaint}</td>
                </tr>
                <tr className="border-b border-zimson-100">
                  <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Remarks</th>
                  <td className="px-3 py-2 text-stone-800">{estimateRemarks || "-"}</td>
                </tr>
                <tr className="border-b border-zimson-100">
                  <th className="bg-zimson-50/70 px-3 py-2 align-top font-semibold text-stone-700">Uploaded photos</th>
                  <td className="px-3 py-2 text-stone-800">
                    <p>{photoCount}</p>
                    {photoPreview.length > 0 ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {photoPreview.map((p) => (
                          <SrfPhotoThumbTile
                            key={p.id}
                            photo={p}
                            imgClassName="h-24"
                            wrapperClassName="rounded-lg border border-zimson-200 bg-white p-1.5"
                            onPreview={openPhotoPreview}
                          />
                        ))}
                      </div>
                    ) : null}
                  </td>
                </tr>
                <tr>
                  <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Estimated service finish date</th>
                  <td className="px-3 py-2 text-stone-800">{estimatedFinishDate || "-"}</td>
                </tr>
                <tr>
                  <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Estimate</th>
                  <td className="px-3 py-2 font-semibold text-zimson-900">{formatInr(estimateTotal)}</td>
                </tr>
                <tr>
                  <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Advance</th>
                  <td className="px-3 py-2 font-semibold text-zimson-900">{formatInr(advanceTotal)}</td>
                </tr>
                {advanceTotal > 0 ? (
                  <>
                    <tr>
                      <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Advance payment</th>
                      <td className="px-3 py-2 text-stone-800 whitespace-pre-line">{advancePaymentSummary}</td>
                    </tr>
                  </>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-3">
            <button type="button" onClick={goBack} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900">Back</button>
            <button type="button" onClick={() => void finalizeAndPrint()} className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white">Create SRF + print</button>
          </div>
        </Card>
      ) : null}
      </div>

      {photoLightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo preview: ${photoLightbox.label}`}
          onClick={() => setPhotoLightbox(null)}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-3xl flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-3 text-white">
              <p className="text-sm font-semibold capitalize">{photoLightbox.label}</p>
              <button
                type="button"
                onClick={() => setPhotoLightbox(null)}
                className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25"
              >
                Close
              </button>
            </div>
            <img
              src={photoLightbox.src}
              alt={photoLightbox.label}
              className="max-h-[calc(92vh-3rem)] w-full rounded-lg object-contain"
            />
          </div>
        </div>
      ) : null}

      {awaitingOtp ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <DemoOtpGate
              title="OTP verification"
              issuedCode={awaitingOtp}
              value={otpInput}
              onChange={setOtpInput}
              onVerify={verifyOtpAndProceed}
              onRegenerate={beginOtp}
            />
          </div>
        </div>
      ) : null}
      {alertModal}
    </div>
  );
}
