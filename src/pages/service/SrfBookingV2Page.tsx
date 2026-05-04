import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DemoOtpGate } from "../../components/service/DemoOtpGate";
import { CustomerLinkQr } from "../../components/service/CustomerLinkQr";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { Stepper } from "../../components/ui/Stepper";
import { useAuth } from "../../context/AuthContext";
import { useBrands } from "../../context/BrandsContext";
import { useCustomers } from "../../context/CustomersContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson } from "../../lib/api";
import { printSrfDocument } from "../../lib/serviceDocuments";
import {
  generateDemoOtp,
  isValidGstFormat,
  isValidPanFormat,
  watchModelsForBrand,
} from "../../data/serviceSeed";

const steps = ["Customer", "Watch", "Photos", "Estimate + OTP", "Review"] as const;
const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

export function SrfBookingV2Page() {
  const { user } = useAuth();
  const { brands: catalogBrands } = useBrands();
  const { registerCustomer } = useCustomers();
  const { createDraftJob, refreshPhotoSession, finalizeJob, cancelDraftSrf, patchStoreDraftSrf } = useSrfJobs();
  const brandNames = useMemo(() => catalogBrands.map((b) => b.name), [catalogBrands]);

  const [step, setStep] = useState(0);
  const [customerType, setCustomerType] = useState<"B2C" | "B2B">("B2C");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [company, setCompany] = useState("");
  const [gst, setGst] = useState("");
  const [pan, setPan] = useState("");
  const [watchBrand, setWatchBrand] = useState("");
  const [watchModel, setWatchModel] = useState("");
  const [serial, setSerial] = useState("");
  const [complaint, setComplaint] = useState("");
  const [estimateAmount, setEstimateAmount] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [estimateRemarks, setEstimateRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [srfRef, setSrfRef] = useState<string | null>(null);
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ srfId: string; reference: string; token: string; captureUrl: string } | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [photoPreview, setPhotoPreview] = useState<Array<{ id: string; photoKind?: string; filePath: string }>>([]);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [awaitingOtp, setAwaitingOtp] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [customerChecked, setCustomerChecked] = useState(false);
  const [customerExists, setCustomerExists] = useState(false);
  const [customerCheckMsg, setCustomerCheckMsg] = useState<string | null>(null);
  const [checkingCustomer, setCheckingCustomer] = useState(false);
  const [showCreateCustomerPopup, setShowCreateCustomerPopup] = useState(false);
  const [newCustomerOtpIssued, setNewCustomerOtpIssued] = useState<string | null>(null);
  const [newCustomerOtpInput, setNewCustomerOtpInput] = useState("");
  const [newCustomerOtpError, setNewCustomerOtpError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const autoLookupTimerRef = useRef<number | null>(null);
  const lastAutoLookupPhoneRef = useRef("");

  const models = watchModelsForBrand(watchBrand);
  const estimateTotal = Number.parseFloat(estimateAmount) || 0;
  const advanceTotal = Number.parseFloat(advanceAmount) || 0;

  const syncModelForBrand = useCallback((nextBrand: string) => {
    setWatchBrand(nextBrand);
    const ms = watchModelsForBrand(nextBrand);
    setWatchModel(ms[0]?.model ?? "");
    setSerial(ms[0]?.refHint ?? "");
  }, []);

  useEffect(() => {
    if (brandNames.length === 0) return;
    if (!watchBrand || !brandNames.includes(watchBrand)) {
      syncModelForBrand(brandNames[0]!);
    }
  }, [brandNames, watchBrand, syncModelForBrand]);

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
    if (!customerChecked) {
      setError("Please check customer mobile against DB first.");
      return false;
    }
    return true;
  }
  function validateWatch() {
    if (!watchBrand || !watchModel || !serial.trim()) {
      setError("Watch brand, model, and serial are required.");
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
    return true;
  }

  async function ensureDraft() {
    if (draft) return draft;
    const regionId = String(user?.regionId ?? "").trim();
    const fallbackStoreId = Array.isArray(user?.storeIds) && user.storeIds.length > 0 ? user.storeIds[0] : "";
    const storeId = String(user?.storeId ?? fallbackStoreId ?? "").trim();
    const customerNameValue = customerName.trim();
    const phoneValue = phone.trim();
    const watchBrandValue = watchBrand.trim();
    const watchModelValue = watchModel.trim();
    const serialValue = serial.trim();
    if (!regionId || !storeId) {
      throw new Error("Current login is not mapped to store/region. Please re-login and select the store.");
    }
    if (
      !customerNameValue ||
      !phoneValue ||
      !watchBrandValue ||
      !watchModelValue ||
      !serialValue
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
      watchModel: watchModelValue,
      serial: serialValue,
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

  async function goNext() {
    setError(null);
    try {
      if (step === 0 && !validateCustomer()) return;
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
      await patchStoreDraftSrf(draft.srfId, { customerName, phone, watchBrand, watchModel, serial });
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save edits.");
    }
  }

  function phone10(v: string): string {
    const digits = v.replace(/\D/g, "");
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  async function checkCustomerInDb() {
    setError(null);
    setCustomerCheckMsg(null);
    if (!phone.trim()) {
      setCustomerChecked(false);
      setCustomerExists(false);
      setShowCreateCustomerPopup(false);
      setCustomerCheckMsg(null);
      return;
    }
    const p10 = phone10(phone.trim());
    if (p10.length !== 10) {
      setCustomerChecked(false);
      setCustomerExists(false);
      setShowCreateCustomerPopup(false);
      setCustomerCheckMsg("Enter full 10-digit mobile number.");
      return;
    }
    setCheckingCustomer(true);
    try {
      const data = await apiJson<{
        customer: {
          id: string;
          displayName: string;
          phone: string;
          alternatePhone?: string;
          email: string;
          address?: string;
          city?: string;
          customerKind: "B2C" | "B2B";
          company?: string;
          gst?: string;
          pan?: string;
        } | null;
      }>(`/api/customers?phone=${encodeURIComponent(phone.trim())}`);
      if (data.customer) {
        setCustomerExists(true);
        setCustomerChecked(true);
        setCustomerType(data.customer.customerKind);
        setCustomerName(data.customer.displayName || customerName);
        setPhone(data.customer.phone || phone);
        setAlternatePhone(data.customer.alternatePhone ?? "");
        setEmail(data.customer.email ?? "");
        setAddress(data.customer.address ?? "");
        setCity(data.customer.city ?? "");
        setCompany(data.customer.company ?? "");
        setGst(data.customer.gst ?? "");
        setPan(data.customer.pan ?? "");
        setCustomerCheckMsg("Existing customer found and loaded from DB.");
        setShowCreateCustomerPopup(false);
      } else {
        setCustomerExists(false);
        setCustomerChecked(false);
        setCustomerCheckMsg("New customer number. Please complete customer creation.");
        setShowCreateCustomerPopup(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check customer.");
    } finally {
      setCheckingCustomer(false);
    }
  }

  async function createCustomerNow() {
    setError(null);
    if (!customerName.trim() || !phone.trim()) {
      setError("Name and phone are required.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Valid email is required.");
      return;
    }
    if (!address.trim() || !city.trim()) {
      setError("Address and city are required.");
      return;
    }
    if (customerType === "B2B") {
      if (!company.trim() || !isValidGstFormat(gst) || !isValidPanFormat(pan)) {
        setError("For B2B, company + valid GSTIN + valid PAN are required.");
        return;
      }
    }
    try {
      await registerCustomer({
        displayName: customerName,
        phone,
        alternatePhone,
        email,
        address,
        city,
        customerKind: customerType,
        company: customerType === "B2B" ? company : undefined,
        gst: customerType === "B2B" ? gst : undefined,
        pan: customerType === "B2B" ? pan : undefined,
      });
      setCustomerChecked(true);
      setCustomerExists(true);
      setShowCreateCustomerPopup(false);
      setCustomerCheckMsg("Customer created and linked.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create customer.");
    }
  }

  function beginNewCustomerOtp() {
    setError(null);
    if (!customerName.trim() || !phone.trim()) {
      setError("Name and phone are required.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Valid email is required.");
      return;
    }
    if (!address.trim() || !city.trim()) {
      setError("Address and city are required.");
      return;
    }
    if (customerType === "B2B") {
      if (!company.trim() || !isValidGstFormat(gst) || !isValidPanFormat(pan)) {
        setError("For B2B, company + valid GSTIN + valid PAN are required.");
        return;
      }
    }
    setNewCustomerOtpIssued(generateDemoOtp());
    setNewCustomerOtpInput("");
    setNewCustomerOtpError(null);
  }

  async function verifyNewCustomerOtpAndCreate() {
    if (!newCustomerOtpIssued) return;
    if (newCustomerOtpInput.trim() !== newCustomerOtpIssued) {
      setNewCustomerOtpError("Incorrect OTP.");
      return;
    }
    setNewCustomerOtpError(null);
    await createCustomerNow();
    setNewCustomerOtpIssued(null);
    setNewCustomerOtpInput("");
  }

  useEffect(() => {
    if (step !== 0) return;
    const normalized = phone10(phone);
    if (normalized === lastAutoLookupPhoneRef.current) return;
    setCustomerChecked(false);
    setCustomerExists(false);
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
    setOtpError(null);
  }

  function verifyOtpAndProceed() {
    if (!awaitingOtp) return;
    if (otpInput.trim() !== awaitingOtp) {
      setOtpError("Incorrect OTP.");
      return;
    }
    setAwaitingOtp(null);
    setOtpInput("");
    setStep(4);
  }

  async function finalizeAndPrint() {
    try {
      const row = await ensureDraft();
      const out = await finalizeJob(row.srfId, {
        complaint,
        estimateTotalInr: estimateTotal,
        advanceInr: advanceTotal,
        selectedPartIds: [],
      });
      printSrfDocument({
        reference: row.reference,
        customerName,
        phone,
        watchBrand,
        watchModel,
        serial,
        complaint,
        estimateTotalInr: estimateTotal,
        photos: photoPreview,
      });
      setSrfRef(row.reference);
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
        <Card title="Service request booked" subtitle="SRF created and printed">
          <p className="text-sm text-stone-700">
            SRF reference <span className="font-mono font-bold text-zimson-900">{srfRef}</span>
          </p>
          <p className="mt-2 text-sm text-stone-600">
            Status is now <strong>At store</strong>. Use store dispatch to create internal transfer at end of day.
          </p>
          <div className="mt-4 flex gap-3">
            <Link to="/service/srf" className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white">
              Book another SRF
            </Link>
            <Link to="/service/store-dispatch" className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900">
              Go to dispatch
            </Link>
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
      <PageHeader title="SRF booking" description="Customer -> Watch -> Photo QR upload -> Estimate OTP -> Review" />
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
            <label className="text-sm md:col-span-2">Phone<input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          </div>
          <div className="mt-3 text-xs text-stone-500">{checkingCustomer ? "Checking customer in DB..." : "Customer check is automatic after entering mobile number."}</div>
          {customerCheckMsg ? (
            <p className="mt-3 rounded-xl bg-zimson-50 px-3 py-2 text-sm text-stone-700">{customerCheckMsg}</p>
          ) : null}
          {phone10(phone).length === 10 && !checkingCustomer ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-sm">Customer name<input className={inputClass} value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></label>
              <label className="text-sm">Email<input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="text-sm">Alternate mobile<input className={inputClass} value={alternatePhone} onChange={(e) => setAlternatePhone(e.target.value)} /></label>
              <label className="text-sm">Address<input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} /></label>
              <label className="text-sm">City<input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} /></label>
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
            <label className="text-sm">Model<select className={inputClass} value={watchModel} onChange={(e) => setWatchModel(e.target.value)}>{models.map((m) => <option key={m.model}>{m.model}</option>)}</select></label>
            <label className="text-sm">Serial<input className={inputClass} value={serial} onChange={(e) => setSerial(e.target.value)} /></label>
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
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void refreshPhotoStatus()} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900">Refresh status</button>
                <button type="button" onClick={() => void regenerateCaptureLink()} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900">Regenerate link</button>
                {captureUrl ? <a href={captureUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-zimson-700 px-4 py-2 text-sm font-semibold text-white">Open capture page</a> : null}
              </div>
              {draft ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-950">
                  <p className="font-semibold text-amber-950">Waiting on photos (draft / photo pending)</p>
                  <p className="mt-1 text-xs text-amber-900">
                    Edit customer or watch details on file, or cancel this SRF if the booking should not continue.
                  </p>
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
            <label className="text-sm">Estimate amount (INR)<input className={inputClass} value={estimateAmount} onChange={(e) => setEstimateAmount(e.target.value)} /></label>
            <label className="text-sm">Advance amount (INR)<input className={inputClass} value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="0.00" /></label>
            <label className="text-sm md:col-span-2">Remarks<input className={inputClass} value={estimateRemarks} onChange={(e) => setEstimateRemarks(e.target.value)} placeholder="Optional remarks" /></label>
            <div className="md:col-span-2 rounded-xl bg-zimson-50 px-3 py-2 text-sm">
              Estimate: <strong>INR {estimateTotal.toFixed(2)}</strong> · Advance: <strong>INR {advanceTotal.toFixed(2)}</strong>
            </div>
          </div>
          <div className="mt-4 flex justify-between">
            <button type="button" onClick={goBack} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900">Back</button>
            <button type="button" onClick={beginOtp} className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white">Send OTP</button>
          </div>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card title="Step 5 — Review and create">
          <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <tbody>
                <tr className="border-b border-zimson-100">
                  <th className="w-56 bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Customer</th>
                  <td className="px-3 py-2 text-stone-800">{customerName} · {phone}</td>
                </tr>
                <tr className="border-b border-zimson-100">
                  <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Watch</th>
                  <td className="px-3 py-2 text-stone-800">{watchBrand} {watchModel} · {serial}</td>
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
                  <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Uploaded photos</th>
                  <td className="px-3 py-2 text-stone-800">{photoCount}</td>
                </tr>
                <tr>
                  <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Estimate</th>
                  <td className="px-3 py-2 font-semibold text-zimson-900">INR {estimateTotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Advance</th>
                  <td className="px-3 py-2 font-semibold text-zimson-900">INR {advanceTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-between">
            <button type="button" onClick={goBack} className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900">Back</button>
            <button type="button" onClick={() => void finalizeAndPrint()} className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white">Create SRF + print</button>
          </div>
          {photoPreview.length > 0 ? (
            <div className="mt-4 rounded-xl border border-zimson-200 bg-white p-3">
              <p className="text-sm font-semibold text-zimson-900">Uploaded photo preview</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {photoPreview.map((p) => (
                  <div key={p.id} className="rounded-lg border border-zimson-200 p-1.5">
                    <img src={`/${p.filePath}`} alt={p.photoKind ?? "watch photo"} className="h-24 w-full rounded object-cover" />
                    <p className="mt-1 text-[11px] capitalize text-stone-600">{p.photoKind ?? "other"}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
      </div>

      {awaitingOtp ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <DemoOtpGate
              title="OTP verification"
              issuedCode={awaitingOtp}
              value={otpInput}
              onChange={setOtpInput}
              error={otpError}
              onVerify={verifyOtpAndProceed}
              onRegenerate={beginOtp}
            />
          </div>
        </div>
      ) : null}

      {showCreateCustomerPopup ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Create customer</h3>
            <p className="mt-1 text-sm text-stone-600">Customer not found. Verify OTP and save customer to continue SRF booking.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Customer name<input className={inputClass} value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></label>
              <label className="text-sm">Primary mobile<input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
              <label className="text-sm">Email<input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="text-sm">Alternate mobile<input className={inputClass} value={alternatePhone} onChange={(e) => setAlternatePhone(e.target.value)} /></label>
              <label className="text-sm">Address<input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} /></label>
              <label className="text-sm">City<input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} /></label>
            </div>
            {newCustomerOtpIssued ? (
              <div className="mt-4">
                <DemoOtpGate
                  title="OTP for new customer creation"
                  issuedCode={newCustomerOtpIssued}
                  value={newCustomerOtpInput}
                  onChange={setNewCustomerOtpInput}
                  error={newCustomerOtpError}
                  onVerify={() => void verifyNewCustomerOtpAndCreate()}
                  onRegenerate={beginNewCustomerOtp}
                />
              </div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateCustomerPopup(false);
                  setNewCustomerOtpIssued(null);
                  setNewCustomerOtpInput("");
                  setNewCustomerOtpError(null);
                }}
                className="rounded-xl border border-zimson-300 px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={beginNewCustomerOtp}
                className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white hover:bg-zimson-700"
              >
                Send OTP
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
