import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DemoOtpGate } from "../../components/service/DemoOtpGate";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { generateDemoOtp } from "../../data/serviceSeed";
import { jobVisibleToStoreUser } from "../../lib/srfAccess";
import { ADVANCE_CASH_DENOMS, type AdvancePaymentDetails } from "../../lib/paymentModes";
import { printStoreServiceInvoice } from "../../lib/serviceDocuments";

type AdditionalChargeLine = {
  id: string;
  lineType: "charge" | "spare";
  description: string;
  spareId: string;
  qty: string;
  amount: string;
};

export function StoreBillingPage() {
  const { user } = useAuth();
  const { activeSpares } = useSpares();
  const { jobs, closeWithInvoice } = useSrfJobs();
  const [screenMode, setScreenMode] = useState<"select" | "invoice">("select");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [billingRefInput, setBillingRefInput] = useState("");
  const [scanSrfInput, setScanSrfInput] = useState("");
  const [billingSelectedId, setBillingSelectedId] = useState("");
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [paidAmountInput, setPaidAmountInput] = useState("");
  const [hoSparesBillRef, setHoSparesBillRef] = useState("");
  const [storeBillRef, setStoreBillRef] = useState("");
  const [additionalChargeLines, setAdditionalChargeLines] = useState<AdditionalChargeLine[]>([
    { id: `${Date.now()}-charge`, lineType: "charge", description: "", spareId: "", qty: "1", amount: "" },
  ]);
  const [issuedOtpByJob, setIssuedOtpByJob] = useState<Record<string, string>>({});
  const [otpInputByJob, setOtpInputByJob] = useState<Record<string, string>>({});
  const [otpErrorByJob, setOtpErrorByJob] = useState<Record<string, string>>({});
  const [otpModalJobId, setOtpModalJobId] = useState<string | null>(null);

  const receivedAtStore = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => j.status === "received_at_store" && jobVisibleToStoreUser(j, user));
  }, [jobs, user]);

  const filteredInventory = useMemo(() => {
    const q = billingRefInput.trim().toLowerCase();
    if (!q) return receivedAtStore;
    return receivedAtStore.filter((j) => j.reference.toLowerCase().includes(q));
  }, [receivedAtStore, billingRefInput]);

  const billingJob = useMemo(() => {
    if (!billingSelectedId) return null;
    return receivedAtStore.find((j) => j.id === billingSelectedId) ?? null;
  }, [receivedAtStore, billingSelectedId]);

  const isRejectedNoRepairFlow = billingJob?.customerReestimateResponse === "rejected";
  function getSpareUnitPrice(spareId: string): number {
    const spare = activeSpares.find((s) => s.id === spareId);
    return Number(spare?.sellingPriceInr ?? spare?.mrpInr ?? 0);
  }

  function getLineAmount(line: AdditionalChargeLine): number {
    if (line.lineType === "spare") {
      const unit = getSpareUnitPrice(line.spareId);
      const qty = Number.parseFloat(line.qty);
      if (!Number.isFinite(unit) || unit <= 0) return 0;
      if (!Number.isFinite(qty) || qty <= 0) return 0;
      return unit * qty;
    }
    const amt = Number.parseFloat(line.amount);
    return Number.isFinite(amt) && amt > 0 ? amt : 0;
  }

  const additionalChargesTotal = additionalChargeLines.reduce((sum, line) => sum + getLineAmount(line), 0);
  const estimateAmount = Number(billingJob?.estimateTotalInr ?? 0);
  const advanceAmount = Number(billingJob?.advanceInr ?? 0);
  const standardBillingTotal = Math.max(estimateAmount - advanceAmount + additionalChargesTotal, 0);

  function addChargeLine() {
    setAdditionalChargeLines((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        lineType: "charge",
        description: "",
        spareId: "",
        qty: "1",
        amount: "",
      },
    ]);
  }

  function removeChargeLine(id: string) {
    setAdditionalChargeLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.id !== id)));
  }

  function updateChargeLine(id: string, patch: Partial<AdditionalChargeLine>) {
    setAdditionalChargeLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function startCollectionOtp(jobId: string) {
    const code = generateDemoOtp();
    setIssuedOtpByJob((prev) => ({ ...prev, [jobId]: code }));
    setOtpInputByJob((prev) => ({ ...prev, [jobId]: "" }));
    setOtpErrorByJob((prev) => ({ ...prev, [jobId]: "" }));
    setOtpModalJobId(jobId);
    setMessage({ type: "ok", text: "Customer collection OTP generated. Verify OTP before invoicing." });
  }

  function applyScannedSrf(raw: string) {
    const scanned = raw.trim().toUpperCase();
    if (!scanned) return;
    const hit = receivedAtStore.find((j) => j.reference.trim().toUpperCase() === scanned);
    if (!hit) {
      setMessage({ type: "err", text: `Scanned SRF not found in pending list: ${scanned}` });
      return;
    }
    setBillingRefInput(scanned);
    setBillingSelectedId(hit.id);
    setScreenMode("invoice");
    setMessage({ type: "ok", text: `SRF ${hit.reference} selected from barcode scan.` });
  }

  async function closeJob(jobId: string) {
    await closeWithInvoice(jobId, { hoSparesBillRef, storeBillRef });
    setIssuedOtpByJob((prev) => {
      const next = { ...prev };
      delete next[jobId];
      return next;
    });
    setOtpInputByJob((prev) => {
      const next = { ...prev };
      delete next[jobId];
      return next;
    });
    setOtpErrorByJob((prev) => {
      const next = { ...prev };
      delete next[jobId];
      return next;
    });
  }

  async function closeRejectedNoBilling(jobId: string) {
    await closeWithInvoice(jobId, { noBillingHandover: true });
    setIssuedOtpByJob((prev) => {
      const next = { ...prev };
      delete next[jobId];
      return next;
    });
    setOtpInputByJob((prev) => {
      const next = { ...prev };
      delete next[jobId];
      return next;
    });
    setOtpErrorByJob((prev) => {
      const next = { ...prev };
      delete next[jobId];
      return next;
    });
  }

  async function verifyOtpAndClose(jobId: string) {
    const issued = (issuedOtpByJob[jobId] ?? "").trim();
    const entered = (otpInputByJob[jobId] ?? "").trim();
    if (!issued) {
      setOtpErrorByJob((prev) => ({ ...prev, [jobId]: "Generate OTP first." }));
      return;
    }
    if (issued !== entered) {
      setOtpErrorByJob((prev) => ({ ...prev, [jobId]: "Incorrect OTP. Enter the exact code shown above." }));
      return;
    }
    const job = receivedAtStore.find((x) => x.id === jobId);
    if (!job) {
      setOtpErrorByJob((prev) => ({ ...prev, [jobId]: "SRF not found in store inventory." }));
      return;
    }
    const estimateAmount = Number(job.estimateTotalInr ?? 0);
    const advanceAmount = Number(job.advanceInr ?? 0);
    const computedTotal = Math.max(estimateAmount - advanceAmount + additionalChargesTotal, 0);
    const finalAmount = paidAmountInput.trim() ? Number(paidAmountInput) : computedTotal;
    if (!Number.isFinite(finalAmount) || finalAmount < 0) {
      setOtpErrorByJob((prev) => ({ ...prev, [jobId]: "Enter valid paid amount." }));
      return;
    }
    setOtpErrorByJob((prev) => ({ ...prev, [jobId]: "" }));
    try {
      await closeJob(jobId);
      const additionalCharges = additionalChargeLines
        .map((line) => {
          if (line.lineType === "spare") {
            const spare = activeSpares.find((s) => s.id === line.spareId);
            const qty = Number.parseFloat(line.qty);
            return {
              description: spare
                ? `Spare: ${spare.sku} - ${spare.name} x ${Number.isFinite(qty) && qty > 0 ? qty : 0}`
                : "",
              amountInr: getLineAmount(line),
            };
          }
          return { description: line.description.trim(), amountInr: getLineAmount(line) };
        })
        .filter((line) => line.description && Number.isFinite(line.amountInr) && line.amountInr > 0);
      printStoreServiceInvoice(job, {
        paymentMode,
        paidAmountInr: finalAmount,
        otpCode: entered,
        hoSparesBillRef,
        storeBillRef,
        additionalCharges,
      });
      setMessage({ type: "ok", text: "SRF closed and invoice generated." });
      setBillingSelectedId("");
      setBillingRefInput("");
      setPaidAmountInput("");
      setAdditionalChargeLines([
        { id: `${Date.now()}-charge`, lineType: "charge", description: "", spareId: "", qty: "1", amount: "" },
      ]);
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Could not close SRF." });
    }
  }

  if (!user) return null;

  return (
    <div>
      <ServiceBreadcrumb current="Store billing" />
      <PageHeader
        title="Store billing / customer collection"
        description="Select inwarded SRF by reference, verify OTP when customer collects, take payment, and generate invoice."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/service/store-billing-master"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Open billing master
            </Link>
            <Link
              to="/service/store-dispatch"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Back to store dispatch
            </Link>
          </div>
        }
      />

      <Card title="Billing module" subtitle="Pending watches available in store inventory (received from internal outward transfer)">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setScreenMode("select")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              screenMode === "select"
                ? "bg-zimson-600 text-white"
                : "border border-zimson-300 bg-white text-zimson-900 hover:bg-zimson-50"
            }`}
          >
            1. Select SRF
          </button>
          <button
            type="button"
            onClick={() => setScreenMode("invoice")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              screenMode === "invoice"
                ? "bg-zimson-600 text-white"
                : "border border-zimson-300 bg-white text-zimson-900 hover:bg-zimson-50"
            }`}
          >
            2. Invoice Details
          </button>
        </div>

        {screenMode === "select" ? (
          <>
            <div className="mb-3 grid gap-3 md:grid-cols-4">
              <label className="text-sm md:col-span-2">
                SRF reference search
                <input
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  placeholder="Enter SRF reference"
                  value={billingRefInput}
                  onChange={(e) => setBillingRefInput(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Select SRF
                <select
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  value={billingSelectedId}
                  onChange={(e) => {
                    setBillingSelectedId(e.target.value);
                    if (e.target.value) setScreenMode("invoice");
                  }}
                >
                  <option value="">Select...</option>
                  {filteredInventory.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.reference} - {j.customerName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Scan SRF barcode
                <input
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  placeholder="Scan SRF barcode and press Enter"
                  value={scanSrfInput}
                  onChange={(e) => setScanSrfInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    applyScannedSrf(scanSrfInput);
                    setScanSrfInput("");
                  }}
                />
              </label>
              <div className="rounded-xl border border-zimson-200/80 bg-zimson-50/60 px-3 py-2 text-sm">
                <p className="text-xs text-stone-600">Pending in store inventory</p>
                <p className="text-lg font-semibold text-zimson-900">{filteredInventory.length}</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zimson-200 bg-zimson-50/70 text-xs font-semibold uppercase text-stone-600">
                  <tr>
                    <th className="px-3 py-2">SRF</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Watch</th>
                    <th className="px-3 py-2">Estimate</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-stone-500" colSpan={5}>
                        No pending SRFs found for billing.
                      </td>
                    </tr>
                  ) : (
                    filteredInventory.map((j) => (
                      <tr key={j.id} className="border-b border-zimson-100 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{j.reference}</td>
                        <td className="px-3 py-2">{j.customerName}</td>
                        <td className="px-3 py-2">{j.watchBrand} {j.watchModel}</td>
                        <td className="px-3 py-2">INR {Number(j.estimateTotalInr ?? 0).toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setBillingSelectedId(j.id);
                              setScreenMode("invoice");
                            }}
                            className="rounded-lg border border-zimson-300 bg-white px-2 py-1 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                          >
                            Select & continue
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : !billingJob ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Select SRF first from step 1 to continue invoice creation.
          </div>
        ) : (
          <div className="mt-4 space-y-4 rounded-xl border border-zimson-200/80 p-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setScreenMode("select")}
                className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
              >
                Change selected SRF
              </button>
            </div>
            <div className="text-sm text-stone-700">
              <span className="font-mono font-semibold text-zimson-900">{billingJob.reference}</span> ·{" "}
              {billingJob.customerName} · {billingJob.watchBrand} {billingJob.watchModel}
            </div>
            {isRejectedNoRepairFlow ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Customer rejected re-estimate. This watch can be handed over without billing after store inward.
              </div>
            ) : null}
            <div className="rounded-xl bg-zimson-50 p-3 text-sm text-stone-700">
              <p className="font-semibold text-zimson-900">Supervisor used spares</p>
              {billingJob.usedSpares && billingJob.usedSpares.length > 0 ? (
                <div className="mt-2 overflow-x-auto rounded-xl border border-zimson-200/80 bg-white">
                  <table className="min-w-full text-left text-xs">
                    <thead className="border-b border-zimson-200 bg-zimson-50/60 text-stone-600">
                      <tr>
                        <th className="px-3 py-2">Spare</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Unit</th>
                        <th className="px-3 py-2">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingJob.usedSpares.map((x, idx) => (
                        <tr key={`${x.name}-${idx}`} className="border-b border-zimson-100 last:border-0">
                          <td className="px-3 py-2">{x.name}</td>
                          <td className="px-3 py-2">{x.qty}</td>
                          <td className="px-3 py-2">INR {Number(x.unitPriceInr ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2 font-semibold text-zimson-900">INR {Number(x.lineTotalInr ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-1 text-xs text-amber-700">No spares slip submitted yet.</p>
              )}
            </div>
            {!isRejectedNoRepairFlow ? (
              <div className="rounded-xl border border-zimson-200/80 bg-zimson-50/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-zimson-900">Additional line items (labour / service charges)</p>
                  <button
                    type="button"
                    onClick={addChargeLine}
                    className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                  >
                    Add line item
                  </button>
                </div>
                <div className="space-y-2">
                  {additionalChargeLines.map((line) => (
                    <div key={line.id} className="grid gap-2 md:grid-cols-[120px_1fr_130px_130px_76px]">
                      <select
                        className="rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
                        value={line.lineType}
                        onChange={(e) =>
                          updateChargeLine(line.id, {
                            lineType: e.target.value as "charge" | "spare",
                            description: "",
                            spareId: "",
                            qty: "1",
                            amount: "",
                          })
                        }
                      >
                        <option value="charge">Charge</option>
                        <option value="spare">Spare</option>
                      </select>
                      {line.lineType === "spare" ? (
                        <select
                          className="rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
                          value={line.spareId}
                          onChange={(e) => updateChargeLine(line.id, { spareId: e.target.value })}
                        >
                          <option value="">Select spare</option>
                          {activeSpares.map((sp) => (
                            <option key={sp.id} value={sp.id}>
                              {sp.sku} - {sp.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
                          placeholder="Description (e.g. Labour charge)"
                          value={line.description}
                          onChange={(e) => updateChargeLine(line.id, { description: e.target.value })}
                        />
                      )}
                      {line.lineType === "spare" ? (
                        <input
                          className="rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
                          type="number"
                          min={1}
                          step={1}
                          placeholder="Qty"
                          value={line.qty}
                          onChange={(e) => updateChargeLine(line.id, { qty: e.target.value })}
                        />
                      ) : (
                        <input
                          className="rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="Amount"
                          value={line.amount}
                          onChange={(e) => updateChargeLine(line.id, { amount: e.target.value })}
                        />
                      )}
                      <input
                        className="rounded-xl border border-zimson-300 bg-zimson-50 px-3 py-2 text-sm"
                        readOnly
                        value={`INR ${getLineAmount(line).toFixed(2)}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeChargeLine(line.id)}
                        disabled={additionalChargeLines.length <= 1}
                        className="rounded-xl border border-zimson-300 bg-white px-2 py-2 text-xs font-semibold text-zimson-900 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {!isRejectedNoRepairFlow ? (
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <tbody>
                  <tr className="border-b border-zimson-100">
                    <th className="w-56 bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Estimate amount</th>
                    <td className="px-3 py-2 font-semibold text-zimson-900">
                      INR {estimateAmount.toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Advance received</th>
                    <td className="px-3 py-2 font-semibold text-zimson-900">
                      INR {advanceAmount.toFixed(2)}
                    </td>
                  </tr>
                  {advanceAmount > 0 && billingJob?.advancePaymentMode ? (
                    <tr className="border-b border-zimson-100">
                      <th className="bg-zimson-50/70 px-3 py-2 align-top font-semibold text-stone-700">
                        Advance payment (at booking)
                      </th>
                      <td className="px-3 py-2 text-sm text-stone-800">
                        <span className="font-semibold text-zimson-900">{billingJob.advancePaymentMode}</span>
                        {(() => {
                          const det = billingJob.advancePaymentDetails as AdvancePaymentDetails | null | undefined;
                          if (!det) return null;
                          if (billingJob.advancePaymentMode === "Cash" && det.cash) {
                            const c = det.cash;
                            const parts: string[] = [];
                            for (const { key, label } of ADVANCE_CASH_DENOMS) {
                              const q = Number(c[key]);
                              if (Number.isFinite(q) && q > 0) parts.push(`${label.replace(" ×", "")}: ${q}`);
                            }
                            const coins = Number(c.coinsInr);
                            if (Number.isFinite(coins) && coins > 0) parts.push(`Coins: INR ${coins.toFixed(2)}`);
                            return parts.length ? (
                              <span className="mt-1 block text-xs text-stone-600">{parts.join(" · ")}</span>
                            ) : null;
                          }
                          if (det.reference) {
                            return (
                              <span className="mt-1 block text-xs text-stone-600">Ref: {det.reference}</span>
                            );
                          }
                          return null;
                        })()}
                      </td>
                    </tr>
                  ) : null}
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Additional charges</th>
                    <td className="px-3 py-2 font-semibold text-zimson-900">
                      INR {additionalChargesTotal.toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Standard billing total</th>
                    <td className="px-3 py-2 font-semibold text-zimson-900">
                      INR {standardBillingTotal.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-zimson-50/70 px-3 py-2 font-semibold text-stone-700">Final our billing amount</th>
                    <td className="px-3 py-2 font-semibold text-zimson-900">
                      INR {(paidAmountInput.trim()
                        ? Number(paidAmountInput)
                        : standardBillingTotal
                      ).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            ) : null}
            {!isRejectedNoRepairFlow ? (
              <>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                HO bill reference
                <input
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  value={hoSparesBillRef}
                  onChange={(e) => setHoSparesBillRef(e.target.value)}
                  placeholder="HO bill ref"
                />
              </label>
              <label className="text-sm">
                Store bill reference
                <input
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  value={storeBillRef}
                  onChange={(e) => setStoreBillRef(e.target.value)}
                  placeholder="Store bill ref"
                />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                Payment mode
                <select
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </label>
              <label className="text-sm">
                Final our billing amount (INR)
                <input
                  className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  value={paidAmountInput}
                  onChange={(e) => setPaidAmountInput(e.target.value)}
                  placeholder={String(standardBillingTotal)}
                />
              </label>
            </div>
              </>
            ) : null}
            {isRejectedNoRepairFlow ? (
              <button
                type="button"
                onClick={() => {
                  void closeRejectedNoBilling(billingJob.id)
                    .then(() => {
                      setMessage({ type: "ok", text: "Watch handed over and SRF closed without billing (re-estimate rejected)." });
                      setBillingSelectedId("");
                      setBillingRefInput("");
                    })
                    .catch((e) => {
                      setMessage({ type: "err", text: e instanceof Error ? e.message : "Could not complete no-billing handover." });
                    });
                }}
                className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
              >
                Handover to customer without billing
              </button>
            ) : !issuedOtpByJob[billingJob.id] ? (
              <button
                type="button"
                onClick={() => startCollectionOtp(billingJob.id)}
                disabled={!billingJob.usedSpares || billingJob.usedSpares.length === 0}
                className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Customer present — generate OTP
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setOtpModalJobId(billingJob.id)}
                className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
              >
                Open OTP verification
              </button>
            )}
          </div>
        )}

        {message ? (
          <p
            className={
              message.type === "ok"
                ? "mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200"
                : "mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200"
            }
          >
            {message.text}
          </p>
        ) : null}
      </Card>

      {otpModalJobId ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <DemoOtpGate
              title="Customer collection OTP verification"
              subtitle="After OTP verify, payment is recorded and invoice is generated."
              issuedCode={issuedOtpByJob[otpModalJobId]}
              value={otpInputByJob[otpModalJobId] ?? ""}
              onChange={(value) => setOtpInputByJob((prev) => ({ ...prev, [otpModalJobId]: value }))}
              error={otpErrorByJob[otpModalJobId] || null}
              onVerify={() => void verifyOtpAndClose(otpModalJobId)}
              onRegenerate={() => startCollectionOtp(otpModalJobId)}
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setOtpModalJobId(null)}
                className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
