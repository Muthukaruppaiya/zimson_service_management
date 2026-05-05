import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useCustomers } from "../../context/CustomersContext";
import { isValidGstFormat, isValidPanFormat } from "../../data/serviceSeed";
import type { CustomerKind } from "../../types/customer";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

function digitsOnly(v: string, maxLen: number): string {
  return v.replace(/\D/g, "").slice(0, maxLen);
}

export function SrfCustomerRegisterPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { registerCustomer } = useCustomers();
  const forQuickBill = location.pathname.includes("/quick-bill/new-customer");

  const initialPhone = searchParams.get("phone") ?? "";
  const initialName = searchParams.get("name") ?? "";

  const [customerKind, setCustomerKind] = useState<CustomerKind>("B2C");
  const [displayName, setDisplayName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [alternatePhone, setAlternatePhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [occupation, setOccupation] = useState("");
  const [preferredContact, setPreferredContact] = useState<"WhatsApp" | "Call" | "SMS" | "Email">("WhatsApp");
  const [company, setCompany] = useState("");
  const [gst, setGst] = useState("");
  const [pan, setPan] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!displayName.trim() || !phone.trim()) {
      setError("Full name and mobile are required.");
      return;
    }
    const p10 = phone.replace(/\D/g, "");
    if (p10.length !== 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (!addressLine.trim() || !city.trim() || !stateName.trim() || !pinCode.trim()) {
      setError("Address, city, state, and PIN are required.");
      return;
    }
    if (pinCode.replace(/\D/g, "").length < 6) {
      setError("PIN code should be at least 6 digits.");
      return;
    }
    if (customerKind === "B2B") {
      if (!company.trim()) {
        setError("Company name is required for B2B.");
        return;
      }
      if (!isValidGstFormat(gst)) {
        setError("Enter a valid 15-character GSTIN.");
        return;
      }
      if (!isValidPanFormat(pan)) {
        setError("Enter a valid PAN (e.g. ABCDE1234F).");
        return;
      }
    }

    const addrParts = [
      addressLine.trim(),
      landmark.trim() ? `Near ${landmark.trim()}` : "",
      occupation.trim() ? `Occupation: ${occupation.trim()}` : "",
      `Preferred contact: ${preferredContact}`,
    ].filter(Boolean);
    const addressForDb = addrParts.join("\n");
    const cityForDb = `${city.trim()}, ${stateName.trim()} ${pinCode.trim()}`.slice(0, 120);

    setSaving(true);
    try {
      const row = await registerCustomer({
        displayName: displayName.trim(),
        phone: phone.trim(),
        alternatePhone: alternatePhone.trim() || undefined,
        email: email.trim(),
        address: addressForDb,
        city: cityForDb,
        customerKind,
        company: customerKind === "B2B" ? company.trim() : undefined,
        gst: customerKind === "B2B" ? gst.trim().toUpperCase() : undefined,
        pan: customerKind === "B2B" ? pan.trim().toUpperCase() : undefined,
      });
      if (forQuickBill) {
        navigate(
          `/service/quick-bill?resumeCustomer=1&customerId=${encodeURIComponent(row.id)}&phone=${encodeURIComponent(row.phone)}`,
          { replace: true },
        );
      } else {
        navigate(
          `/service/srf?resumeStep=1&customerId=${encodeURIComponent(row.id)}&phone=${encodeURIComponent(row.phone)}`,
          { replace: true },
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save customer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <ServiceBreadcrumb current={forQuickBill ? "Quick bill — new customer" : "SRF — new customer"} />
      <PageHeader
        title={forQuickBill ? "Register customer for quick bill" : "Register customer for SRF"}
        description={
          forQuickBill
            ? "This number is not in the customer master. Save the profile here, then you return to quick bill with details filled in."
            : "This customer was not found. Save the profile here, then you will return to SRF booking on the watch step."
        }
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

      <p className="mb-4 text-xs text-stone-500">
        {forQuickBill
          ? "About 12 fields for B2C (more for B2B). After save you return to quick bill to complete the sale."
          : "About 12 fields for B2C (more for B2B). After save you return to SRF on the watch step."}
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        <Card title="Customer type">
          <div className="flex gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="srf-reg-kind"
                checked={customerKind === "B2C"}
                onChange={() => setCustomerKind("B2C")}
                className="text-zimson-600 focus:ring-zimson-500"
              />
              B2C
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
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

        <Card title="Identity & contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Full name *</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={inputClass}
                placeholder="As on service record"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Mobile *</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="10-digit mobile"
                inputMode="tel"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Alternate mobile</label>
              <input
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(e.target.value)}
                className={inputClass}
                placeholder="Optional"
                inputMode="tel"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Occupation</label>
              <input
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                className={inputClass}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Preferred contact</label>
              <select
                className={inputClass}
                value={preferredContact}
                onChange={(e) => setPreferredContact(e.target.value as typeof preferredContact)}
              >
                <option value="WhatsApp">WhatsApp</option>
                <option value="Call">Call</option>
                <option value="SMS">SMS</option>
                <option value="Email">Email</option>
              </select>
            </div>
          </div>
        </Card>

        <Card title="Address">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Door / street / building *</label>
              <input
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Landmark</label>
              <input
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                className={inputClass}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">City *</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">State *</label>
              <input value={stateName} onChange={(e) => setStateName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">PIN code *</label>
              <input
                value={pinCode}
                onChange={(e) => setPinCode(digitsOnly(e.target.value, 6))}
                className={inputClass}
                inputMode="numeric"
                maxLength={6}
              />
            </div>
          </div>
        </Card>

        {customerKind === "B2B" ? (
          <Card title="Business">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-stone-600">Company / legal name *</label>
                <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600">GSTIN *</label>
                <input
                  value={gst}
                  onChange={(e) => setGst(e.target.value.toUpperCase())}
                  className={inputClass}
                  maxLength={15}
                />
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
            </div>
          </Card>
        ) : null}

        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error}</p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : forQuickBill ? "Save & continue quick bill" : "Save & continue SRF"}
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
    </div>
  );
}
