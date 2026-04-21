import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DemoOtpGate } from "../../components/service/DemoOtpGate";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { Stepper } from "../../components/ui/Stepper";
import { useAuth } from "../../context/AuthContext";
import { useBrands } from "../../context/BrandsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import {
  findPart,
  generateDemoOtp,
  isValidGstFormat,
  isValidPanFormat,
  nextSrfRef,
  SEED_PARTS,
  watchModelsForBrand,
} from "../../data/serviceSeed";

const steps = ["Customer", "Watch", "Estimate", "Review"] as const;

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

export function SrfBookingPage() {
  const { user } = useAuth();
  const { createJob } = useSrfJobs();
  const { brands: catalogBrands } = useBrands();
  const brandNames = useMemo(() => catalogBrands.map((b) => b.name), [catalogBrands]);
  const [step, setStep] = useState(0);
  const [customerType, setCustomerType] = useState<"B2C" | "B2B">("B2C");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [gst, setGst] = useState("");
  const [pan, setPan] = useState("");

  const [watchBrand, setWatchBrand] = useState("");
  const models = watchModelsForBrand(watchBrand);
  const [watchModel, setWatchModel] = useState<string>(models[0]?.model ?? "");
  const [serial, setSerial] = useState("");
  const [condition, setCondition] = useState("");
  const [accessories, setAccessories] = useState("");

  const [complaint, setComplaint] = useState("");
  const [estimatedLabor, setEstimatedLabor] = useState("");
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);
  const [partsExtra, setPartsExtra] = useState("");
  const [estimateNotes, setEstimateNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [srfRef, setSrfRef] = useState<string | null>(null);

  const [awaitingOtp, setAwaitingOtp] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);

  const laborNum = Number.parseFloat(estimatedLabor) || 0;
  const catalogPartsTotal = selectedPartIds.reduce((sum, id) => {
    const p = findPart(id);
    return sum + (p?.unitPrice ?? 0);
  }, 0);
  const extraPartsNum = Number.parseFloat(partsExtra) || 0;
  const estimateTotal = laborNum + catalogPartsTotal + extraPartsNum;

  const syncModelForBrand = useCallback((nextBrand: string) => {
    setWatchBrand(nextBrand);
    const ms = watchModelsForBrand(nextBrand);
    const first = ms[0];
    setWatchModel(first?.model ?? "");
    if (first?.refHint) setSerial(first.refHint);
    else setSerial("");
  }, []);

  useEffect(() => {
    if (brandNames.length === 0) return;
    if (!watchBrand || !brandNames.includes(watchBrand)) {
      syncModelForBrand(brandNames[0]!);
    }
  }, [brandNames, watchBrand, syncModelForBrand]);

  function togglePart(id: string) {
    setSelectedPartIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function validateCustomer() {
    if (!customerName.trim() || !phone.trim()) {
      setError("Customer name and phone are required for every SRF (B2C or B2B).");
      return false;
    }
    if (customerType === "B2B") {
      if (!company.trim()) {
        setError("B2B: company name is required.");
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
    }
    return true;
  }

  function validateWatch() {
    if (!watchBrand || !watchModel.trim()) {
      setError("Select brand and model from the catalog.");
      return false;
    }
    return true;
  }

  function validateEstimate() {
    if (!complaint.trim()) {
      setError("Describe the issue / complaint.");
      return false;
    }
    return true;
  }

  function goNext() {
    setError(null);
    if (step === 0 && !validateCustomer()) return;
    if (step === 1 && !validateWatch()) return;
    if (step === 2 && !validateEstimate()) return;
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function goBack() {
    setError(null);
    setAwaitingOtp(null);
    setOtpInput("");
    setOtpError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function beginCreateSrf() {
    setError(null);
    setOtpError(null);
    if (!validateCustomer() || !validateWatch() || !validateEstimate()) {
      setStep(0);
      return;
    }
    setAwaitingOtp(generateDemoOtp());
    setOtpInput("");
  }

  function handleVerifyOtp() {
    setOtpError(null);
    if (!awaitingOtp) return;
    if (otpInput.trim() !== awaitingOtp) {
      setOtpError("Incorrect OTP. SRF was not created. Enter the code shown above.");
      return;
    }
    const ref = nextSrfRef();
    setSrfRef(ref);
    const regionId = user?.regionId ?? "r1";
    const storeId = user?.storeId ?? "s1";
    createJob({
      reference: ref,
      regionId,
      storeId,
      customerName,
      phone,
      customerKind: customerType,
      company: customerType === "B2B" ? company : undefined,
      watchBrand,
      watchModel,
      serial,
      complaint,
      estimateTotalInr: estimateTotal,
      selectedPartIds,
    });
    setAwaitingOtp(null);
    setOtpInput("");
  }

  function cancelSrfOtp() {
    setAwaitingOtp(null);
    setOtpInput("");
    setOtpError(null);
  }

  function regenerateSrfOtp() {
    setOtpError(null);
    if (!validateCustomer() || !validateWatch() || !validateEstimate()) {
      setAwaitingOtp(null);
      return;
    }
    setAwaitingOtp(generateDemoOtp());
    setOtpInput("");
  }

  function resetAll() {
    setStep(0);
    setCustomerType("B2C");
    setCustomerName("");
    setPhone("");
    setEmail("");
    setCompany("");
    setGst("");
    setPan("");
    const b0 = brandNames[0] ?? "";
    if (b0) syncModelForBrand(b0);
    else {
      setWatchBrand("");
      setWatchModel("");
      setSerial("");
    }
    setCondition("");
    setAccessories("");
    setComplaint("");
    setEstimatedLabor("");
    setSelectedPartIds([]);
    setPartsExtra("");
    setEstimateNotes("");
    setError(null);
    setSrfRef(null);
    setAwaitingOtp(null);
    setOtpInput("");
    setOtpError(null);
  }

  if (srfRef) {
    return (
      <div>
        <ServiceBreadcrumb current="SRF booking" />
        <Card title="Service request booked" subtitle="OTP verified — saved to store queue (demo)">
          <p className="text-sm text-stone-600">
            SRF reference{" "}
            <span className="font-mono text-base font-bold text-zimson-900">{srfRef}</span>
          </p>
          <p className="mt-2 text-sm text-stone-600">
            Status: <span className="font-medium text-stone-800">At store</span> — end of day, bundle on a
            DC from{" "}
            <Link className="font-medium text-zimson-800 underline" to="/service/store-dispatch">
              Send to service centre
            </Link>
            .
          </p>
          <ul className="mt-4 space-y-1 text-sm text-stone-600">
            <li>
              <span className="text-stone-500">Customer:</span> {customerName} · {phone}
            </li>
            <li>
              <span className="text-stone-500">Watch:</span> {watchBrand} {watchModel}
              {serial ? ` · ${serial}` : ""}
            </li>
            <li>
              <span className="text-stone-500">Indicative total:</span>{" "}
              {estimateTotal.toLocaleString(undefined, { style: "currency", currency: "INR" })}
            </li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={resetAll}
              className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Book another SRF
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
      <ServiceBreadcrumb current="SRF booking" />
      <PageHeader
        title="SRF booking"
        description="Customer record is mandatory for both B2C and B2B. B2B also requires GSTIN and PAN. OTP must match before the SRF is created."
      />

      <div className="mb-8 rounded-2xl border border-zimson-200/80 bg-white/90 p-4 shadow-sm">
        <Stepper steps={[...steps]} activeIndex={step} />
      </div>

      {error ? (
        <p className="mb-6 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      ) : null}

      {step === 0 ? (
        <Card title="Step 1 — Customer" subtitle="Create customer on file (required)">
          <p className="mb-4 rounded-xl border border-zimson-200 bg-zimson-50/70 px-3 py-2 text-xs text-stone-700">
            <strong>B2C &amp; B2B:</strong> name and phone are mandatory. For B2B, also register company,
            GSTIN, and PAN.
          </p>
          <div className="mb-4 flex gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="srf-cust"
                checked={customerType === "B2C"}
                onChange={() => setCustomerType("B2C")}
                className="text-zimson-600 focus:ring-zimson-500"
              />
              B2C
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="srf-cust"
                checked={customerType === "B2B"}
                onChange={() => setCustomerType("B2B")}
                className="text-zimson-600 focus:ring-zimson-500"
              />
              B2B
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Full name *</label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className={inputClass}
                placeholder="Customer name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Phone *</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="+91 …"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Email (optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="For estimate link"
              />
            </div>
            {customerType === "B2B" ? (
              <>
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
                    placeholder="15 characters"
                    maxLength={15}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-600">PAN *</label>
                  <input
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    className={inputClass}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                  />
                </div>
              </>
            ) : null}
          </div>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card title="Step 2 — Watch" subtitle="Brand from master data; models from demo catalog for that brand">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-stone-600">Brand *</label>
              <select
                value={watchBrand}
                onChange={(e) => syncModelForBrand(e.target.value)}
                className={inputClass}
              >
                {brandNames.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Model *</label>
              <select
                value={watchModel}
                onChange={(e) => {
                  setWatchModel(e.target.value);
                  const m = models.find((x) => x.model === e.target.value);
                  if (m?.refHint) setSerial(m.refHint);
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
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Serial / reference</label>
              <input
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Visual condition</label>
              <textarea
                rows={2}
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className={inputClass}
                placeholder="Scratches, dial, crystal, crown…"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Box / papers / accessories</label>
              <input
                value={accessories}
                onChange={(e) => setAccessories(e.target.value)}
                className={inputClass}
                placeholder="e.g. Box only"
              />
            </div>
            <div className="sm:col-span-2 rounded-xl border border-dashed border-zimson-300 bg-zimson-50/50 px-4 py-6 text-center text-sm text-stone-500">
              Photo upload will attach here (camera / files) when media is wired to storage.
            </div>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card title="Step 3 — Initial estimate" subtitle="Labour + spare parts">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Complaint / work requested *</label>
              <textarea
                rows={3}
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                className={inputClass}
                placeholder="Customer complaint and expected work"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Indicative labour (INR)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={estimatedLabor}
                onChange={(e) => setEstimatedLabor(e.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Extra parts allowance (INR)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={partsExtra}
                onChange={(e) => setPartsExtra(e.target.value)}
                className={inputClass}
                placeholder="On top of catalog picks"
              />
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-stone-600">Parts from catalog (test data)</p>
              <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-zimson-200/80 bg-zimson-50/40 p-3">
                {SEED_PARTS.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-white/80 px-3 py-2 text-sm ring-1 ring-zimson-100 hover:bg-white">
                      <input
                        type="checkbox"
                        checked={selectedPartIds.includes(p.id)}
                        onChange={() => togglePart(p.id)}
                        className="mt-1 rounded border-zimson-300 text-zimson-600 focus:ring-zimson-500"
                      />
                      <span>
                        <span className="font-medium text-stone-900">{p.name}</span>
                        <span className="block text-xs text-stone-500">
                          {p.sku} ·{" "}
                          {p.unitPrice.toLocaleString(undefined, {
                            style: "currency",
                            currency: "INR",
                          })}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-stone-500">
                Catalog subtotal:{" "}
                {catalogPartsTotal.toLocaleString(undefined, { style: "currency", currency: "INR" })}
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-stone-600">Estimator notes</label>
              <textarea
                rows={2}
                value={estimateNotes}
                onChange={(e) => setEstimateNotes(e.target.value)}
                className={inputClass}
                placeholder="Internal notes for supervisor"
              />
            </div>
            <div className="sm:col-span-2 rounded-xl bg-zimson-100/60 px-4 py-3 text-sm text-stone-800">
              <span className="font-semibold">Indicative total:</span>{" "}
              {estimateTotal.toLocaleString(undefined, { style: "currency", currency: "INR" })}
            </div>
          </div>
        </Card>
      ) : null}

      {step === 3 && !awaitingOtp ? (
        <Card title="Step 4 — Review" subtitle="Then OTP — SRF is only created after correct code">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">Customer</dt>
              <dd className="mt-0.5 font-medium text-stone-900">
                {customerName} · {phone}
                {email ? ` · ${email}` : ""}
                {customerType === "B2B" ? ` · ${company} · GST ${gst} · PAN ${pan}` : ""}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">Watch</dt>
              <dd className="mt-0.5 text-stone-800">
                {watchBrand} {watchModel}
                {serial ? ` · ${serial}` : ""}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">Complaint</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-stone-800">{complaint}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">Parts (catalog)</dt>
              <dd className="mt-0.5 text-stone-800">
                {selectedPartIds.length === 0 ? (
                  <span className="text-stone-500">None selected</span>
                ) : (
                  <ul className="list-inside list-disc">
                    {selectedPartIds.map((id) => {
                      const p = findPart(id);
                      return (
                        <li key={id}>
                          {p?.name ?? id} (
                          {p?.unitPrice.toLocaleString(undefined, {
                            style: "currency",
                            currency: "INR",
                          })}
                          )
                        </li>
                      );
                    })}
                  </ul>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">Estimate</dt>
              <dd className="mt-0.5 font-semibold text-zimson-900">
                {estimateTotal.toLocaleString(undefined, { style: "currency", currency: "INR" })}
              </dd>
            </div>
          </dl>
        </Card>
      ) : null}

      {step === 3 && awaitingOtp ? (
        <DemoOtpGate
          title="Verify to create SRF"
          issuedCode={awaitingOtp}
          value={otpInput}
          onChange={setOtpInput}
          error={otpError}
          onVerify={handleVerifyOtp}
          onRegenerate={regenerateSrfOtp}
        />
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        {step > 0 && !awaitingOtp ? (
          <button
            type="button"
            onClick={goBack}
            className="rounded-xl border border-zimson-400 bg-white px-5 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Back
          </button>
        ) : null}
        {awaitingOtp ? (
          <button
            type="button"
            onClick={cancelSrfOtp}
            className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50"
          >
            Cancel OTP (edit review)
          </button>
        ) : null}
        {!awaitingOtp && step < steps.length - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
          >
            Continue
          </button>
        ) : null}
        {!awaitingOtp && step === steps.length - 1 ? (
          <button
            type="button"
            onClick={beginCreateSrf}
            className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
          >
            Send OTP to finalize SRF
          </button>
        ) : null}
        {!awaitingOtp ? (
          <Link
            to="/service"
            className="inline-flex items-center rounded-xl px-5 py-2.5 text-sm font-medium text-stone-600 underline decoration-zimson-300 underline-offset-2 hover:text-stone-900"
          >
            Cancel
          </Link>
        ) : null}
      </div>
    </div>
  );
}
