import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { CustomerAddressForm } from "../../components/service/CustomerAddressForm";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProcessSuccessModal } from "../../components/ui/ProcessSuccessModal";
import { useCustomers } from "../../context/CustomersContext";
import { useMessageAlert } from "../../hooks/useMessageAlert";
import { isValidGstFormat, isValidPanFormat, panFromGstin } from "../../data/serviceSeed";
import {
  validateCustomerB2bGstin,
  ZIMSON_OWN_GSTIN_FIELD_HINT,
} from "../../lib/zimsonCompanyGst";
import { apiJson, useApiMode } from "../../lib/api";
import {
  sanitizeEmailInput,
  sanitizeGstPanInput,
  sanitizePhoneDigits,
  sanitizeTextInput,
} from "../../lib/inputSanitize";
import {
  emptyCustomerAddress,
  isCustomerAddressComplete,
  trimCustomerAddress,
  validateCustomerAnniversary,
} from "../../lib/customerAddress";
import type { CustomerAddressBlock, CustomerKind } from "../../types/customer";
import { inputClass } from "../../lib/uiForm";

const contactVerifyPill =
  "inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900";

const SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Miss", "Dr."] as const;

const FALLBACK_COUNTRIES: Array<{ id: string; name: string; sortOrder: number }> = [
  { id: "IN", name: "India", sortOrder: 10 },
  { id: "AE", name: "United Arab Emirates", sortOrder: 20 },
  { id: "SG", name: "Singapore", sortOrder: 30 },
  { id: "US", name: "United States", sortOrder: 40 },
  { id: "GB", name: "United Kingdom", sortOrder: 50 },
  { id: "AU", name: "Australia", sortOrder: 60 },
  { id: "MY", name: "Malaysia", sortOrder: 70 },
  { id: "LK", name: "Sri Lanka", sortOrder: 80 },
];

function digitsOnly(v: string, maxLen: number): string {
  return sanitizePhoneDigits(v, maxLen);
}

const MAX_ADDITIONAL_ADDRESSES = 2;

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

type CountryRow = { id: string; name: string; sortOrder: number };

