import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DemoOtpGate } from "../../components/service/DemoOtpGate";
import { useMessageAlert } from "../../hooks/useMessageAlert";
import { useOtpSentSuccess } from "../../hooks/useOtpSentSuccess";
import { formatOtpSentSubtitlePhoneEmail } from "../../lib/otpSentMessage";
import { WatchFamilyPicker } from "../../components/service/WatchFamilyPicker";
import { WatchModelPicker } from "../../components/service/WatchModelPicker";
import { CustomerLinkQr } from "../../components/service/CustomerLinkQr";
import { FormPageShell } from "../../components/layout/FormPageShell";
import { Card } from "../../components/ui/Card";
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
import { SrfBookingSuccessOverlay } from "../../components/service/SrfBookingSuccessOverlay";
import { SRF_MIN_WATCH_PHOTOS_REQUIRED, srfMinWatchPhotosFinalizeError } from "../../lib/srfPhotoSlots";
import { printEstimateDocument, printSrfDocument, srfPrintStoreFromSeed } from "../../lib/serviceDocuments";
import {
  isValidGstFormat,
  isValidPanFormat,
} from "../../data/serviceSeed";
import type { CustomerAddressBlock } from "../../types/customer";
import type { SrfJob } from "../../types/srfJob";
import {
  isFullyOtpVerified,
  UNVERIFIED_CUSTOMER_ALERT_MESSAGE,
} from "../../lib/customerVerification";
import {
  clearPendingRegisterPhone,
  isPhonePendingRegistration,
  setPendingRegisterPhone,
} from "../../lib/pendingRegisterPhone";
import {
  WatchServiceDetailFields,
  emptyWatchServiceDetailValues,
  watchServiceDetailsToApiPayload,
  type WatchServiceDetailValues,
} from "../../components/service/WatchServiceDetailFields";
import { B2bDetailsModal } from "../../components/service/B2bDetailsModal";
import { sanitizeDecimalInput } from "../../lib/inputSanitize";
import { formatInr } from "../../lib/formatInr";
import { natureOfRepairLabel } from "../../lib/natureOfRepair";
import {
  SRF_REPAIR_ROUTE_OPTIONS,
  normalizeSrfRepairRoute,
  type SrfRepairRoute,
} from "../../lib/srfRepairRoute";
import {
  hoNeedsOperatingStorePicker,
  isHoServiceOperator,
  pickDefaultStoreId,
  resolveOperatingRegionId,
  resolveOperatingStoreId,
  storesForRegion,
} from "../../lib/serviceOperatingContext";
import { inputClass } from "../../lib/uiForm";

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
    [billing.addressLine1, billing.addressLine2, billing.city, billing.district, billing.state, billing.countryId, billing.pincode].some(
      (x) => String(x ?? "").trim(),
    );
  if (hasStructured && billing) {
    const line = [billing.addressLine1 ?? billing.doorNo, billing.addressLine2 ?? billing.street, billing.district]
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

const readOnlyCustomerFieldClass = `${inputClass} cursor-not-allowed bg-stone-100 text-stone-800`;

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
  onRemove,
  removeBusy,
}: {
  photo: SrfPhotoThumb;
  imgClassName: string;
  wrapperClassName?: string;
  onPreview: (photo: SrfPhotoThumb) => void;
  onRemove?: (photo: SrfPhotoThumb) => void;
  removeBusy?: boolean;
}) {
  return (
    <div className={`relative ${wrapperClassName ?? ""}`}>
      {onRemove ? (
        <button
          type="button"
          title="Remove photo"
          disabled={removeBusy}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(photo);
          }}
          className="absolute right-1 top-1 z-10 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white shadow hover:bg-rose-700 disabled:opacity-50"
        >
          {removeBusy ? "…" : "×"}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onPreview(photo)}
        title="Click to preview"
        className="group w-full cursor-zoom-in text-left transition hover:border-rlx-gold hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-rlx-green"
      >
        <img
          src={`/${photo.filePath}`}
          alt={photo.photoKind ?? "watch photo"}
          className={`${imgClassName} w-full rounded object-cover`}
        />
        <p className="mt-1 text-[11px] capitalize text-stone-600 group-hover:text-rlx-green">{photo.photoKind ?? "other"}</p>
      </button>
    </div>
  );
}

