import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useCustomers } from "../../context/CustomersContext";
import { isValidGstFormat, isValidPanFormat } from "../../data/serviceSeed";
import { apiJson, useApiMode } from "../../lib/api";
import type { CustomerAddressBlock, CustomerKind, TaxPreference } from "../../types/customer";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none ring-zimson-400/40 placeholder:text-stone-400 transition focus:border-zimson-500 focus:ring-2";

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
  return v.replace(/\D/g, "").slice(0, maxLen);
}

function emptyAddress(): CustomerAddressBlock {
  return { doorNo: "", street: "", city: "", district: "", state: "", countryId: "" };
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

type CountryRow = { id: string; name: string; sortOrder: number };

export function SrfCustomerRegisterPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const api = useApiMode();
  const { registerCustomer, startCustomerRegistrationOtp } = useCustomers();
  const forQuickBill = location.pathname.includes("/quick-bill/new-customer");

  const initialPhone = searchParams.get("phone") ?? "";
  const initialName = searchParams.get("name") ?? "";
  const returnTo = searchParams.get("returnTo") ?? "";

  const [customerKind, setCustomerKind] = useState<CustomerKind>("B2C");
  const [salutation, setSalutation] = useState<string>("Mr.");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [b2bDisplayName, setB2bDisplayName] = useState("");
  const [taxPreference, setTaxPreference] = useState<TaxPreference>("with_tax");
  const [phone, setPhone] = useState(initialPhone);
  const [otpPhone, setOtpPhone] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [anniversaryDate, setAnniversaryDate] = useState("");
  const [billing, setBilling] = useState<CustomerAddressBlock>(() => emptyAddress());
  const [shipping, setShipping] = useState<CustomerAddressBlock>(() => emptyAddress());
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
  const [otpPairVerified, setOtpPairVerified] = useState(false);
  const [otpStartBusy, setOtpStartBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ id: string; customerCode: string | null | undefined } | null>(
    null,
  );

  useEffect(() => {
    const parts = initialName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" "));
    } else if (parts.length === 1) {
      setFirstName(parts[0] ?? "");
    }
  }, [initialName]);

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

  const shipEffective = useMemo(
    () => (sameShippingAsBilling ? billing : shipping),
    [sameShippingAsBilling, billing, shipping],
  );

  function patchBilling<K extends keyof CustomerAddressBlock>(key: K, value: CustomerAddressBlock[K]) {
    setBilling((b) => ({ ...b, [key]: value }));
  }
  function patchShipping<K extends keyof CustomerAddressBlock>(key: K, value: CustomerAddressBlock[K]) {
    setShipping((s) => ({ ...s, [key]: value }));
  }

  async function fetchCompanyFromGst() {
    if (!isValidGstFormat(gst)) {
      setError("Enter a valid 15-character GSTIN before lookup.");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch company from GSTIN.");
    } finally {
      setGstFetchBusy(false);
    }
  }

  async function handleStartOtp() {
    setError(null);
    if (!phone.trim() || digitsOnly(phone, 12).length < 10) {
      setError("Enter a valid 10-digit primary mobile.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Enter a valid email before requesting OTP.");
      return;
    }
    setOtpStartBusy(true);
    setOtpPairVerified(false);
    setMobileOtpInput("");
    setEmailOtpInput("");
    try {
      const out = await startCustomerRegistrationOtp({
        primaryPhone: phone,
        otpPhone: otpPhone,
        email,
      });
      setSessionId(out.sessionId);
      setDemoMobileOtp(out.demoMobileOtp);
      setDemoEmailOtp(out.demoEmailOtp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start OTP session.");
    } finally {
      setOtpStartBusy(false);
    }
  }

  function confirmOtpsLocally() {
    setError(null);
    if (!demoMobileOtp || !demoEmailOtp) {
      setError("Request OTP codes first.");
      return;
    }
    if (mobileOtpInput.trim() !== demoMobileOtp) {
      setError("Mobile OTP does not match.");
      return;
    }
    if (emailOtpInput.trim() !== demoEmailOtp) {
      setError("Email OTP does not match.");
      return;
    }
    setOtpPairVerified(true);
  }

  function validateAll(): boolean {
    setError(null);
    if (!sessionId || !otpPairVerified) {
      setError("Complete mobile and email OTP verification.");
      return false;
    }
    if (!isValidEmail(email)) {
      setError("Valid email is required.");
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
      if (!isValidPanFormat(pan)) {
        setError("Enter a valid PAN.");
        return false;
      }
    }
    const b = billing;
    if (!b.doorNo.trim() || !b.street.trim() || !b.city.trim() || !b.district.trim() || !b.state.trim() || !b.countryId) {
      setError("Complete all mandatory billing address fields.");
      return false;
    }
    const s = shipEffective;
    if (
      !s.doorNo.trim() ||
      !s.street.trim() ||
      !s.city.trim() ||
      !s.district.trim() ||
      !s.state.trim() ||
      !s.countryId
    ) {
      setError("Complete shipping address or use same as billing.");
      return false;
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
        emailOtp: emailOtpInput.trim(),
        customerKind,
        salutation,
        firstName,
        lastName,
        phone: digitsOnly(phone, 12),
        otpPhone: digitsOnly(otpPhone, 12),
        alternatePhone: alternatePhone ? digitsOnly(alternatePhone, 12) : undefined,
        telephone: telephone.trim() || undefined,
        email: email.trim().toLowerCase(),
        dob: dob || undefined,
        anniversaryDate: anniversaryDate || undefined,
        billingAddress: {
          doorNo: billing.doorNo.trim(),
          street: billing.street.trim(),
          city: billing.city.trim(),
          district: billing.district.trim(),
          state: billing.state.trim(),
          countryId: billing.countryId.trim(),
        },
        shippingAddress: {
          doorNo: shipEffective.doorNo.trim(),
          street: shipEffective.street.trim(),
          city: shipEffective.city.trim(),
          district: shipEffective.district.trim(),
          state: shipEffective.state.trim(),
          countryId: shipEffective.countryId.trim(),
        },
        sameShippingAsBilling,
        b2bTradeDisplayName: customerKind === "B2B" ? b2bDisplayName.trim() : undefined,
        taxPreference: customerKind === "B2B" ? taxPreference : undefined,
        company: customerKind === "B2B" ? company.trim() : undefined,
        gst: customerKind === "B2B" ? gst.trim().toUpperCase() : undefined,
        pan: customerKind === "B2B" ? pan.trim().toUpperCase() : undefined,
        remarkAttention: remarkAttention.trim() || undefined,
        referenceName: referenceName.trim() || undefined,
        representativeName: representativeName.trim() || undefined,
      });
      setSuccessInfo({ id: row.id, customerCode: row.customerCode });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save customer.");
    } finally {
      setSaving(false);
    }
  }

  function afterSuccessNavigate() {
    if (!successInfo) return;
    const q = `customerId=${encodeURIComponent(successInfo.id)}&phone=${encodeURIComponent(phone)}`;
    if (returnTo && returnTo.startsWith("/")) {
      navigate(`${returnTo}${returnTo.includes("?") ? "&" : "?"}${q}`, { replace: true });
    } else if (forQuickBill) {
      navigate(`/service/quick-bill?resumeCustomer=1&${q}`, { replace: true });
    } else {
      navigate(`/service/srf?resumeStep=1&${q}`, { replace: true });
    }
  }

  function addressGrid(
    addr: CustomerAddressBlock,
    patch: typeof patchBilling,
    disabled: boolean,
  ) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-stone-600">Door / plot no. *</label>
          <input
            value={addr.doorNo}
            onChange={(e) => patch("doorNo", e.target.value)}
            className={inputClass}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-600">Street *</label>
          <input
            value={addr.street}
            onChange={(e) => patch("street", e.target.value)}
            className={inputClass}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-600">City *</label>
          <input
            value={addr.city}
            onChange={(e) => patch("city", e.target.value)}
            className={inputClass}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-600">District *</label>
          <input
            value={addr.district}
            onChange={(e) => patch("district", e.target.value)}
            className={inputClass}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-600">State *</label>
          <input
            value={addr.state}
            onChange={(e) => patch("state", e.target.value)}
            className={inputClass}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-600">Country *</label>
          <select
            className={inputClass}
            value={addr.countryId}
            onChange={(e) => patch("countryId", e.target.value)}
            disabled={disabled}
          >
            <option value="">Select country</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ServiceBreadcrumb current={forQuickBill ? "Quick bill — new customer" : "SRF — new customer"} />
      <PageHeader
        title="Register customer"
        description="Customer code is generated automatically. Email and mobile are verified with separate OTPs. Migrated customers can be marked unverified until staff completes verification."
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
                  onChange={(e) => setB2bDisplayName(e.target.value)}
                  className={inputClass}
                  placeholder="As on invoices / correspondence"
                />
              </div>
            ) : null}
            <div>
              <label className="text-xs font-medium text-stone-600">First name *</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Last name *</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
            </div>
          </div>
        </Card>

        <Card title="Contact (B2B & B2C)">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-stone-600">Primary mobile *</label>
              <input
                value={phone}
                onChange={(e) => setPhone(digitsOnly(e.target.value, 10))}
                className={inputClass}
                placeholder="10-digit mobile"
                inputMode="numeric"
                maxLength={10}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">OTP mobile (optional)</label>
              <input
                value={otpPhone}
                onChange={(e) => setOtpPhone(digitsOnly(e.target.value, 10))}
                className={inputClass}
                placeholder="Defaults to primary mobile if empty"
                inputMode="numeric"
                maxLength={10}
              />
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
              <input value={telephone} onChange={(e) => setTelephone(e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                required
              />
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
              />
            </div>
          </div>
        </Card>

        <Card title="OTP verification (mobile & email separately)">
          <p className="mb-3 text-xs text-stone-600">
            Request codes sent to the OTP mobile (or primary mobile) and to your email. Enter each OTP below. This
            demo shows both codes on screen; production would use SMS and email gateways.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleStartOtp()}
              disabled={otpStartBusy}
              className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:opacity-60"
            >
              {otpStartBusy ? "Sending…" : "Get OTP codes"}
            </button>
            {demoMobileOtp && demoEmailOtp ? (
              <span className="self-center text-xs font-medium text-emerald-800">Codes issued — enter below.</span>
            ) : null}
          </div>
          {demoMobileOtp && demoEmailOtp ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-zimson-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-zimson-900">Mobile OTP</p>
                <p className="mt-2 font-mono text-2xl font-bold tracking-widest text-stone-900">{demoMobileOtp}</p>
                <label className="mt-3 block text-xs font-medium text-stone-600">Enter mobile OTP *</label>
                <input
                  value={mobileOtpInput}
                  onChange={(e) => setMobileOtpInput(digitsOnly(e.target.value, 6))}
                  className={inputClass}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6 digits"
                />
              </div>
              <div className="rounded-xl border border-zimson-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-zimson-900">Email OTP</p>
                <p className="mt-2 font-mono text-2xl font-bold tracking-widest text-stone-900">{demoEmailOtp}</p>
                <label className="mt-3 block text-xs font-medium text-stone-600">Enter email OTP *</label>
                <input
                  value={emailOtpInput}
                  onChange={(e) => setEmailOtpInput(digitsOnly(e.target.value, 6))}
                  className={inputClass}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6 digits"
                />
              </div>
            </div>
          ) : null}
          {demoMobileOtp && demoEmailOtp ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={confirmOtpsLocally}
                className="rounded-xl border border-zimson-500 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 shadow-sm hover:bg-zimson-50"
              >
                I have entered both OTPs — confirm
              </button>
              {otpPairVerified ? (
                <p className="mt-2 text-sm font-semibold text-emerald-800">Mobile and email OTPs confirmed.</p>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card title="Billing address">{addressGrid(billing, patchBilling, false)}</Card>

        <Card title="Shipping address">
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-stone-800">
            <input
              type="checkbox"
              checked={sameShippingAsBilling}
              onChange={(e) => setSameShippingAsBilling(e.target.checked)}
              className="rounded border-zimson-300 text-zimson-600 focus:ring-zimson-500"
            />
            Same as billing address
          </label>
          {!sameShippingAsBilling ? (
            addressGrid(shipping, patchShipping, false)
          ) : (
            <p className="text-sm text-stone-600">Shipping will copy billing address on save.</p>
          )}
        </Card>

        <Card title="Additional">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Remark / attention</label>
              <input value={remarkAttention} onChange={(e) => setRemarkAttention(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Reference name</label>
              <input value={referenceName} onChange={(e) => setReferenceName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Representative name</label>
              <input
                value={representativeName}
                onChange={(e) => setRepresentativeName(e.target.value)}
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
                    onChange={(e) => setGst(e.target.value.toUpperCase())}
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
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-stone-600">Company / legal name *</label>
                <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600">PAN *</label>
                <input
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  className={inputClass}
                  maxLength={10}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600">Tax preference</label>
                <select
                  className={inputClass}
                  value={taxPreference}
                  onChange={(e) => setTaxPreference(e.target.value as TaxPreference)}
                >
                  <option value="with_tax">Default (tax as per rules)</option>
                  <option value="without_tax_exhibited">Without tax exhibited</option>
                </select>
              </div>
            </div>
          </Card>
        ) : null}

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error}</p> : null}

        <div className="sticky bottom-2 z-10 flex flex-wrap gap-3 rounded-xl border border-zimson-200 bg-white/90 p-3 shadow-lg backdrop-blur">
          <button
            type="submit"
            disabled={saving || !otpPairVerified}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-emerald-900">Customer created successfully</h3>
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
            <button
              type="button"
              onClick={() => {
                afterSuccessNavigate();
                setSuccessInfo(null);
              }}
              className="mt-5 w-full rounded-xl bg-zimson-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zimson-700"
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
