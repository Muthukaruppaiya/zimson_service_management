import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ServiceBreadcrumb } from "../../../components/service/ServiceBreadcrumb";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { apiJson } from "../../../lib/api";
import type { CustomerRecord } from "../../../types/customer";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

export function CustomerRegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialName = searchParams.get("name") ?? "";
  const initialPhone = searchParams.get("phone") ?? "";

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
      } else {
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
        description="Check mobile in the database. If new, open the full registration form (customer code, addresses, dual OTP)."
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
          {checkedCustomer.customerCode ? (
            <p className="mt-1 text-xs text-stone-500">
              Customer code: <span className="font-mono font-semibold">{checkedCustomer.customerCode}</span>
            </p>
          ) : null}
          <p className="mt-1 text-sm text-stone-600">
            Type: {checkedCustomer.customerKind}
            {checkedCustomer.company ? ` · ${checkedCustomer.company}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                navigate(`/service/billing/create?customerId=${encodeURIComponent(checkedCustomer.id)}`, {
                  replace: true,
                })
              }
              className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Use this customer
            </button>
            <button
              type="button"
              onClick={() => {
                setCheckedCustomer(null);
                setShowCreatePopup(true);
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
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl">
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
            <p className="text-sm text-stone-700">
              Customer registration uses the full profile form: auto customer code, structured billing and shipping
              addresses, mandatory email, separate mobile and email OTP verification, and B2B GST company lookup.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to={`/service/srf/new-customer?phone=${encodeURIComponent(phoneToCheck.trim())}&name=${encodeURIComponent(initialName)}&returnTo=${encodeURIComponent("/service/billing/create")}`}
                className="inline-flex rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
              >
                Open full registration
              </Link>
              <button
                type="button"
                onClick={() => setShowCreatePopup(false)}
                className="inline-flex rounded-xl border border-zimson-400 bg-white px-5 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error}</p>
      ) : null}
    </div>
  );
}