export function SrfBookingV2Page() {
  const { user } = useAuth();
  const apiMode = useApiMode();
  const { regions } = useRegions();
  const { brands: catalogBrands } = useBrands();
  const { getById, customers } = useCustomers();
  const { showError: showOtpError, alertModal } = useMessageAlert();
  const { showOtpSent, otpSentModal } = useOtpSentSuccess();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { createDraftJob, refreshPhotoSession, finalizeJob, cancelDraftSrf, patchStoreDraftSrf, refreshJobs } = useSrfJobs();
  const brandNames = useMemo(() => catalogBrands.map((b) => b.name), [catalogBrands]);

  const [step, setStep] = useState(0);
  const [operatingRegionId, setOperatingRegionId] = useState("");
  const [operatingStoreId, setOperatingStoreId] = useState("");
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
  const [watchModel, setWatchModel] = useState("");
  const [serial, setSerial] = useState("");
  const [watchServiceDetails, setWatchServiceDetails] = useState<WatchServiceDetailValues>(
    emptyWatchServiceDetailValues,
  );
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
  const [finalizedSrfId, setFinalizedSrfId] = useState<string | null>(null);
  const [finalizedRepairRoute, setFinalizedRepairRoute] = useState<SrfRepairRoute>("send_to_ho");
  const [draft, setDraft] = useState<{ srfId: string; reference: string; token: string; captureUrl: string } | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [photoPreview, setPhotoPreview] = useState<SrfPhotoThumb[]>([]);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [photoLightbox, setPhotoLightbox] = useState<{ src: string; label: string } | null>(null);
  const [photoRemoveBusyId, setPhotoRemoveBusyId] = useState<string | null>(null);

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
  const [otpGateOpen, setOtpGateOpen] = useState(false);
  const [otpSessionId, setOtpSessionId] = useState<string | null>(null);
  const [issuedOtp, setIssuedOtp] = useState<string | null>(null);
  const [otpBusy, setOtpBusy] = useState(false);
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
  /** Existing customer row from API / local lookup — master fields stay read-only. */
  const customerLockedFromDb = Boolean(loadedCustomerId && customerChecked);

  const [b2bModalOpen, setB2bModalOpen] = useState(false);

  const trySetCustomerType = useCallback(
    (next: "B2B" | "B2C") => {
      if (next === "B2B" && customerLockedFromDb) {
        const missingAny = !company.trim() || !gst.trim() || !pan.trim();
        if (missingAny) {
          setB2bModalOpen(true);
          return;
        }
      }
      setCustomerType(next);
      setError(null);
    },
    [company, customerLockedFromDb, gst, pan],
  );
  const phoneLockedForNewRegistration =
    !customerLockedFromDb && isPhonePendingRegistration(phone);
  const [walkInPending, setWalkInPending] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const autoLookupTimerRef = useRef<number | null>(null);
  const lastAutoLookupPhoneRef = useRef("");
  const unverifiedAlertShownForRef = useRef<string | null>(null);

  const clearLoadedCustomer = useCallback(() => {
    setLoadedCustomerId(null);
    setLoadedCustomerCode(null);
    setCustomerChecked(false);
    setCustomerExists(false);
    setCustomerCheckMsg(null);
    setPhoneVerifiedAt(null);
    setEmailVerifiedAt(null);
    setWalkInPending(false);
    lastAutoLookupPhoneRef.current = "";
    unverifiedAlertShownForRef.current = null;
    clearPendingRegisterPhone();
  }, []);

  const effectiveOperatingRegionId = useMemo(
    () => resolveOperatingRegionId(user?.role, user?.regionId, operatingRegionId),
    [user?.role, user?.regionId, operatingRegionId],
  );
  const currentStoreId = useMemo(
    () => resolveOperatingStoreId(user?.role, user?.storeId, user?.storeIds, operatingStoreId),
    [user?.role, user?.storeId, user?.storeIds, operatingStoreId],
  );
  const currentRegionId = effectiveOperatingRegionId;
  const operatingStoreOptions = useMemo(
    () => storesForRegion(regions, effectiveOperatingRegionId),
    [regions, effectiveOperatingRegionId],
  );
  const showHoOperatingLocation = isHoServiceOperator(user?.role);
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
      const p = phoneRaw.trim();
      if (p) setPendingRegisterPhone(p);
      setCustomerName("");
      setEmail("");
      setAlternatePhone("");
      setAddress("");
      setCity("");
      setStateName("");
      setCountry("");
      setPincode("");
      setCompany("");
      setGst("");
      setPan("");
      customerNameForNavRef.current = "";
      const q = new URLSearchParams();
      if (p) q.set("phone", p);
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
    setWatchModel("");
    setSerial("");
  }, []);

  useEffect(() => {
    if (brandNames.length === 0) return;
    if (!watchBrand || !brandNames.includes(watchBrand)) {
      syncModelForBrand(brandNames[0]!);
    }
  }, [brandNames, watchBrand, syncModelForBrand]);

  useEffect(() => {
    if (!apiMode || user?.role !== "super_admin") return;
    if (regions.length > 0 && !operatingRegionId) setOperatingRegionId(regions[0]!.id);
  }, [apiMode, user?.role, regions, operatingRegionId]);

  useEffect(() => {
    if (!apiMode || !hoNeedsOperatingStorePicker(user?.role, user?.storeId, user?.storeIds)) return;
    if (!effectiveOperatingRegionId) return;
    const defaultId = pickDefaultStoreId(regions, effectiveOperatingRegionId, user?.storeId);
    if (defaultId && !operatingStoreId) setOperatingStoreId(defaultId);
  }, [
    apiMode,
    user?.role,
    user?.storeId,
    user?.storeIds,
    regions,
    effectiveOperatingRegionId,
    operatingStoreId,
  ]);

  useEffect(() => {
    if (!operatingStoreId || operatingStoreOptions.some((s) => s.id === operatingStoreId)) return;
    const defaultId = pickDefaultStoreId(regions, effectiveOperatingRegionId, null);
    if (defaultId) setOperatingStoreId(defaultId);
  }, [operatingStoreId, operatingStoreOptions, regions, effectiveOperatingRegionId]);

  useEffect(() => {
    if (!handoverStoreId && currentStoreId) setHandoverStoreId(currentStoreId);
  }, [handoverStoreId, currentStoreId]);

  useEffect(() => {
    if (!ENABLE_SRF_HANDOVER_STORE_SELECT && operatingStoreId) {
      setHandoverStoreId(operatingStoreId);
    }
  }, [operatingStoreId]);

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
    if (!watchBrand || !watchFamily.trim() || !watchModel.trim() || !serial.trim()) {
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
    if (advanceTotal > estimateTotal) {
      setError("Advance amount cannot be greater than the estimate amount.");
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
    const regionId = effectiveOperatingRegionId;
    const storeId = currentStoreId;
    const destinationStoreId = String(handoverStoreId || currentStoreId).trim();
    const customerNameValue = customerName.trim();
    const phoneValue = phone.trim();
    const watchBrandValue = watchBrand.trim();
    const watchFamilyValue = watchFamily.trim();
    const watchModelValue = watchModel.trim();
    const serialValue = serial.trim();
    if (!regionId || !storeId) {
      throw new Error(
        showHoOperatingLocation
          ? "Select operating region and store at the top of this page before continuing."
          : "Current login is not mapped to store/region. Please re-login and select the store.",
      );
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

  const canRemoveUploadedPhotos = Boolean(draft);

  async function removeUploadedPhoto(photo: SrfPhotoThumb) {
    if (!canRemoveUploadedPhotos) return;
    const label = photoKindLabel(photo.photoKind);
    if (!window.confirm(`Remove the ${label} photo? The customer can upload it again from the capture link.`)) {
      return;
    }
    setPhotoRemoveBusyId(photo.id);
    setPhotoMsg(null);
    try {
      const row = await ensureDraft();
      await apiJson<{ ok: boolean; photoCount: number }>(
        `/api/service/srf-jobs/${encodeURIComponent(row.srfId)}/photos/${encodeURIComponent(photo.id)}`,
        { method: "DELETE" },
      );
      await refreshPhotoStatus();
      setPhotoMsg(`${label} photo removed.`);
    } catch (e) {
      setPhotoMsg(e instanceof Error ? e.message : "Could not remove photo.");
    } finally {
      setPhotoRemoveBusyId(null);
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
      if (step === 2 && photoCount < SRF_MIN_WATCH_PHOTOS_REQUIRED) {
        setError(srfMinWatchPhotosFinalizeError(photoCount));
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
        watchModel: watchModel.trim(),
        serial,
        ...watchServiceDetailsToApiPayload(watchServiceDetails),
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
    clearPendingRegisterPhone();
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
    setPendingRegisterPhone(rp);
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
        setWatchModel(job.watchModel.trim());
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
        setStep(pc >= SRF_MIN_WATCH_PHOTOS_REQUIRED ? 3 : 2);
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
          setCustomerName("");
          setEmail("");
          setAlternatePhone("");
          setAddress("");
          setCity("");
          setStateName("");
          setCountry("");
          setPincode("");
          setCompany("");
          setGst("");
          setPan("");
          customerNameForNavRef.current = "";
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
    setCustomerName("");
    setEmail("");
    setAlternatePhone("");
    setAddress("");
    setCity("");
    setStateName("");
    setCountry("");
    setPincode("");
    setCompany("");
    setGst("");
    setPan("");
    customerNameForNavRef.current = "";
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

  async function beginOtp() {
    if (!validateEstimate()) return;
    setError(null);
    setOtpBusy(true);
    setOtpInput("");
    setOtpSessionId(null);
    setIssuedOtp(null);
    if (!apiMode) {
      const demo = String(Math.floor(100000 + Math.random() * 900000));
      setIssuedOtp(demo);
      setOtpGateOpen(true);
      showOtpSent(formatOtpSentSubtitlePhoneEmail(phone10(phone), undefined));
      setOtpBusy(false);
      return;
    }
    try {
      const out = await apiJson<{ sessionId: string; demoOtp?: string }>("/api/customers/handover-otp/start", {
        method: "POST",
        json: { channel: "mobile", phone: phone10(phone) },
      });
      setOtpSessionId(out.sessionId);
      setIssuedOtp(out.demoOtp ?? null);
      setOtpGateOpen(true);
      showOtpSent(formatOtpSentSubtitlePhoneEmail(phone10(phone), undefined));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send OTP.");
    } finally {
      setOtpBusy(false);
    }
  }

  async function verifyOtpAndProceed() {
    if (!otpGateOpen) return;
    const entered = otpInput.trim();
    if (entered.length !== 6) {
      showOtpError("Enter the 6-digit OTP to continue.", "OTP required");
      return;
    }
    setOtpBusy(true);
    try {
      if (apiMode && otpSessionId) {
        await apiJson<{ ok: boolean }>("/api/customers/handover-otp/confirm", {
          method: "POST",
          json: { sessionId: otpSessionId, otp: entered },
        });
      } else if (!issuedOtp || entered !== issuedOtp) {
        showOtpError("Incorrect OTP. Please check the code and try again.", "OTP verification failed");
        return;
      }
      setOtpGateOpen(false);
      setOtpSessionId(null);
      setIssuedOtp(null);
      setOtpInput("");
      setStep(4);
    } catch (e) {
      showOtpError(e instanceof ApiError ? e.message : "OTP verification failed.", "OTP verification failed");
    } finally {
      setOtpBusy(false);
    }
  }

  async function finalizeAndPrint() {
    setError(null);
    if (photoCount < SRF_MIN_WATCH_PHOTOS_REQUIRED) {
      setError(srfMinWatchPhotosFinalizeError(photoCount));
      return;
    }
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
        customerEmail: email.trim() || undefined,
        ...watchServiceDetailsToApiPayload(watchServiceDetails),
      });
      setSrfRef(row.reference);
      setFinalizedSrfId(row.srfId);
      setFinalizedRepairRoute(repairRoute);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create SRF.");
    }
  }

  function reprintSrfAndEstimate() {
    if (!srfRef) return;
    const advancePay = advanceTotal > 0 ? buildMultiPaymentPayload(advancePaymentForm, advanceTotal) : null;
    const resolvedAdvanceMode = advancePay && !("error" in advancePay) ? advancePay.paymentMode : null;
    const resolvedAdvanceDetails = advancePay && !("error" in advancePay) ? advancePay.paymentDetails : null;
    const printStore =
      handoverStoreOptions.find((s) => s.id === handoverStoreId) || currentUserStore;
    const srfComments = [
      estimateRemarks.trim(),
      repMovementOverhaul.trim() ? `Movement overhaul: ${repMovementOverhaul.trim()}` : "",
      repPolishing.trim() ? `Polishing: ${repPolishing.trim()}` : "",
      obsAdditionalNotes.trim(),
    ]
      .filter(Boolean)
      .join(" / ");
    const svcDetailPayload = watchServiceDetailsToApiPayload(watchServiceDetails);
    printSrfDocument({
      reference: srfRef,
      customerName,
      phone,
      company: customerType === "B2B" ? company.trim() : undefined,
      watchBrand,
      watchFamily: watchFamily.trim(),
      watchModel: watchModel.trim(),
      serial,
      complaint,
      estimateTotalInr: estimateTotal,
      estimatedFinishDate: estimatedFinishDate || null,
      advanceInr: advanceTotal,
      advancePaymentMode: resolvedAdvanceMode,
      advancePaymentDetails: resolvedAdvanceDetails,
      bookingDate: new Date(),
      repairRoute: finalizedRepairRoute,
      caseType: svcDetailPayload.caseType,
      strapChainType: svcDetailPayload.strapChainType,
      chainCount: svcDetailPayload.chainCount,
      customerRemarks: svcDetailPayload.customerRemarks,
      natureOfRepair:
        natureOfRepairLabel(watchServiceDetails.natureOfRepair) ||
        (finalizedRepairRoute === "store_self" ? "Store repair" : "HO Service"),
      receptionistRemarks: estimateRemarks.trim() || obsAdditionalNotes.trim(),
      comments: srfComments || complaint,
      modelNumber: serial.trim(),
      storeInfo: printStore ? srfPrintStoreFromSeed(printStore) : undefined,
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
    });
    printEstimateDocument(
      {
        id: finalizedSrfId ?? "",
        reference: srfRef,
        customerName,
        phone,
        watchBrand,
        watchModel: watchModel.trim(),
        serial,
        complaint,
        estimateTotalInr: estimateTotal,
        estimatedFinishDate: estimatedFinishDate || null,
        usedSpares: [],
      } as unknown as SrfJob,
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
  }

  const captureUrl = useMemo(() => {
    if (!draft) return "";
    return new URL(draft.captureUrl, window.location.origin).toString();
  }, [draft]);

  if (srfRef && finalizedSrfId) {
    return (
      <SrfBookingSuccessOverlay
        srfReference={srfRef}
        srfId={finalizedSrfId}
        customerEmail={email}
      />
    );
  }

  return (
    <FormPageShell breadcrumb="SRF booking" title="SRF booking">
      {apiMode && showHoOperatingLocation ? (
        <Card
          title="Operating location"
          subtitle="Intake store for this SRF. Required when your login is not tied to a single store."
          className="mb-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {user?.role === "super_admin" ? (
              <label className="text-sm">
                <span className="text-xs font-medium text-stone-600">Region *</span>
                <select
                  value={operatingRegionId}
                  onChange={(e) => {
                    setOperatingRegionId(e.target.value);
                    setOperatingStoreId("");
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
              <label className="text-sm">
                <span className="text-xs font-medium text-stone-600">Store *</span>
                <select
                  value={operatingStoreId}
                  onChange={(e) => setOperatingStoreId(e.target.value)}
                  className={inputClass}
                  disabled={!effectiveOperatingRegionId}
                >
                  <option value="">Select store</option>
                  {operatingStoreOptions.map((s) => (
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
      <div className="mb-6 rounded-2xl border border-rlx-rule/80 bg-white/90 p-4 shadow-sm">
        <Stepper steps={[...steps]} activeIndex={step} />
      </div>
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      <div key={step} className="animate-srf-step-enter">
      {step === 0 ? (
        <Card title="Step 1 — Customer">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-4">
              <label
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  checked={customerType === "B2C"}
                  onChange={() => trySetCustomerType("B2C")}
                />{" "}
                B2C
              </label>
              <label
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  checked={customerType === "B2B"}
                  onChange={() => trySetCustomerType("B2B")}
                />{" "}
                B2B
              </label>
            </div>
            {customerLockedFromDb ? (
              <button
                type="button"
                onClick={clearLoadedCustomer}
                className="rounded-lg border border-rlx-gold bg-white px-3 py-1.5 text-xs font-semibold text-rlx-green hover:bg-rlx-green-light"
              >
                Change customer
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm md:col-span-2">
              Customer ID
              <input
                readOnly
                className={`${inputClass} bg-rlx-green-light/80 font-mono`}
                value={loadedCustomerCode ?? ""}
                placeholder="—"
              />
            </label>
            <label className="text-sm md:col-span-2">
              Phone
              {phoneLockedForNewRegistration ? (
                <span className="mt-0.5 block text-xs font-normal text-stone-500">
                  Mobile for new customer registration (cannot be changed on this screen).
                </span>
              ) : null}
              <input
                className={
                  customerLockedFromDb || phoneLockedForNewRegistration
                    ? readOnlyCustomerFieldClass
                    : inputClass
                }
                value={phone}
                readOnly={customerLockedFromDb || phoneLockedForNewRegistration}
                onChange={
                  customerLockedFromDb || phoneLockedForNewRegistration
                    ? undefined
                    : (e) => setPhone(e.target.value)
                }
              />
            </label>
          </div>
          <div className="mt-3 text-xs text-stone-500">
            {checkingCustomer ? "Checking customer in DB…" : "Customer check runs automatically after you enter a mobile number."}
          </div>
          {customerCheckMsg ? (
            <p className="mt-3 rounded-xl bg-rlx-green-light px-3 py-2 text-sm text-stone-700">
              {customerCheckMsg}
              {customerLockedFromDb ? (
                <span className="mt-1 block text-xs text-stone-600">
                  Customer master data is read-only. Use Change customer to search another mobile.
                </span>
              ) : null}
            </p>
          ) : null}
          {phone10(phone).length === 10 && !checkingCustomer ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span>Customer name</span>
                  {customerExists && customerChecked ? (
                    isFullyOtpVerified(phoneVerifiedAt, emailVerifiedAt) ? (
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Verified
                      </span>
                    ) : (
                      <span className="rounded-full bg-rlx-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rlx-green-deep">
                        Unverified
                      </span>
                    )
                  ) : null}
                </span>
                <input
                  className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                  value={customerName}
                  readOnly={customerLockedFromDb}
                  onChange={customerLockedFromDb ? undefined : (e) => setCustomerName(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Email
                <input
                  className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                  type="email"
                  value={email}
                  readOnly={customerLockedFromDb}
                  onChange={customerLockedFromDb ? undefined : (e) => setEmail(e.target.value)}
                />
              </label>
              {customerExists && customerChecked && !isFullyOtpVerified(phoneVerifiedAt, emailVerifiedAt) ? (
                <div
                  className="md:col-span-2 rounded-xl border-2 border-rlx-gold bg-rlx-gold-light px-3 py-2 text-sm font-semibold text-rlx-green-deep"
                  role="alert"
                >
                  Alert: Customer not verified — complete mobile OTP before handover.
                </div>
              ) : null}
              {customerExists && customerChecked && !isFullyOtpVerified(phoneVerifiedAt, emailVerifiedAt) ? (
                <div className="md:col-span-2 flex flex-col gap-2 rounded-xl border border-rlx-gold/40 bg-rlx-green-light/90 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-rlx-green">
                    Complete mobile OTP on customer registration to mark this customer verified.
                  </p>
                  <button
                    type="button"
                    onClick={() => redirectToCustomerRegister(phone.trim())}
                    className="shrink-0 rounded-lg bg-rlx-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-rlx-green-deep"
                  >
                    Verify with OTP
                  </button>
                </div>
              ) : null}
              <label className="text-sm">
                Alternate mobile
                <input
                  className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                  value={alternatePhone}
                  readOnly={customerLockedFromDb}
                  onChange={customerLockedFromDb ? undefined : (e) => setAlternatePhone(e.target.value)}
                />
              </label>
              <label className="text-sm md:col-span-2">
                Street / building address
                <textarea
                  className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                  rows={2}
                  value={address}
                  readOnly={customerLockedFromDb}
                  onChange={customerLockedFromDb ? undefined : (e) => setAddress(e.target.value)}
                  placeholder="Door no., street, area"
                />
              </label>
              <label className="text-sm">
                City
                <input
                  className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                  value={city}
                  readOnly={customerLockedFromDb}
                  onChange={customerLockedFromDb ? undefined : (e) => setCity(e.target.value)}
                />
              </label>
              <label className="text-sm">
                State
                <input
                  className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                  value={stateName}
                  readOnly={customerLockedFromDb}
                  onChange={customerLockedFromDb ? undefined : (e) => setStateName(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Country
                <input
                  className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                  value={country}
                  readOnly={customerLockedFromDb}
                  onChange={customerLockedFromDb ? undefined : (e) => setCountry(e.target.value)}
                  placeholder="e.g. India"
                />
              </label>
              <label className="text-sm">
                PIN code
                <input
                  className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                  value={pincode}
                  readOnly={customerLockedFromDb}
                  onChange={customerLockedFromDb ? undefined : (e) => setPincode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="6-digit PIN"
                />
              </label>
              {customerType === "B2B" ? (
                <>
                  <label className="text-sm">
                    Company
                    <input
                      className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                      value={company}
                      readOnly={customerLockedFromDb}
                      onChange={customerLockedFromDb ? undefined : (e) => setCompany(e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    GSTIN
                    <input
                      className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                      value={gst}
                      readOnly={customerLockedFromDb}
                      onChange={customerLockedFromDb ? undefined : (e) => setGst(e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    PAN
                    <input
                      className={customerLockedFromDb ? readOnlyCustomerFieldClass : inputClass}
                      value={pan}
                      readOnly={customerLockedFromDb}
                      onChange={customerLockedFromDb ? undefined : (e) => setPan(e.target.value)}
                    />
                  </label>
                </>
              ) : null}
            </div>
          ) : null}
          {!customerExists && customerChecked ? (
            <p className="mt-2 text-sm text-rlx-gold-dark">Customer must be created before moving to Watch details.</p>
          ) : null}
          <div className="mt-4 flex justify-end"><button type="button" onClick={() => void goNext()} className="rounded-xl bg-rlx-green px-4 py-2 text-sm font-semibold text-white hover:bg-rlx-green-deep">Next</button></div>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card title="Step 2 — Watch">
          <div className="flex flex-col gap-4">
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
              <label className="min-w-0 text-sm">
                Brand
                <select className={inputClass} value={watchBrand} onChange={(e) => syncModelForBrand(e.target.value)}>
                  {brandNames.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
              <div className="min-w-0">
                <WatchFamilyPicker
                  watchBrand={watchBrand}
                  apiMode={apiMode}
                  family={watchFamily}
                  onFamilyChange={setWatchFamily}
                  disableAutoSelect
                  inputClass={inputClass}
                  idPrefix="srf"
                />
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
            <div className="min-w-0">
              <WatchModelPicker
                watchBrand={watchBrand}
                apiMode={apiMode}
                model={watchModel}
                onModelChange={setWatchModel}
                disableAutoSelect
                inputClass={inputClass}
                idPrefix="srf"
                serialHint={serial}
              />
            </div>
            <label className="text-sm">
              Serial
              <input className={inputClass} value={serial} onChange={(e) => setSerial(e.target.value)} />
            </label>
            </div>
            <WatchServiceDetailFields
              idPrefix="srf"
              inputClass={inputClass}
              values={watchServiceDetails}
              onChange={(patch) => setWatchServiceDetails((prev) => ({ ...prev, ...patch }))}
            />
            <label className="text-sm">
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
            <button type="button" onClick={goBack} className="rounded-xl border border-rlx-gold px-4 py-2 text-sm font-semibold text-rlx-green hover:bg-rlx-green-light">Back</button>
            <button type="button" onClick={() => void goNext()} className="rounded-xl bg-rlx-green px-4 py-2 text-sm font-semibold text-white hover:bg-rlx-green-deep">Generate QR</button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card title="Step 3 — Photos">
          <div className="grid gap-5 md:grid-cols-[220px,1fr]">
            <div className="rounded-xl border border-rlx-rule p-3 text-center">
              {captureUrl ? (
                <CustomerLinkQr url={captureUrl} size={260} mode="qr" caption="Scan QR to upload photos" className="mx-auto text-center" />
              ) : (
                <p className="text-sm">Generating QR...</p>
              )}
              <p className="mt-2 break-all text-xs text-stone-500">{captureUrl}</p>
            </div>
            <div className="space-y-3">
              <p className="text-sm">Scan QR and upload images from the customer capture page. Link auto-disables after SRF finalize.</p>
              <p className="text-sm">
                Uploaded photos: <strong>{photoCount}</strong> (minimum{" "}
                <strong>{SRF_MIN_WATCH_PHOTOS_REQUIRED}</strong> required — any categories, not all six)
              </p>
              {photoMsg ? <p className="rounded-xl bg-rlx-green-light px-3 py-2 text-sm">{photoMsg}</p> : null}
              {photoPreview.length > 0 && !draft ? (
                <div className="rounded-xl border border-rlx-rule bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Preview</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {photoPreview.map((p) => (
                      <SrfPhotoThumbTile
                        key={p.id}
                        photo={p}
                        imgClassName="h-28"
                        wrapperClassName="rounded-lg border border-rlx-rule p-1.5"
                        onPreview={openPhotoPreview}
                        onRemove={canRemoveUploadedPhotos ? removeUploadedPhoto : undefined}
                        removeBusy={photoRemoveBusyId === p.id}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void refreshPhotoStatus()} className="rounded-xl border border-rlx-gold px-4 py-2 text-sm font-semibold text-rlx-green hover:bg-rlx-green-light">Refresh status</button>
                <button type="button" onClick={() => void regenerateCaptureLink()} className="rounded-xl border border-rlx-gold px-4 py-2 text-sm font-semibold text-rlx-green hover:bg-rlx-green-light">Regenerate link</button>
                {captureUrl ? <a href={captureUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-rlx-green px-4 py-2 text-sm font-semibold text-white hover:bg-rlx-green-deep">Open capture page</a> : null}
              </div>
              {draft ? (
                <div className="mt-4 rounded-xl border border-rlx-gold/40 bg-gradient-to-br from-rlx-green-light/90 to-rlx-gold-light/40 p-3 text-sm text-rlx-green">
                  <p className="font-semibold text-rlx-green-deep">Waiting on photos (draft / photo pending)</p>
                  {/* <p className="mt-1 text-xs text-amber-900">
                    Edit customer or watch details on file, or cancel this SRF if the booking should not continue.
                  </p> */}
                  {photoPreview.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-rlx-rule bg-white/90 p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-rlx-green">Uploaded image preview</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {photoPreview.map((p) => (
                          <SrfPhotoThumbTile
                            key={`amber-${p.id}`}
                            photo={p}
                            imgClassName="h-24"
                            wrapperClassName="rounded-md border border-rlx-rule p-1"
                            onPreview={openPhotoPreview}
                            onRemove={canRemoveUploadedPhotos ? removeUploadedPhoto : undefined}
                            removeBusy={photoRemoveBusyId === p.id}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void saveDraftEditsAndGoWatchStep()}
                    className="mt-2 rounded-lg border border-rlx-gold bg-white px-3 py-1.5 text-xs font-semibold text-rlx-green hover:bg-rlx-green-light"
                  >
                    Edit customer &amp; watch
                  </button>
                  <label className="mt-3 block text-xs font-medium text-rlx-green">Cancel reason</label>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-rlx-rule bg-white px-2 py-1.5 text-xs text-rlx-ink focus:border-rlx-green focus:outline-none focus:ring-1 focus:ring-rlx-green/30"
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
            <button type="button" onClick={goBack} className="rounded-xl border border-rlx-gold px-4 py-2 text-sm font-semibold text-rlx-green hover:bg-rlx-green-light">Back</button>
            <button type="button" onClick={() => void goNext()} className="rounded-xl bg-rlx-green px-4 py-2 text-sm font-semibold text-white hover:bg-rlx-green-deep">Next</button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card title="Step 4 — Estimate + OTP">
          <div className="grid gap-4 md:grid-cols-2 md:items-start">
            <label className="block min-w-0 text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-stone-700">Watch complaint</span>
              <textarea
                className={inputClass}
                rows={3}
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
              />
            </label>
            <label className="block min-w-0 text-sm">
              <span className="mb-1 block font-medium text-stone-700">Estimate amount (₹)</span>
              <input
                className={inputClass}
                value={estimateAmount}
                onChange={(e) => {
                  setError(null);
                  setEstimateAmount(sanitizeDecimalInput(e.target.value));
                }}
              />
            </label>
            <label className="block min-w-0 text-sm">
              <span className="mb-1 block font-medium text-stone-700">Advance amount (₹)</span>
              <input
                className={inputClass}
                value={advanceAmount}
                onChange={(e) => {
                  setError(null);
                  const raw = sanitizeDecimalInput(e.target.value);
                  const adv = Number.parseFloat(raw) || 0;
                  if (estimateTotal > 0 && adv > estimateTotal) {
                    setAdvanceAmount(String(estimateTotal));
                    setError("Advance cannot exceed estimate amount.");
                    return;
                  }
                  setAdvanceAmount(raw);
                }}
                placeholder="0.00"
                max={estimateTotal > 0 ? estimateTotal : undefined}
              />
              {estimateTotal > 0 ? (
                <p className="mt-1 text-[11px] text-stone-500">Maximum advance: {formatInr(estimateTotal)}</p>
              ) : null}
            </label>
            <label className="block min-w-0 text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-stone-700">Estimated service finish date</span>
              <input
                type="date"
                className={`${inputClass} max-w-xs`}
                value={estimatedFinishDate}
                onChange={(e) => setEstimatedFinishDate(e.target.value)}
              />
            </label>
            {advanceTotal > 0 ? (
              <div className="min-w-0 md:col-span-2">
                <MultiPaymentFields
                  idPrefix="srf-advance"
                  amountLabel="advance"
                  targetInr={advanceTotal}
                  form={advancePaymentForm}
                  onChange={setAdvancePaymentForm}
                />
              </div>
            ) : null}
            <label className="block min-w-0 text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-stone-700">Remarks</span>
              <input
                className={inputClass}
                value={estimateRemarks}
                onChange={(e) => setEstimateRemarks(e.target.value)}
                placeholder="Optional remarks"
              />
            </label>
            <div className="md:col-span-2 rounded-xl border border-rlx-rule bg-white p-3">
              <p className="text-sm font-semibold text-rlx-green">Watch condition / observation</p>
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
            <div className="md:col-span-2 rounded-xl border border-rlx-rule bg-white p-3">
              <p className="text-sm font-semibold text-rlx-green">Suggested repairs</p>
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
            <div className="md:col-span-2 rounded-xl bg-rlx-green-light px-3 py-2 text-sm">
              Estimate: <strong>{formatInr(estimateTotal)}</strong> · Advance: <strong>{formatInr(advanceTotal)}</strong>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={goBack} className="rounded-xl border border-rlx-gold px-4 py-2 text-sm font-semibold text-rlx-green hover:bg-rlx-green-light">Back</button>
            <button type="button" onClick={() => void beginOtp()} className="rounded-xl bg-rlx-green px-4 py-2 text-sm font-semibold text-white hover:bg-rlx-green-deep">
              Send OTP
            </button>
          </div>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card title="Step 5 — Review and create">
          <div className="overflow-x-auto rounded-xl border border-rlx-rule/80">
            <table className="min-w-full text-left text-sm">
              <tbody>
                {(loadedCustomerCode || loadedCustomerId) ? (
                  <tr className="border-b border-rlx-rule">
                    <th className="w-56 bg-rlx-green-light/70 px-3 py-2 font-semibold text-stone-700">Customer ID</th>
                    <td className="px-3 py-2 font-mono font-semibold text-rlx-green">{loadedCustomerCode ?? "—"}</td>
                  </tr>
                ) : null}
                <tr className="border-b border-rlx-rule">
                  <th className="w-56 bg-rlx-green-light/70 px-3 py-2 font-semibold text-stone-700">Customer</th>
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
                        <span className="rounded-full bg-rlx-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rlx-green-deep">
                          Unverified
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-rlx-rule">
                  <th className="bg-rlx-green-light/70 px-3 py-2 font-semibold text-stone-700 align-top">Address</th>
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
                <tr className="border-b border-rlx-rule">
                  <th className="bg-rlx-green-light/70 px-3 py-2 font-semibold text-stone-700">Watch</th>
                  <td className="px-3 py-2 text-stone-800">
                    {watchBrand}
                    {watchFamily.trim() ? ` · ${watchFamily.trim()}` : ""} {watchModel.trim()} · {serial}
                  </td>
                </tr>
                <tr className="border-b border-rlx-rule">
                  <th className="bg-rlx-green-light/70 px-3 py-2 font-semibold text-stone-700">After-service handover store</th>
                  <td className="px-3 py-2 text-stone-800">{handoverStoreOptions.find((s) => s.id === handoverStoreId)?.name ?? (handoverStoreId || "-")}</td>
                </tr>
                <tr className="border-b border-rlx-rule">
                  <th className="bg-rlx-green-light/70 px-3 py-2 font-semibold text-stone-700">Watch complaint</th>
                  <td className="px-3 py-2 text-stone-800">{complaint}</td>
                </tr>
                <tr className="border-b border-rlx-rule">
                  <th className="bg-rlx-green-light/70 px-3 py-2 font-semibold text-stone-700">Remarks</th>
                  <td className="px-3 py-2 text-stone-800">{estimateRemarks || "-"}</td>
                </tr>
                <tr className="border-b border-rlx-rule">
                  <th className="bg-rlx-green-light/70 px-3 py-2 align-top font-semibold text-stone-700">Uploaded photos</th>
                  <td className="px-3 py-2 text-stone-800">
                    <p>{photoCount}</p>
                    {photoPreview.length > 0 ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {photoPreview.map((p) => (
                          <SrfPhotoThumbTile
                            key={p.id}
                            photo={p}
                            imgClassName="h-24"
                            wrapperClassName="rounded-lg border border-rlx-rule bg-white p-1.5"
                            onPreview={openPhotoPreview}
                            onRemove={canRemoveUploadedPhotos ? removeUploadedPhoto : undefined}
                            removeBusy={photoRemoveBusyId === p.id}
                          />
                        ))}
                      </div>
                    ) : null}
                  </td>
                </tr>
                <tr>
                  <th className="bg-rlx-green-light/70 px-3 py-2 font-semibold text-stone-700">Estimated service finish date</th>
                  <td className="px-3 py-2 text-stone-800">{estimatedFinishDate || "-"}</td>
                </tr>
                <tr>
                  <th className="bg-rlx-green-light/70 px-3 py-2 font-semibold text-stone-700">Estimate</th>
                  <td className="px-3 py-2 font-semibold text-rlx-green">{formatInr(estimateTotal)}</td>
                </tr>
                <tr>
                  <th className="bg-rlx-green-light/70 px-3 py-2 font-semibold text-stone-700">Advance</th>
                  <td className="px-3 py-2 font-semibold text-rlx-green">{formatInr(advanceTotal)}</td>
                </tr>
                {advanceTotal > 0 ? (
                  <>
                    <tr>
                      <th className="bg-rlx-green-light/70 px-3 py-2 font-semibold text-stone-700">Advance payment</th>
                      <td className="px-3 py-2 text-stone-800 whitespace-pre-line">{advancePaymentSummary}</td>
                    </tr>
                  </>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-3">
            <button type="button" onClick={goBack} className="rounded-xl border border-rlx-gold px-4 py-2 text-sm font-semibold text-rlx-green hover:bg-rlx-green-light">Back</button>
            <button type="button" onClick={() => void finalizeAndPrint()} className="rounded-xl bg-rlx-green px-4 py-2 text-sm font-semibold text-white hover:bg-rlx-green-deep">Create SRF</button>
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

      {otpGateOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <DemoOtpGate
              title="OTP verification"
              issuedCode={issuedOtp ?? undefined}
              value={otpInput}
              onChange={setOtpInput}
              onVerify={() => void verifyOtpAndProceed()}
              onRegenerate={() => void beginOtp()}
              verifyBusy={otpBusy}
            />
          </div>
        </div>
      ) : null}
      {alertModal}
      {otpSentModal}

      {b2bModalOpen && loadedCustomerId ? (
        <B2bDetailsModal
          customerId={loadedCustomerId}
          customerName={customerName}
          phone={phone}
          email={email}
          initialCompany={company}
          initialGst={gst}
          initialPan={pan}
          onSaved={(savedCompany, savedGst, savedPan, extras) => {
            setCompany(savedCompany);
            setGst(savedGst);
            setPan(savedPan);
            if (extras?.address?.trim()) setAddress(extras.address.trim());
            if (extras?.city?.trim()) setCity(extras.city.trim());
            setB2bModalOpen(false);
            setCustomerType("B2B");
            setError(null);
          }}
          onCancel={() => setB2bModalOpen(false)}
        />
      ) : null}
    </FormPageShell>
  );
}
