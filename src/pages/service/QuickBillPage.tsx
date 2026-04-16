import { useState } from "react";
import { Link } from "react-router-dom";
import { DemoOtpGate } from "../../components/service/DemoOtpGate";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import {
  findPart,
  generateDemoOtp,
  isValidGstFormat,
  isValidPanFormat,
  nextQuickBillRef,
  SEED_PARTS,
  SEED_TECHNICIANS,
  watchBrands,
  watchModelsForBrand,
} from "../../data/serviceSeed";

type LineItem = { id: string; description: string; amount: string };

function emptyLine(): LineItem {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, description: "", amount: "" };
}

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

export function QuickBillPage() {
  const [customerType, setCustomerType] = useState<"B2C" | "B2B">("B2C");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [gst, setGst] = useState("");
  const [pan, setPan] = useState("");

  const brands = watchBrands();
  const [watchBrand, setWatchBrand] = useState(brands[0] ?? "");
  const models = watchModelsForBrand(watchBrand);
  const [watchModel, setWatchModel] = useState<string>(models[0]?.model ?? "");
  const [watchRef, setWatchRef] = useState("");

  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [partPick, setPartPick] = useState("");
  const [technicianId, setTechnicianId] = useState<string>(SEED_TECHNICIANS[0]?.id ?? "");
  const [paymentMode, setPaymentMode] = useState<"Cash" | "Card" | "UPI">("Cash");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [completedRef, setCompletedRef] = useState<string | null>(null);

  const [awaitingOtp, setAwaitingOtp] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);

  function syncModelForBrand(nextBrand: string) {
    setWatchBrand(nextBrand);
    const ms = watchModelsForBrand(nextBrand);
    const first = ms[0];
    setWatchModel(first?.model ?? "");
    if (first?.refHint) setWatchRef(first.refHint);
    else setWatchRef("");
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  }

  function addPartLine(partId: string) {
    const p = findPart(partId);
    if (!p) return;
    setLines((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        description: `${p.name} (${p.sku})`,
        amount: String(p.unitPrice),
      },
    ]);
    setPartPick("");
  }

  function validateBeforeOtp(): boolean {
    setError(null);
    if (customerType === "B2B") {
      if (!company.trim()) {
        setError("B2B: company / legal name is required to create the customer.");
        return false;
      }
      if (!isValidGstFormat(gst)) {
        setError("B2B: enter a valid 15-character GSTIN.");
        return false;
      }
      if (!isValidPanFormat(pan)) {
        setError("B2B: enter a valid PAN (e.g. ABCDE1234F).");
        return false;
      }
      if (!customerName.trim() || !phone.trim()) {
        setError("B2B: contact person name and phone are required for the customer record.");
        return false;
      }
    }
    if (!watchBrand || !watchModel.trim()) {
      setError("Choose a watch brand and model from the catalog.");
      return false;
    }
    const parsed = lines
      .map((l) => ({
        description: l.description.trim(),
        amount: Number.parseFloat(l.amount),
      }))
      .filter((l) => l.description && !Number.isNaN(l.amount) && l.amount >= 0);
    if (parsed.length === 0) {
      setError("Add at least one service line (or pick a part from the catalog).");
      return false;
    }
    return true;
  }

  function handlePrepareComplete(e: React.FormEvent) {
    e.preventDefault();
    if (awaitingOtp) return;
    if (!validateBeforeOtp()) return;
    const code = generateDemoOtp();
    setAwaitingOtp(code);
    setOtpInput("");
    setOtpError(null);
  }

  function handleVerifyOtp() {
    setOtpError(null);
    if (!awaitingOtp) return;
    if (otpInput.trim() !== awaitingOtp) {
      setOtpError("Incorrect OTP. No changes were saved. Enter the code shown above.");
      return;
    }
    setCompletedRef(nextQuickBillRef());
    setAwaitingOtp(null);
    setOtpInput("");
  }

  function cancelOtp() {
    setAwaitingOtp(null);
    setOtpInput("");
    setOtpError(null);
  }

  function regenerateOtp() {
    if (!validateBeforeOtp()) {
      setAwaitingOtp(null);
      return;
    }
    setAwaitingOtp(generateDemoOtp());
    setOtpInput("");
    setOtpError(null);
  }

  const total = lines.reduce((sum, l) => {
    const n = Number.parseFloat(l.amount);
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);

  function resetForm() {
    setCustomerType("B2C");
    setCustomerName("");
    setPhone("");
    setEmail("");
    setCompany("");
    setGst("");
    setPan("");
    const b0 = watchBrands()[0] ?? "";
    syncModelForBrand(b0);
    setLines([emptyLine()]);
    setPartPick("");
    setTechnicianId(SEED_TECHNICIANS[0]?.id ?? "");
    setPaymentMode("Cash");
    setNotes("");
    setError(null);
    setCompletedRef(null);
    setAwaitingOtp(null);
    setOtpInput("");
    setOtpError(null);
  }

  if (completedRef) {
    return (
      <div>
        <ServiceBreadcrumb current="Quick bill" />
        <Card title="Quick bill completed" subtitle="Counter sale — no HO workflow">
          <p className="text-sm text-stone-600">
            Reference <span className="font-mono font-semibold text-zimson-900">{completedRef}</span>{" "}
            (demo only; not saved to a server).
          </p>
          <p className="mt-2 text-sm text-stone-600">
            Total billed:{" "}
            <span className="font-semibold text-stone-900">
              {total.toLocaleString(undefined, { style: "currency", currency: "INR" })}
            </span>{" "}
            · {paymentMode}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={resetForm}
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
        </Card>
      </div>
    );
  }

  return (
    <div>
      <ServiceBreadcrumb current="Quick bill" />
      <PageHeader
        title="Quick bill"
        description="B2C: customer fields are optional. B2B: register the customer with mandatory GSTIN and PAN, then verify with OTP before the bill is finalized."
      />

      <form onSubmit={handlePrepareComplete} className="space-y-8">
        <Card
          title="Customer"
          subtitle={
            customerType === "B2B"
              ? "Business — customer master with GST & PAN (mandatory)"
              : "Retail — details optional for walk-in quick sale"
          }
        >
          <div className="mb-4 flex gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="qb-cust"
                checked={customerType === "B2C"}
                onChange={() => {
                  setCustomerType("B2C");
                  setError(null);
                }}
                className="text-zimson-600 focus:ring-zimson-500"
              />
              B2C
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="qb-cust"
                checked={customerType === "B2B"}
                onChange={() => {
                  setCustomerType("B2B");
                  setError(null);
                }}
                className="text-zimson-600 focus:ring-zimson-500"
              />
              B2B
            </label>
          </div>

          {customerType === "B2B" ? (
            <p className="mb-4 rounded-xl border border-zimson-200 bg-zimson-50/80 px-3 py-2 text-xs text-stone-700">
              Create / attach a <strong>business customer</strong>: company, GSTIN, PAN, and primary
              contact are required before completing the bill.
            </p>
          ) : (
            <p className="mb-4 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
              For B2C, name and phone are <strong>optional</strong>. Leave blank for anonymous counter
              sales if your policy allows it.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {customerType === "B2B" ? (
              <div className="sm:col-span-2">
                <label htmlFor="qb-company" className="text-xs font-medium text-stone-600">
                  Company / legal name *
                </label>
                <input
                  id="qb-company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className={inputClass}
                  placeholder="Registered business name"
                />
              </div>
            ) : null}
            {customerType === "B2B" ? (
              <>
                <div>
                  <label htmlFor="qb-gst" className="text-xs font-medium text-stone-600">
                    GSTIN *
                  </label>
                  <input
                    id="qb-gst"
                    value={gst}
                    onChange={(e) => setGst(e.target.value.toUpperCase())}
                    className={inputClass}
                    placeholder="15-character GSTIN"
                    maxLength={15}
                  />
                </div>
                <div>
                  <label htmlFor="qb-pan" className="text-xs font-medium text-stone-600">
                    PAN *
                  </label>
                  <input
                    id="qb-pan"
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    className={inputClass}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                  />
                </div>
              </>
            ) : null}
            <div className="sm:col-span-2">
              <label htmlFor="qb-name" className="text-xs font-medium text-stone-600">
                {customerType === "B2B" ? "Contact person *" : "Customer name (optional)"}
              </label>
              <input
                id="qb-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className={inputClass}
                placeholder={customerType === "B2B" ? "Name on account" : "Walk-in — optional"}
              />
            </div>
            <div>
              <label htmlFor="qb-phone" className="text-xs font-medium text-stone-600">
                {customerType === "B2B" ? "Contact phone *" : "Phone (optional)"}
              </label>
              <input
                id="qb-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="+91 …"
              />
            </div>
            <div>
              <label htmlFor="qb-email" className="text-xs font-medium text-stone-600">
                Email (optional)
              </label>
              <input
                id="qb-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="optional"
              />
            </div>
          </div>
        </Card>

        <Card title="Watch (catalog)" subtitle="Choose from test data">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="qb-brand" className="text-xs font-medium text-stone-600">
                Brand *
              </label>
              <select
                id="qb-brand"
                value={watchBrand}
                onChange={(e) => syncModelForBrand(e.target.value)}
                className={inputClass}
              >
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="qb-model" className="text-xs font-medium text-stone-600">
                Model *
              </label>
              <select
                id="qb-model"
                value={watchModel}
                onChange={(e) => {
                  setWatchModel(e.target.value);
                  const m = models.find((x) => x.model === e.target.value);
                  if (m?.refHint) setWatchRef(m.refHint);
                }}
                className={inputClass}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.model}>
                    {m.model}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="qb-ref" className="text-xs font-medium text-stone-600">
                Serial / ref (optional)
              </label>
              <input
                id="qb-ref"
                value={watchRef}
                onChange={(e) => setWatchRef(e.target.value)}
                className={inputClass}
                placeholder="Unit serial or reference"
              />
            </div>
          </div>
        </Card>

        <Card
          title="Service lines"
          subtitle="Manual lines or add from parts catalog"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={partPick}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) addPartLine(v);
                }}
                className="rounded-lg border border-zimson-400 bg-white px-2 py-1.5 text-xs font-semibold text-zimson-900 shadow-sm"
                aria-label="Add part from catalog"
              >
                <option value="">+ Part from catalog…</option>
                {SEED_PARTS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — ₹{p.unitPrice}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addLine}
                className="rounded-lg border border-zimson-400 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 shadow-sm hover:bg-zimson-50"
              >
                Empty line
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {lines.map((line, index) => (
              <div
                key={line.id}
                className="flex flex-col gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-3 sm:flex-row sm:items-end"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-stone-600">Description</span>
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(line.id, { description: e.target.value })}
                    className={inputClass}
                    placeholder={`Line ${index + 1}`}
                  />
                </div>
                <div className="w-full sm:w-36">
                  <span className="text-xs font-medium text-stone-600">Amount (INR)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={line.amount}
                    onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  disabled={lines.length <= 1}
                  className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <p className="mt-4 text-right text-sm font-semibold text-stone-900">
            Total: {total.toLocaleString(undefined, { style: "currency", currency: "INR" })}
          </p>
        </Card>

        <Card title="Assignment & payment">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="qb-tech" className="text-xs font-medium text-stone-600">
                Technician
              </label>
              <select
                id="qb-tech"
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value)}
                className={inputClass}
              >
                {SEED_TECHNICIANS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.grade}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="qb-pay" className="text-xs font-medium text-stone-600">
                Payment mode
              </label>
              <select
                id="qb-pay"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as typeof paymentMode)}
                className={inputClass}
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="UPI">UPI</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="qb-notes" className="text-xs font-medium text-stone-600">
                Notes
              </label>
              <textarea
                id="qb-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
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

        {!awaitingOtp ? (
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Send OTP &amp; review
            </button>
            <Link
              to="/service"
              className="inline-flex items-center rounded-xl border border-zimson-400 bg-white px-5 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Cancel
            </Link>
          </div>
        ) : null}
      </form>

      {awaitingOtp ? (
        <div className="mt-8 space-y-4">
          <DemoOtpGate
            title="Verify quick bill"
            issuedCode={awaitingOtp}
            value={otpInput}
            onChange={setOtpInput}
            error={otpError}
            onVerify={handleVerifyOtp}
            onRegenerate={regenerateOtp}
          />
          <button
            type="button"
            onClick={cancelOtp}
            className="text-sm font-medium text-stone-600 underline decoration-zimson-300 underline-offset-2 hover:text-stone-900"
          >
            Cancel verification (edit form)
          </button>
        </div>
      ) : null}
    </div>
  );
}
