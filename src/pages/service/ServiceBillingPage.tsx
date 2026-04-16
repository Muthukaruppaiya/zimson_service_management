import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useCustomers } from "../../context/CustomersContext";
import { phoneLast10 } from "../../lib/customerLookup";
import type { CustomerRecord } from "../../types/customer";

type Phase = "name" | "phone" | "match" | "bill" | "done";

type LineItem = { id: string; description: string; qty: string; rate: string };

function emptyLine(): LineItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    description: "",
    qty: "1",
    rate: "",
  };
}

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

function nextBillRef() {
  return `BILL-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
}

export function ServiceBillingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { lookup, getById } = useCustomers();

  const [phase, setPhase] = useState<Phase>("name");
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [taxPercent, setTaxPercent] = useState("18");
  const [billRef, setBillRef] = useState<string | null>(null);

  const customerIdParam = searchParams.get("customerId");

  useEffect(() => {
    if (!customerIdParam) return;
    const c = getById(customerIdParam);
    if (c) {
      setSelectedCustomer(c);
      setPhase("bill");
      setLookupNote(null);
      setError(null);
    }
  }, [customerIdParam, getById]);

  function goRegisterNew(reason: "new" | "choice" = "new") {
    const q = new URLSearchParams();
    if (draftName.trim()) q.set("name", draftName.trim());
    if (draftPhone.trim()) q.set("phone", draftPhone.trim());
    if (reason === "new") q.set("reason", "new");
    navigate(`/service/billing/register?${q.toString()}`);
  }

  function handleNameNext(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!draftName.trim()) {
      setError("Enter the customer name to continue.");
      return;
    }
    setPhase("phone");
  }

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLookupNote(null);
    if (!draftPhone.trim()) {
      setError("Enter the mobile number to look up the customer.");
      return;
    }
    if (phoneLast10(draftPhone).length !== 10) {
      setError("Enter a valid 10-digit mobile number (with or without country code).");
      return;
    }

    const result = lookup(draftName, draftPhone);
    if (result.status === "found") {
      setSelectedCustomer(result.customer);
      setLookupNote(null);
      setPhase("match");
      return;
    }
    if (result.status === "phone_exists") {
      setSelectedCustomer(result.customer);
      setLookupNote(
        `This mobile number is already on file for “${result.customer.displayName}”. You can use that profile or register a new customer if this is a different person.`,
      );
      setPhase("match");
      return;
    }

    goRegisterNew("new");
  }

  function useFetchedCustomer() {
    if (!selectedCustomer) return;
    setError(null);
    setPhase("bill");
    setSearchParams({ customerId: selectedCustomer.id });
  }

  function restartLookup() {
    setSelectedCustomer(null);
    setPhase("name");
    setDraftName("");
    setDraftPhone("");
    setLookupNote(null);
    setError(null);
    setLines([emptyLine()]);
    setBillRef(null);
    setSearchParams({});
  }

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  }

  const subtotal = lines.reduce((sum, l) => {
    const q = Number.parseFloat(l.qty) || 0;
    const r = Number.parseFloat(l.rate) || 0;
    return sum + q * r;
  }, 0);
  const taxPct = Number.parseFloat(taxPercent) || 0;
  const taxAmt = (subtotal * taxPct) / 100;
  const grandTotal = subtotal + taxAmt;

  function recordBill(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedCustomer) return;
    const validLines = lines.filter((l) => {
      const q = Number.parseFloat(l.qty) || 0;
      const r = Number.parseFloat(l.rate) || 0;
      return l.description.trim() && q > 0 && r >= 0;
    });
    if (validLines.length === 0) {
      setError("Add at least one line with description, quantity, and rate.");
      return;
    }
    setBillRef(nextBillRef());
    setPhase("done");
  }

  if (phase === "done" && billRef && selectedCustomer) {
    return (
      <div>
        <ServiceBreadcrumb current="Billing" />
        <Card title="Bill recorded" subtitle="Demo — same flow as quick bill / SR counter; not posted to accounting">
          <p className="text-sm text-stone-600">
            Reference <span className="font-mono font-bold text-zimson-900">{billRef}</span>
          </p>
          <p className="mt-2 text-sm text-stone-600">
            Bill to: <strong>{selectedCustomer.displayName}</strong> · {selectedCustomer.phone}
          </p>
          <p className="mt-2 text-lg font-semibold text-stone-900">
            Total: {grandTotal.toLocaleString(undefined, { style: "currency", currency: "INR" })}{" "}
            <span className="text-sm font-normal text-stone-500">(incl. {taxPct}% tax)</span>
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={restartLookup}
              className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              New bill
            </button>
            <Link
              to="/service"
              className="inline-flex items-center rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Service home
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <ServiceBreadcrumb current="Billing" />
      <PageHeader
        title="Billing"
        description="Customer lookup (name → mobile), then line items — aligned with quick bill and SRF at the counter. No separate invoicing module."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Link
              to="/service/quick-bill"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Quick bill
            </Link>
            <Link
              to="/service/srf"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              New SRF
            </Link>
            <Link
              to="/service"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Service home
            </Link>
          </div>
        }
      />

      <div className="mb-8 flex gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
        <span className={phase === "name" ? "text-zimson-800" : ""}>1. Name</span>
        <span aria-hidden>→</span>
        <span className={phase === "phone" ? "text-zimson-800" : ""}>2. Mobile</span>
        <span aria-hidden>→</span>
        <span className={phase === "match" ? "text-zimson-800" : ""}>3. Confirm</span>
        <span aria-hidden>→</span>
        <span className={phase === "bill" ? "text-zimson-800" : ""}>4. Bill</span>
      </div>

      {error ? (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      ) : null}

      {phase === "name" ? (
        <Card title="Step 1 — Customer name" subtitle="Who is this bill for?">
          <form onSubmit={handleNameNext} className="space-y-4">
            <div>
              <label htmlFor="bill-name" className="text-xs font-medium text-stone-600">
                Full name
              </label>
              <input
                id="bill-name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Rajesh Kumar"
                autoComplete="name"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Continue
            </button>
          </form>
        </Card>
      ) : null}

      {phase === "phone" ? (
        <Card title="Step 2 — Mobile number" subtitle={`Looking up: ${draftName.trim() || "—"}`}>
          <form onSubmit={handleLookup} className="space-y-4">
            <p className="text-sm text-stone-600">
              We use the mobile number to detect an <strong>existing</strong> customer. If none is found,
              you will be redirected to <strong>customer registration</strong>.
            </p>
            <div>
              <label htmlFor="bill-phone" className="text-xs font-medium text-stone-600">
                Mobile number
              </label>
              <input
                id="bill-phone"
                value={draftPhone}
                onChange={(e) => setDraftPhone(e.target.value)}
                className={inputClass}
                placeholder="+91 98765 43210"
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
              >
                Look up customer
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase("name");
                  setError(null);
                }}
                className="rounded-xl border border-zimson-400 bg-white px-5 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
              >
                Back
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      {phase === "match" && selectedCustomer ? (
        <Card title="Step 3 — Customer on file" subtitle="Fetched from demo directory">
          {lookupNote ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {lookupNote}
            </div>
          ) : (
            <p className="mb-4 text-sm text-emerald-800">
              Matching customer found — details below. Continue to build the bill.
            </p>
          )}
          <dl className="grid gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/50 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-stone-500">Name</dt>
              <dd className="font-semibold text-stone-900">{selectedCustomer.displayName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">Mobile</dt>
              <dd className="text-stone-800">{selectedCustomer.phone}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">Email</dt>
              <dd className="text-stone-800">{selectedCustomer.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">Type</dt>
              <dd className="text-stone-800">{selectedCustomer.customerKind}</dd>
            </div>
            {selectedCustomer.customerKind === "B2B" ? (
              <>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-stone-500">Company</dt>
                  <dd className="text-stone-800">{selectedCustomer.company ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-stone-500">GSTIN</dt>
                  <dd className="font-mono text-stone-800">{selectedCustomer.gst ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-stone-500">PAN</dt>
                  <dd className="font-mono text-stone-800">{selectedCustomer.pan ?? "—"}</dd>
                </div>
              </>
            ) : null}
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={useFetchedCustomer}
              className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Continue to bill
            </button>
            <button
              type="button"
              onClick={() => goRegisterNew("choice")}
              className="rounded-xl border border-zimson-400 bg-white px-5 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Register new customer instead
            </button>
            <button
              type="button"
              onClick={restartLookup}
              className="text-sm font-medium text-stone-600 underline decoration-zimson-300 underline-offset-2 hover:text-stone-900"
            >
              Start over
            </button>
          </div>
        </Card>
      ) : null}

      {phase === "bill" && selectedCustomer ? (
        <>
          <Card title="Bill to" subtitle="Read-only from customer master">
            <p className="text-sm font-semibold text-stone-900">{selectedCustomer.displayName}</p>
            <p className="text-sm text-stone-600">
              {selectedCustomer.phone}
              {selectedCustomer.email ? ` · ${selectedCustomer.email}` : ""}
            </p>
            {selectedCustomer.customerKind === "B2B" ? (
              <p className="mt-2 text-xs text-stone-500">
                {selectedCustomer.company} · GST {selectedCustomer.gst} · PAN {selectedCustomer.pan}
              </p>
            ) : null}
            <button
              type="button"
              onClick={restartLookup}
              className="mt-3 text-xs font-medium text-zimson-800 underline"
            >
              Change customer
            </button>
          </Card>

          <form onSubmit={recordBill} className="mt-6 space-y-6">
            <Card
              title="Line items"
              subtitle="Quantity × rate"
              action={
                <button
                  type="button"
                  onClick={addLine}
                  className="rounded-lg border border-zimson-400 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 shadow-sm hover:bg-zimson-50"
                >
                  Add line
                </button>
              }
            >
              <div className="space-y-3">
                {lines.map((line) => (
                  <div
                    key={line.id}
                    className="grid gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-3 sm:grid-cols-12 sm:items-end"
                  >
                    <div className="sm:col-span-5">
                      <span className="text-xs font-medium text-stone-600">Description</span>
                      <input
                        value={line.description}
                        onChange={(e) => updateLine(line.id, { description: e.target.value })}
                        className={inputClass}
                        placeholder="Service / part"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-xs font-medium text-stone-600">Qty</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.qty}
                        onChange={(e) => updateLine(line.id, { qty: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <span className="text-xs font-medium text-stone-600">Rate (INR)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.rate}
                        onChange={(e) => updateLine(line.id, { rate: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div className="sm:col-span-2 flex sm:justify-end">
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        disabled={lines.length <= 1}
                        className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-stone-600">Tax % (GST)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col justify-end text-right text-sm">
                  <p className="text-stone-600">
                    Subtotal:{" "}
                    <span className="font-semibold text-stone-900">
                      {subtotal.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                    </span>
                  </p>
                  <p className="text-stone-600">
                    Tax:{" "}
                    <span className="font-semibold text-stone-900">
                      {taxAmt.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                    </span>
                  </p>
                  <p className="mt-1 text-base font-bold text-zimson-900">
                    Total: {grandTotal.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                  </p>
                </div>
              </div>
            </Card>

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
                Record bill
              </button>
            </div>
          </form>
        </>
      ) : null}
    </div>
  );
}
