import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ServiceBreadcrumb } from "../../../components/service/ServiceBreadcrumb";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { useCustomers } from "../../../context/CustomersContext";
import { isValidGstFormat, isValidPanFormat } from "../../../data/serviceSeed";
import { apiJson } from "../../../lib/api";
import type { CustomerKind } from "../../../types/customer";
import type { CustomerRecord } from "../../../types/customer";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

export function CustomerRegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { registerCustomer } = useCustomers();

  const initialName = searchParams.get("name") ?? "";
  const initialPhone = searchParams.get("phone") ?? "";

  const [customerKind, setCustomerKind] = useState<CustomerKind>("B2C");
  const [displayName, setDisplayName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [company, setCompany] = useState("");
  const [gst, setGst] = useState("");
  const [pan, setPan] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phoneToCheck, setPhoneToCheck] = useState(initialPhone);
  const [checking, setChecking] = useState(false);
  const [checkedCustomer, setCheckedCustomer] = useState<CustomerRecord | null>(null);
  const [showCreatePopup, setShowCreatePopup] = useState(false);

  const hint = useMemo(() => {
    if (searchParams.get("reason") === "new") {
      return "No matching customer was found for the name and mobile you entered. Complete registration to continue billing.";
    }
    return "Create a customer master record, then return to billing.";
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!displayName.trim() || !phone.trim()) {
      setError("Name and phone are required.");
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
    const row = await registerCustomer({
      displayName,
      phone,
      email,
      address,
      city,
      customerKind,
      company: customerKind === "B2B" ? company : undefined,
      gst: customerKind === "B2B" ? gst : undefined,
      pan: customerKind === "B2B" ? pan : undefined,
    });
    navigate(`/service/billing/create?customerId=${encodeURIComponent(row.id)}`, { replace: true });
  }

  async function checkByPhone() {
    setError(null);
    setCheckedCustomer(null);
    if (!phoneToCheck.trim()) {
      setError("Enter mobile number first.");
      return;
    }
    setChecking(true);
    try {
      const data = await apiJson<{ customer: CustomerRecord | null }>(
        `/api/customers?phone=${encodeURIComponent(phoneToCheck.trim())}`,
      );
      if (data.customer) {
        setCheckedCustomer(data.customer);
        setShowCreatePopup(false);
        setDisplayName(data.customer.displayName);
        setPhone(data.customer.phone);
        setEmail(data.customer.email ?? "");
        setCustomerKind(data.customer.customerKind);
        setCompany(data.customer.company ?? "");
        setGst(data.customer.gst ?? "");
        setPan(data.customer.pan ?? "");
      } else {
        setDisplayName(initialName);
        setPhone(phoneToCheck);
        setShowCreatePopup(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check customer.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <ServiceBreadcrumb current="Register customer" />
      <PageHeader
        title="Customer registration"
        description="Step 1: check mobile in database. If existing, use same customer. If new, create in popup."
        actions={
          <Link
            to="/service/billing/create"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Back to billing lookup
          </Link>
        }
      />

      <Card title="Check customer by mobile">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="text-xs font-medium text-stone-600">Mobile number *</label>
            <input
              value={phoneToCheck}
              onChange={(e) => setPhoneToCheck(e.target.value)}
              className={inputClass}
              placeholder="+91 …"
            />
          </div>
          <button
            type="button"
            onClick={() => void checkByPhone()}
            disabled={checking}
            className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checking ? "Checking..." : "Check number"}
          </button>
        </div>
        <p className="mt-2 text-xs text-stone-500">{hint}</p>
      </Card>

      {checkedCustomer ? (
        <Card title="Existing customer found" className="mt-6">
          <p className="text-sm text-stone-700">
            <strong>{checkedCustomer.displayName}</strong> · {checkedCustomer.phone}
          </p>
          <p className="mt-1 text-sm text-stone-600">
            Type: {checkedCustomer.customerKind}
            {checkedCustomer.company ? ` · ${checkedCustomer.company}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate(`/service/billing/create?customerId=${encodeURIComponent(checkedCustomer.id)}`, { replace: true })}
              className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Use this customer
            </button>
            <button
              type="button"
              onClick={() => {
                setCheckedCustomer(null);
                setShowCreatePopup(true);
                setDisplayName(initialName);
                setPhone(phoneToCheck);
              }}
              className="rounded-xl border border-zimson-400 bg-white px-5 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Create as new customer
            </button>
          </div>
        </Card>
      ) : null}

      {showCreatePopup ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zimson-900">Create new customer</h2>
              <button
                type="button"
                onClick={() => setShowCreatePopup(false)}
                className="rounded-lg border border-zimson-300 px-3 py-1 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <Card title="Customer type">
          <div className="flex gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="reg-kind"
                checked={customerKind === "B2C"}
                onChange={() => setCustomerKind("B2C")}
                className="text-zimson-600 focus:ring-zimson-500"
              />
              B2C
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="reg-kind"
                checked={customerKind === "B2B"}
                onChange={() => setCustomerKind("B2B")}
                className="text-zimson-600 focus:ring-zimson-500"
              />
              B2B
            </label>
          </div>
              </Card>

              <Card title="Contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Full name *</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={inputClass}
                placeholder="As on invoice"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Mobile *</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="+91 …"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="optional"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Address</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={inputClass}
                placeholder="Address line"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputClass}
                placeholder="City"
              />
            </div>
          </div>
              </Card>

              {customerKind === "B2B" ? (
                <Card title="Business details">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-stone-600">Company / legal name *</label>
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600">GSTIN *</label>
                <input
                  value={gst}
                  onChange={(e) => setGst(e.target.value.toUpperCase())}
                  className={inputClass}
                  maxLength={15}
                  placeholder="15 characters"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600">PAN *</label>
                <input
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  className={inputClass}
                  maxLength={10}
                  placeholder="ABCDE1234F"
                />
              </div>
            </div>
                </Card>
              ) : null}

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
                  Save &amp; continue to bill
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreatePopup(false)}
                  className="inline-flex items-center rounded-xl border border-zimson-400 bg-white px-5 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