export function SrfCustomerRegisterPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const api = useApiMode();
  const {
    registerCustomer,
    startRegistrationMobileOtp,
    confirmRegistrationMobileOtp,
    startRegistrationEmailOtp,
    confirmRegistrationEmailOtp,
  } = useCustomers();
  const { showError: showOtpAlert, alertModal } = useMessageAlert();
  const forQuickBill = location.pathname.includes("/quick-bill/new-customer");

  const initialPhone = searchParams.get("phone") ?? "";
  const lockedQuickBillPhone = forQuickBill && digitsOnly(initialPhone, 10).length === 10;
  const initialName = searchParams.get("name") ?? "";
  const returnTo = searchParams.get("returnTo") ?? "";

  const [customerKind, setCustomerKind] = useState<CustomerKind>("B2C");
  const [salutation, setSalutation] = useState<string>("Mr.");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [b2bDisplayName, setB2bDisplayName] = useState("");
  const [phoneEditable, setPhoneEditable] = useState(() => digitsOnly(initialPhone, 10));
  const phone = lockedQuickBillPhone ? digitsOnly(initialPhone, 10) : phoneEditable;
  const [alternatePhone, setAlternatePhone] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [anniversaryDate, setAnniversaryDate] = useState("");
  const [billing, setBilling] = useState<CustomerAddressBlock>(() => emptyCustomerAddress());
  const [shipping, setShipping] = useState<CustomerAddressBlock>(() => emptyCustomerAddress());
  const [additionalAddresses, setAdditionalAddresses] = useState<CustomerAddressBlock[]>([]);
  const [sameShippingAsBilling, setSameShippingAsBilling] = useState(false);
  const [company, setCompany] = useState("");
  const [gst, setGst] = useState("");
  const [pan, setPan] = useState("");
  const [remarkAttention, setRemarkAttention] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [gstFetchBusy, setGstFetchBusy] = useState(false);

  const [countries, setCountries] = useState<CountryRow[]>(FALLBACK_COUNTRIES);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [demoMobileOtp, setDemoMobileOtp] = useState<string | null>(null);
  const [demoEmailOtp, setDemoEmailOtp] = useState<string | null>(null);
  const [mobileOtpInput, setMobileOtpInput] = useState("");
  const [emailOtpInput, setEmailOtpInput] = useState("");
  const [mobileOtpVerified, setMobileOtpVerified] = useState(false);
  const [emailOtpVerified, setEmailOtpVerified] = useState(false);
  const [otpStartBusy, setOtpStartBusy] = useState(false);
  const [emailOtpAnchor, setEmailOtpAnchor] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    id: string;
    customerCode: string | null | undefined;
    /** Canonical mobile saved on the server (for resume URL). */
    phoneDigits: string;
  } | null>(null);

  useEffect(() => {
    const parts = initialName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" "));
    } else if (parts.length === 1) {
      setFirstName(parts[0] ?? "");
    }
  }, [initialName]);

  const phoneKey = useMemo(() => digitsOnly(phone, 12), [phone]);
  const emailKey = useMemo(() => email.trim().toLowerCase(), [email]);

  useEffect(() => {
    setSessionId(null);
    setDemoMobileOtp(null);
    setDemoEmailOtp(null);
    setMobileOtpInput("");
    setEmailOtpInput("");
    setMobileOtpVerified(false);
    setEmailOtpVerified(false);
    setEmailOtpAnchor(null);
  }, [phoneKey]);

  useEffect(() => {
    if (emailOtpAnchor === null) return;
    if (emailKey !== emailOtpAnchor) {
      setDemoEmailOtp(null);
      setEmailOtpInput("");
      setEmailOtpVerified(false);
      setEmailOtpAnchor(null);
    }
  }, [emailKey, emailOtpAnchor]);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    void apiJson<{ countries: CountryRow[] }>("/api/countries")
      .then((out) => {
        if (!cancelled && Array.isArray(out.countries) && out.countries.length > 0) {
          setCountries(out.countries);
        }
      })
      .catch(() => {
        /* keep fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (sameShippingAsBilling) {
      setShipping({ ...billing });
    }
  }, [sameShippingAsBilling, billing]);

  useEffect(() => {
    if (customerKind !== "B2B" || !isValidGstFormat(gst)) return;
    const derived = panFromGstin(gst);
    if (derived) setPan((prev) => (prev.trim() ? prev : derived));
  }, [gst, customerKind]);

  const shipEffective = useMemo(
    () => (sameShippingAsBilling ? billing : shipping),
    [sameShippingAsBilling, billing, shipping],
  );

  async function fetchCompanyFromGst() {
    if (!isValidGstFormat(gst)) {
      setError("Enter a valid 15-character GSTIN before lookup.");
      return;
    }
    const zimsonErr = validateCustomerB2bGstin(gst);
    if (zimsonErr) {
      setError(zimsonErr);
      return;
    }
    setGstFetchBusy(true);
    setError(null);
    try {
      const out = await apiJson<{ tradeName?: string; legalName?: string }>("/api/gst/lookup", {
        method: "POST",
        json: { gst: gst.trim().toUpperCase() },
      });
      const name = (out.tradeName ?? out.legalName ?? "").trim();
      if (name) setCompany(name);
      const derivedPan = panFromGstin(gst);
      if (derivedPan) setPan(derivedPan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch company from GSTIN.");
    } finally {
      setGstFetchBusy(false);
    }
  }

  async function handleStartMobileOtp() {
    setError(null);
    if (!phone.trim() || digitsOnly(phone, 12).length < 10) {
      showOtpAlert("Enter a valid 10-digit primary mobile.", "OTP");
      return;
    }
    setOtpStartBusy(true);
    setMobileOtpVerified(false);
    setEmailOtpVerified(false);
    setMobileOtpInput("");
    setEmailOtpInput("");
    setDemoEmailOtp(null);
    setEmailOtpAnchor(null);
    try {
      const out = await startRegistrationMobileOtp({
        primaryPhone: phone,
        otpPhone: "",
      });
      setSessionId(out.sessionId);
      setDemoMobileOtp(out.demoMobileOtp ?? null);
    } catch (e) {
      showOtpAlert(e instanceof Error ? e.message : "Could not send mobile OTP.", "OTP");
    } finally {
      setOtpStartBusy(false);
    }
  }

  async function handleConfirmMobileOtp() {
    setError(null);
    if (!sessionId) {
      showOtpAlert("Tap Verify next to primary mobile to send the mobile OTP first.", "OTP");
      return;
    }
    if (mobileOtpInput.trim().length !== 6) {
      showOtpAlert("Enter the 6-digit mobile OTP.", "OTP");
      return;
    }
    try {
      await confirmRegistrationMobileOtp({ sessionId, otp: mobileOtpInput.trim() });
      setMobileOtpVerified(true);
    } catch (e) {
      showOtpAlert(
        e instanceof Error ? e.message : "Mobile OTP could not be confirmed.",
        "OTP verification failed",
      );
    }
  }

  async function handleStartEmailOtp() {
    setError(null);
    if (!mobileOtpVerified || !sessionId) {
      showOtpAlert("Verify your mobile number first, then enter your email.", "OTP");
      return;
    }
    if (!isValidEmail(email)) {
      showOtpAlert("Enter a valid email before requesting email OTP.", "OTP");
      return;
    }
    setOtpStartBusy(true);
    setEmailOtpVerified(false);
    setEmailOtpInput("");
    try {
      const out = await startRegistrationEmailOtp({ sessionId, email: email.trim() });
      setDemoEmailOtp(out.demoEmailOtp ?? null);
      setEmailOtpAnchor(emailKey);
      if (out.demoEmailOtp) {
        setEmailOtpInput("");
      }
    } catch (e) {
      showOtpAlert(e instanceof Error ? e.message : "Could not send email OTP.", "OTP");
      setEmailOtpAnchor(null);
      setDemoEmailOtp(null);
    } finally {
      setOtpStartBusy(false);
    }
  }

  async function handleConfirmEmailOtp() {
    setError(null);
    if (!sessionId) {
      showOtpAlert("Complete mobile verification first.", "OTP");
      return;
    }
    if (emailOtpInput.trim().length !== 6) {
      showOtpAlert("Enter the 6-digit email OTP.", "OTP");
      return;
    }
    try {
      await confirmRegistrationEmailOtp({ sessionId, otp: emailOtpInput.trim() });
      setEmailOtpVerified(true);
    } catch (e) {
      showOtpAlert(
        e instanceof Error ? e.message : "Email OTP could not be confirmed.",
        "OTP verification failed",
      );
    }
  }

  function validateAll(): boolean {
    setError(null);
    if (!sessionId || !mobileOtpVerified) {
      showOtpAlert(
        "Complete mobile OTP verification (Verify → enter code → Confirm OTP).",
        "OTP required",
      );
      return false;
    }
    if (email.trim() && !isValidEmail(email)) {
      setError("Enter a valid email or leave the field blank.");
      return false;
    }
    const annErr = validateCustomerAnniversary(dob, anniversaryDate);
    if (annErr) {
      setError(annErr);
      return false;
    }
    const p10 = digitsOnly(phone, 12);
    if (p10.length !== 10) {
      setError("Primary mobile must be 10 digits.");
      return false;
    }
    if (customerKind === "B2C") {
      if (!firstName.trim() || !lastName.trim()) {
        setError("First name and last name are required.");
        return false;
      }
      if (pan.trim() && !isValidPanFormat(pan)) {
        setError("Enter a valid 10-character PAN or leave it blank.");
        return false;
      }
    } else {
      if (!b2bDisplayName.trim()) {
        setError("B2B display name is required.");
        return false;
      }
      if (!company.trim()) {
        setError("Company name is required.");
        return false;
      }
      if (!isValidGstFormat(gst)) {
        setError("Enter a valid GSTIN.");
        return false;
      }
      const zimsonErr = validateCustomerB2bGstin(gst);
      if (zimsonErr) {
        setError(zimsonErr);
        return false;
      }
      const panValue = pan.trim() || panFromGstin(gst) || "";
      if (!isValidPanFormat(panValue)) {
        setError("Enter a valid PAN or a GSTIN that contains a valid PAN.");
        return false;
      }
    }
    if (!isCustomerAddressComplete(billing)) {
      setError("Complete billing address (line 1, country, state, district, city, PIN).");
      return false;
    }
    if (!isCustomerAddressComplete(shipEffective)) {
      setError("Complete shipping address or tick same as billing.");
      return false;
    }
    for (let i = 0; i < additionalAddresses.length; i++) {
      if (!isCustomerAddressComplete(additionalAddresses[i]!)) {
        setError(`Complete additional address #${i + 1} or remove it.`);
        return false;
      }
    }
    return true;
  }

  async function handleFinalSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAll()) return;
    setSaving(true);
    setError(null);
    try {
      const row = await registerCustomer({
        sessionId: sessionId!,
        mobileOtp: mobileOtpInput.trim(),
        customerKind,
        salutation,
        firstName,
        lastName,
        phone: digitsOnly(phone, 12),
        otpPhone: digitsOnly(phone, 12),
        alternatePhone: alternatePhone ? digitsOnly(alternatePhone, 12) : undefined,
        telephone: telephone.trim() || undefined,
        email: isValidEmail(email) ? email.trim().toLowerCase() : undefined,
        emailOtp: emailOtpVerified ? emailOtpInput.trim() : undefined,
        dob: dob || undefined,
        anniversaryDate: anniversaryDate || undefined,
        billingAddress: trimCustomerAddress(billing),
        shippingAddress: trimCustomerAddress(shipEffective),
        additionalAddresses:
          additionalAddresses.length > 0 ? additionalAddresses.map((a) => trimCustomerAddress(a)) : undefined,
        sameShippingAsBilling,
        b2bTradeDisplayName: customerKind === "B2B" ? b2bDisplayName.trim() : undefined,
        company: customerKind === "B2B" ? company.trim() : undefined,
        gst: customerKind === "B2B" ? gst.trim().toUpperCase() : undefined,
        pan: (() => {
          const p = pan.trim().toUpperCase() || panFromGstin(gst) || "";
          return p || undefined;
        })(),
        remarkAttention: remarkAttention.trim() || undefined,
        referenceName: referenceName.trim() || undefined,
        representativeName: representativeName.trim() || undefined,
      });
      setSuccessInfo({ id: row.id, customerCode: row.customerCode, phoneDigits: row.phone });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save customer.");
    } finally {
      setSaving(false);
    }
  }

  function afterSuccessNavigate() {
    if (!successInfo) return;
    const digits = successInfo.phoneDigits || digitsOnly(phone, 12);
    const q = new URLSearchParams({
      customerId: successInfo.id,
      phone: digits,
    });
    if (returnTo && returnTo.startsWith("/")) {
      if (returnTo.startsWith("/service/quick-bill")) {
        q.set("resumeCustomer", "1");
      } else if (returnTo.startsWith("/service/srf")) {
        q.set("resumeStep", "1");
      }
      const join = returnTo.includes("?") ? "&" : "?";
      navigate(`${returnTo}${join}${q.toString()}`, { replace: true });
    } else if (forQuickBill) {
      q.set("resumeCustomer", "1");
      navigate(`/service/quick-bill?${q.toString()}`, { replace: true });
    } else {
      q.set("resumeStep", "1");
      navigate(`/service/srf?${q.toString()}`, { replace: true });
    }
  }

  return (
    <div className="space-y-4">
      <ServiceBreadcrumb current={forQuickBill ? "Quick bill — new customer" : "SRF — new customer"} />
      <PageHeader
        title="Register customer"
        description=""
        actions={
          <Link
            to={
              forQuickBill
                ? `/service/quick-bill${initialPhone ? `?restorePhone=${encodeURIComponent(initialPhone)}` : ""}`
                : `/service/srf${initialPhone ? `?restorePhone=${encodeURIComponent(initialPhone)}` : ""}`
            }
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            {forQuickBill ? "Back to quick bill" : "Back to SRF"}
          </Link>
        }
      />

      <form onSubmit={(e) => void handleFinalSubmit(e)} className="space-y-6 rounded-2xl border border-zimson-200/80 bg-zimson-50/40 p-4 sm:p-6">
        <Card title="Customer type">
          <div className="grid gap-3 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-sm transition ${
                customerKind === "B2C" ? "border-zimson-500 bg-zimson-100/80" : "border-zimson-200 bg-white hover:bg-zimson-50"
              }`}
            >
              <input
                type="radio"
                name="srf-reg-kind"
                checked={customerKind === "B2C"}
                onChange={() => setCustomerKind("B2C")}
                className="text-zimson-600 focus:ring-zimson-500"
              />
              B2C
            </label>
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-sm transition ${
                customerKind === "B2B" ? "border-zimson-500 bg-zimson-100/80" : "border-zimson-200 bg-white hover:bg-zimson-50"
              }`}
            >
              <input
                type="radio"
                name="srf-reg-kind"
                checked={customerKind === "B2B"}
                onChange={() => setCustomerKind("B2B")}
                className="text-zimson-600 focus:ring-zimson-500"
              />
              B2B
            </label>
          </div>
        </Card>

        <Card title="Name">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-stone-600">Salutation</label>
              <select className={inputClass} value={salutation} onChange={(e) => setSalutation(e.target.value)}>
                {SALUTATIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {customerKind === "B2B" ? (
              <div className="sm:col-span-1">
                <label className="text-xs font-medium text-stone-600">Display name (B2B) *</label>
                <input
                  value={b2bDisplayName}
                  onChange={(e) => setB2bDisplayName(sanitizeTextInput(e.target.value, 240))}
                  className={inputClass}
                  placeholder="As on invoices / correspondence"
                />
              </div>
            ) : null}
            <div>
              <label className="text-xs font-medium text-stone-600">First name *</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(sanitizeTextInput(e.target.value, 80))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Last name *</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(sanitizeTextInput(e.target.value, 80))}
                className={inputClass}
              />
            </div>
          </div>
        </Card>

        <Card title="Contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Primary mobile *</label>
              {lockedQuickBillPhone ? (
                <p className="mt-0.5 text-xs text-stone-500">
                  Mobile from Quick Bill (cannot be changed on this screen).
                </p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  value={phone}
                  readOnly={lockedQuickBillPhone}
                  onChange={
                    lockedQuickBillPhone
                      ? undefined
                      : (e) => setPhoneEditable(digitsOnly(e.target.value, 10))
                  }
                  className={`${inputClass.replace("mt-1 ", "")} min-w-0 flex-1${
                    lockedQuickBillPhone ? " cursor-not-allowed bg-stone-100 text-stone-700" : ""
                  }`}
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                  maxLength={10}
                  autoComplete="tel"
                  aria-readonly={lockedQuickBillPhone}
                />
                <button
                  type="button"
                  onClick={() => void handleStartMobileOtp()}
                  disabled={otpStartBusy}
                  className="shrink-0 rounded-lg border border-zimson-500 bg-white px-3 py-2 text-xs font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {otpStartBusy ? "…" : "Verify"}
                </button>
                {mobileOtpVerified ? (
                  <span className={contactVerifyPill} title="Mobile verified">
                    <span aria-hidden="true">✓</span> Verified
                  </span>
                ) : null}
              </div>
              {sessionId && !mobileOtpVerified ? (
                <div className="mt-2 rounded-xl border border-dashed border-zimson-400 bg-zimson-50/80 p-3">
                  {demoMobileOtp ? (
                    <p className="text-xs text-stone-600">
                      <span className="font-semibold text-zimson-900">Mobile OTP</span>{" "}
                      <span className="text-stone-500">(SMS not configured — use this code)</span>{" "}
                      <span className="font-mono text-lg font-bold tracking-widest text-stone-900">{demoMobileOtp}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-stone-600">
                      A 6-digit OTP was sent to <strong className="text-zimson-900">{phone}</strong>. Enter it below.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label className="text-xs font-medium text-stone-600" htmlFor="srf-reg-mobile-otp">
                        Enter mobile OTP *
                      </label>
                      <input
                        id="srf-reg-mobile-otp"
                        value={mobileOtpInput}
                        onChange={(e) => setMobileOtpInput(digitsOnly(e.target.value, 6))}
                        className={inputClass}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="6 digits"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleConfirmMobileOtp()}
                      disabled={mobileOtpInput.length !== 6}
                      className="shrink-0 rounded-lg bg-zimson-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Confirm OTP
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Alternate mobile</label>
              <input
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(digitsOnly(e.target.value, 10))}
                className={inputClass}
                maxLength={10}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Telephone</label>
              <input
                value={telephone}
                onChange={(e) => setTelephone(sanitizePhoneDigits(e.target.value, 15))}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Email (optional)</label>
              <p className="mt-1 text-xs text-stone-500">
                You can enter email anytime. Use Verify after mobile OTP is confirmed (or save with verification
                pending).
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(sanitizeEmailInput(e.target.value))}
                  className={`${inputClass.replace("mt-1 ", "")} min-w-0 flex-1`}
                  placeholder="name@example.com"
                  autoComplete="email"
                />
                <button
                  type="button"
                  onClick={() => void handleStartEmailOtp()}
                  disabled={otpStartBusy || !mobileOtpVerified || !isValidEmail(email)}
                  className="shrink-0 rounded-lg border border-zimson-500 bg-white px-3 py-2 text-xs font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {otpStartBusy ? "…" : "Verify"}
                </button>
                {emailOtpVerified ? (
                  <span className={contactVerifyPill} title="Email verified">
                    <span aria-hidden="true">✓</span> Verified
                  </span>
                ) : isValidEmail(email) && mobileOtpVerified ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                    Email verification pending
                  </span>
                ) : null}
              </div>
              {sessionId && mobileOtpVerified && !emailOtpVerified && emailOtpAnchor === emailKey ? (
                <div className="mt-2 rounded-xl border border-dashed border-zimson-400 bg-zimson-50/80 p-3">
                  {demoEmailOtp ? (
                    <p className="text-xs text-stone-600">
                      <span className="font-semibold text-zimson-900">Email OTP</span>{" "}
                      <span className="text-stone-500">
                        (email could not be sent — enter this code below)
                      </span>{" "}
                      <span className="font-mono text-lg font-bold tracking-widest text-stone-900">{demoEmailOtp}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-stone-600">
                      A 6-digit OTP was sent to <strong className="text-zimson-900">{email}</strong>. Enter it below.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label className="text-xs font-medium text-stone-600" htmlFor="srf-reg-email-otp">
                        Enter email OTP *
                      </label>
                      <input
                        id="srf-reg-email-otp"
                        value={emailOtpInput}
                        onChange={(e) => setEmailOtpInput(digitsOnly(e.target.value, 6))}
                        className={inputClass}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="6 digits"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleConfirmEmailOtp()}
                      disabled={emailOtpInput.length !== 6}
                      className="shrink-0 rounded-lg bg-zimson-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Confirm OTP
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Date of birth</label>
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Anniversary</label>
              <input
                type="date"
                value={anniversaryDate}
                onChange={(e) => setAnniversaryDate(e.target.value)}
                className={inputClass}
                min={dob || undefined}
              />
              <p className="mt-1 text-[11px] text-stone-500">
                If entered, must be at least 18 years after date of birth.
              </p>
              {dob && anniversaryDate && validateCustomerAnniversary(dob, anniversaryDate) ? (
                <p className="mt-1 text-xs text-red-700">{validateCustomerAnniversary(dob, anniversaryDate)}</p>
              ) : null}
            </div>
            {customerKind === "B2C" ? (
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-stone-600">PAN (optional)</label>
                <input
                  value={pan}
                  onChange={(e) => setPan(sanitizeGstPanInput(e.target.value, 10))}
                  className={inputClass}
                  maxLength={10}
                  placeholder="10-character PAN if available"
                />
              </div>
            ) : null}
          </div>
        </Card>

        <Card title="Billing & shipping">
          <div className="mb-4 grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-zimson-200 bg-white/80 p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-zimson-900">Billing address</h3>
              <CustomerAddressForm value={billing} onChange={setBilling} countries={countries} />
            </div>
            <div className="rounded-xl border border-zimson-200 bg-white/80 p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-zimson-900">Shipping address</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-stone-700">
                    <input
                      type="checkbox"
                      checked={sameShippingAsBilling}
                      onChange={(e) => setSameShippingAsBilling(e.target.checked)}
                      className="rounded border-zimson-300 text-zimson-600 focus:ring-zimson-500"
                    />
                    Same as billing
                  </label>
                  {!sameShippingAsBilling ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShipping(emptyCustomerAddress());
                        setSameShippingAsBilling(false);
                      }}
                      className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                    >
                      Clear address
                    </button>
                  ) : null}
                </div>
              </div>
              {sameShippingAsBilling ? (
                <div className="space-y-2">
                  {/* <p className="text-xs text-stone-600">
                    Shipping matches billing. Uncheck &quot;Same as billing&quot; to edit a different shipping address.
                  </p> */}
                  <CustomerAddressForm
                    value={billing}
                    onChange={() => {}}
                    countries={countries}
                    disabled
                  />
                </div>
              ) : (
                <CustomerAddressForm value={shipping} onChange={setShipping} countries={countries} />
              )}
            </div>
          </div>
        </Card>

        <Card title="Additional addresses">
         
          {additionalAddresses.map((addr, idx) => (
            <div key={idx} className="mb-4 rounded-xl border border-zimson-200/90 bg-white/70 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-stone-600">
                  Address {idx + 3}
                </span>
                <button
                  type="button"
                  onClick={() => setAdditionalAddresses((list) => list.filter((_, j) => j !== idx))}
                  className="text-xs font-semibold text-red-700 hover:underline"
                >
                  Remove
                </button>
              </div>
              <CustomerAddressForm
                value={addr}
                onChange={(next) =>
                  setAdditionalAddresses((list) => {
                    const copy = [...list];
                    copy[idx] = next;
                    return copy;
                  })
                }
                countries={countries}
              />
            </div>
          ))}
          <button
            type="button"
            disabled={additionalAddresses.length >= MAX_ADDITIONAL_ADDRESSES}
            onClick={() =>
              setAdditionalAddresses((list) =>
                list.length < MAX_ADDITIONAL_ADDRESSES ? [...list, emptyCustomerAddress()] : list,
              )
            }
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-zimson-400 bg-zimson-50/60 px-4 py-2.5 text-sm font-semibold text-zimson-900 transition hover:bg-zimson-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-lg leading-none">+</span> Add address ({additionalAddresses.length}/{MAX_ADDITIONAL_ADDRESSES})
          </button>
        </Card>

        <Card title="Additional">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Remark</label>
              <input
                value={remarkAttention}
                onChange={(e) => setRemarkAttention(sanitizeTextInput(e.target.value, 120))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Representative name</label>
              <input
                value={representativeName}
                onChange={(e) => setRepresentativeName(sanitizeTextInput(e.target.value, 120))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Reference name</label>
              <input
                value={referenceName}
                onChange={(e) => setReferenceName(sanitizeTextInput(e.target.value, 120))}
                className={inputClass}
              />
            </div>
          </div>
        </Card>

        {customerKind === "B2B" ? (
          <Card title="Business & tax">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1">
                  <label className="text-xs font-medium text-stone-600">GSTIN *</label>
                  <input
                    value={gst}
                    onChange={(e) => setGst(sanitizeGstPanInput(e.target.value, 15))}
                    className={inputClass}
                    maxLength={15}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void fetchCompanyFromGst()}
                  disabled={gstFetchBusy}
                  className="rounded-xl border border-zimson-500 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm hover:bg-zimson-50 disabled:opacity-60"
                >
                  {gstFetchBusy ? "…" : "Fetch company from GST"}
                </button>
              </div>
              <p className="sm:col-span-2 text-[11px] text-amber-900/90">{ZIMSON_OWN_GSTIN_FIELD_HINT}</p>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-stone-600">Company / legal name *</label>
                <input
                  value={company}
                  onChange={(e) => setCompany(sanitizeTextInput(e.target.value, 240))}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-stone-600">PAN *</label>
                <input
                  value={pan}
                  onChange={(e) => setPan(sanitizeGstPanInput(e.target.value, 10))}
                  className={inputClass}
                  maxLength={10}
                  placeholder="Filled from GSTIN after lookup if not returned by API"
                />
                <p className="mt-1 text-[11px] text-stone-500">
                  When GST lookup does not return PAN, it is taken from characters 3–12 of the GSTIN.
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error}</p> : null}

        <div className="sticky bottom-2 z-10 flex flex-wrap gap-3 rounded-xl border border-zimson-200 bg-white/90 p-3 shadow-lg backdrop-blur">
          <button
            type="submit"
            disabled={saving || !mobileOtpVerified}
            className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Create customer"}
          </button>
          <Link
            to={
              forQuickBill
                ? `/service/quick-bill${initialPhone ? `?restorePhone=${encodeURIComponent(initialPhone)}` : ""}`
                : `/service/srf${initialPhone ? `?restorePhone=${encodeURIComponent(initialPhone)}` : ""}`
            }
            className="inline-flex items-center rounded-xl border border-zimson-400 bg-white px-5 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Cancel
          </Link>
        </div>
      </form>

      {successInfo ? (
        <ProcessSuccessModal
          open
          title="Customer created successfully"
          description="The customer master record is saved and verified for mobile and email."
          actions={
            <>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 sm:w-auto"
                onClick={() => {
                  afterSuccessNavigate();
                  setSuccessInfo(null);
                }}
              >
                Continue
              </button>
              <Link
                to="/service"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 no-underline shadow-sm transition hover:bg-zimson-50 sm:w-auto"
              >
                Home
              </Link>
            </>
          }
        >
          <p className="mt-2 text-sm text-stone-700">
            Customer code:{" "}
            <span className="font-mono font-bold text-zimson-900">{successInfo.customerCode ?? "—"}</span>
          </p>
          <p className="mt-1 text-sm text-stone-700">
            Internal ID: <span className="font-mono text-xs text-stone-600">{successInfo.id}</span>
          </p>
          <p className="mt-3 text-xs text-stone-500">
            This profile is verified for both mobile and email. Migrated records from the old system would show as
            unverified until staff complete OTP verification in a future update.
          </p>
        </ProcessSuccessModal>
      ) : null}
      {alertModal}
    </div>
  );
}
