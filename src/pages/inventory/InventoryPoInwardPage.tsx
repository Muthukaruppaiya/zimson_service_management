import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import { buildGrnDocument, openPrintDocument } from "../../lib/inventoryDocuments";
import type { PurchaseOrder } from "../../types/purchaseOrder";
import type { SparePart } from "../../types/spare";

// ── Types ─────────────────────────────────────────────────────────────────────


type LineState = {
  qty: string;
  costPrice: string;
  gstRate: string; // % e.g. "18"
};

// ── Styles ─────────────────────────────────────────────────────────────────────

const inputCls =
  "mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/30 transition-colors";
const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-stone-500";

// ── HSN → default GST rate lookup ─────────────────────────────────────────────

const HSN_GST: Record<string, number> = {
  "9101": 18, "9102": 18, "9103": 18, "9104": 18, // Watches
  "9108": 18, "9109": 18, "9110": 18, "9111": 18, "9112": 18, "9113": 18, "9114": 18, // Watch parts
  "8506": 18, // Primary batteries
  "8544": 18, // Cables/wires
  "3402": 18, // Cleaning agents
  "5911": 12, // Technical textile / cleaning cloths
  "3824": 18, // Chemical preparations
  "8481": 18, // Taps, cocks, valves
};

function gstRateFromHsn(hsn: string | null | undefined): number {
  if (!hsn) return 18;
  const h = hsn.replace(/\s/g, "");
  return HSN_GST[h.slice(0, 6)] ?? HSN_GST[h.slice(0, 4)] ?? 18;
}

// ── Tax computation ───────────────────────────────────────────────────────────

/** Returns { taxable, taxAmount, total, cgst, sgst, igst } */
function computeTax(costPrice: number, qty: number, gstRate: number, isInterstate: boolean) {
  const taxable = costPrice * qty;
  const taxAmount = +(taxable * gstRate / 100).toFixed(2);
  const total = +(taxable + taxAmount).toFixed(2);
  const half = +(taxAmount / 2).toFixed(2);
  return {
    taxable: +taxable.toFixed(2),
    taxAmount,
    total,
    cgst: isInterstate ? 0 : half,
    sgst: isInterstate ? 0 : half,
    igst: isInterstate ? taxAmount : 0,
  };
}

// ── Success Modal ─────────────────────────────────────────────────────────────

function GrnSuccessModal({ grnNumber, movedQty, onClose }: {
  grnNumber: string; movedQty: number; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="w-full max-w-sm bg-white shadow-2xl overflow-hidden">
        <div className="bg-rlx-green px-6 py-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/30 bg-white/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" className="h-7 w-7">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-base font-semibold uppercase tracking-[0.15em] text-white">GRN Posted</h2>
        </div>
        <div className="px-6 py-5 text-center space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">GRN Number</p>
          <p className="font-mono text-2xl font-bold text-rlx-green">{grnNumber}</p>
          <p className="text-sm text-stone-500 mt-2">{movedQty} unit(s) moved to HO stock.</p>
        </div>
        <div className="border-t border-rlx-rule bg-rlx-bg px-6 py-4 flex justify-center">
          <button type="button" onClick={onClose}
            className="bg-rlx-green px-8 py-2 text-sm font-semibold text-white hover:bg-rlx-green/90 transition">
            Post Another GRN
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-rlx-rule bg-rlx-green px-5 py-4">
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[11px] text-white/55">{subtitle}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function InventoryPoInwardPage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const navigate = useNavigate();

  const isHo =
    user?.role === "super_admin" || user?.role === "admin" ||
    user?.role === "ho_manager" || user?.role === "ho_purchase";

  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [mode, setMode] = useState<"WITH_BILL" | "WITHOUT_BILL">("WITH_BILL");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineState, setLineState] = useState<Record<string, LineState>>({});
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [successData, setSuccessData] = useState<{ grnNumber: string; movedQty: number } | null>(null);

  const spareById = useMemo(() => {
    const m = new Map<string, SparePart>();
    for (const s of spares) m.set(s.id, s);
    return m;
  }, [spares]);

  const selectedPo = useMemo(() => pos.find((p) => p.id === selectedPoId) ?? null, [pos, selectedPoId]);

  // Default to intrastate (CGST+SGST split). When supplier taxPersonType is available
  // in PO data it can be derived here. For now all GRNs use intrastate rates.
  const isInterstate = false;

  const loadData = useCallback(async () => {
    try {
      const poData = await apiJson<{ pos: PurchaseOrder[] }>("/api/inventory/pos");
      setPos(poData.pos);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not load data."); }
  }, []);

  useEffect(() => { if (isHo) void loadData(); }, [isHo, loadData]);

  // Initialise line states when PO changes
  useEffect(() => {
    if (!selectedPo) { setLineState({}); return; }
    const next: Record<string, LineState> = {};
    for (const i of selectedPo.items) {
      const pending = Math.max(0, i.qtyOrdered - i.receivedQty);
      const spare = spareById.get(i.spareId);
      next[i.id] = {
        qty: pending > 0 ? String(pending) : "0",
        costPrice: spare?.costPriceInr ? String(spare.costPriceInr) : "0",
        gstRate: String(gstRateFromHsn(spare?.hsn)),
      };
    }
    setLineState(next);
  }, [selectedPo, spareById]);

  function setLine(poItemId: string, patch: Partial<LineState>) {
    setLineState((prev) => ({ ...prev, [poItemId]: { ...prev[poItemId]!, ...patch } }));
  }

  // Totals computation
  const totals = useMemo(() => {
    if (!selectedPo) return null;
    let subtotal = 0, totalTax = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    for (const i of selectedPo.items) {
      const ls = lineState[i.id];
      if (!ls) continue;
      const qty = Number(ls.qty) || 0;
      if (qty <= 0) continue;
      const t = computeTax(Number(ls.costPrice) || 0, qty, Number(ls.gstRate) || 18, isInterstate);
      subtotal += t.taxable;
      totalTax += t.taxAmount;
      totalCgst += t.cgst;
      totalSgst += t.sgst;
      totalIgst += t.igst;
    }
    return { subtotal: +subtotal.toFixed(2), totalTax: +totalTax.toFixed(2), grand: +(subtotal + totalTax).toFixed(2), totalCgst: +totalCgst.toFixed(2), totalSgst: +totalSgst.toFixed(2), totalIgst: +totalIgst.toFixed(2) };
  }, [selectedPo, lineState, isInterstate]);

  async function createGrn(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!selectedPo) { setErr("Select a PO."); return; }
    const lines = selectedPo.items
      .map((i) => {
        const ls = lineState[i.id];
        const qty = Number(ls?.qty ?? "0");
        const costPrice = Number(ls?.costPrice ?? "0");
        const gstRate = Number(ls?.gstRate ?? "18");
        const pending = Math.max(0, i.qtyOrdered - i.receivedQty);
        const t = computeTax(costPrice, qty, gstRate, isInterstate);
        return { poItemId: i.id, spareId: i.spareId, qtyReceived: qty, costPrice, gstRate, taxAmount: t.taxAmount, pending };
      })
      .filter((i) => i.qtyReceived > 0);
    if (lines.length === 0) { setErr("Enter inward quantity for at least one line."); return; }
    if (lines.some((l) => l.qtyReceived > l.pending)) { setErr("Received qty exceeds pending on one or more lines."); return; }
    if (mode === "WITH_BILL" && !invoiceNumber.trim()) { setErr("Invoice number is required for WITH_BILL mode."); return; }
    setBusy(true);
    try {
      // Use FormData only if file is attached, otherwise use JSON
      let data: { grnNumber: string; movedQty: number; poStatus: string };
      if (invoiceFile) {
        const fd = new FormData();
        fd.append("poId", selectedPo.id);
        fd.append("mode", mode);
        fd.append("invoiceNumber", invoiceNumber.trim());
        fd.append("invoiceDate", invoiceDate);
        fd.append("notes", notes.trim());
        fd.append("items", JSON.stringify(lines.map((l) => ({ poItemId: l.poItemId, spareId: l.spareId, qtyReceived: l.qtyReceived, costPrice: l.costPrice, gstRate: l.gstRate, taxAmount: l.taxAmount }))));
        fd.append("invoiceFile", invoiceFile);
        const resp = await fetch("/api/inventory/grns", { method: "POST", body: fd, credentials: "include" });
        if (!resp.ok) { const j = await resp.json() as { error: string }; throw new Error(j.error); }
        data = await resp.json() as typeof data;
      } else {
        data = await apiJson<typeof data>("/api/inventory/grns", {
          method: "POST",
          json: {
            poId: selectedPo.id, mode,
            invoiceNumber: mode === "WITH_BILL" ? invoiceNumber.trim() : null,
            invoiceDate: mode === "WITH_BILL" && invoiceDate ? invoiceDate : null,
            notes: notes.trim(),
            items: lines.map((l) => ({ poItemId: l.poItemId, spareId: l.spareId, qtyReceived: l.qtyReceived, costPrice: l.costPrice, gstRate: l.gstRate, taxAmount: l.taxAmount })),
          },
        });
      }
      openPrintDocument(`GRN ${data.grnNumber}`, buildGrnDocument({
        grnNumber: data.grnNumber, createdAt: new Date().toISOString(),
        poNumber: selectedPo.poNumber, supplierName: selectedPo.supplierName,
        mode, invoiceNumber: mode === "WITH_BILL" ? invoiceNumber.trim() : null,
        invoiceDate: mode === "WITH_BILL" ? invoiceDate : null, notes: notes.trim(),
        lines: lines.map((l) => ({
          description: spareById.get(l.spareId)?.name ?? l.spareId,
          qtyReceived: l.qtyReceived,
          costPrice: l.costPrice,
          gstRate: l.gstRate,
          taxAmount: l.taxAmount,
        })),
      }));
      setSuccessData({ grnNumber: data.grnNumber, movedQty: data.movedQty });
      setSelectedPoId(""); setInvoiceNumber(""); setInvoiceDate(""); setNotes(""); setLineState({}); setInvoiceFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await loadData();
    } catch (e) { setErr(e instanceof ApiError ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const openPos = pos.filter((p) => p.status === "OPEN" || p.status === "PARTIAL");

  if (!isHo) {
    return (
      <div>
        <InventoryBreadcrumb current="PO Inward / GRN" />
        <PageHeader title="Goods Receipt (GRN)" description="" />
        <div className="border border-rlx-rule bg-white px-6 py-10 text-center text-sm text-stone-400">
          Only HO Manager, HO Purchase, or Admin can post GRN entries.
        </div>
      </div>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb current="PO Inward / GRN" />
      <PageHeader
        title="Goods Receipt (GRN)"
        description="Post physical receipt to HO stock. Cost price and tax are captured here and mapped to inventory."
        actions={
          <div className="flex gap-2">
            <button type="button" onClick={() => navigate("/inventory/grn-history")}
              className="border border-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-rlx-green hover:bg-rlx-green/5 transition">
              GRN History
            </button>
            <button type="button" onClick={() => navigate(-1)}
              className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition">
              ← Back
            </button>
          </div>
        }
      />

      {err && <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div>}

      {/* ── GRN Form ──────────────────────────────────────────────────────── */}
      <div className="mb-6 border border-rlx-rule bg-white shadow-sm">
        <SectionHeader
          title="Create GRN Against PO"
          subtitle="Inward updates HO stock, updates PO receive status, and saves cost price to inventory."
        />
        <form onSubmit={createGrn} className="p-5 space-y-5">

          {/* Row 1: PO + Mode */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Purchase Order *</label>
              <select className={inputCls} value={selectedPoId} onChange={(e) => setSelectedPoId(e.target.value)}>
                <option value="">Select open / partial PO…</option>
                {openPos.map((p) => (
                  <option key={p.id} value={p.id}>{p.poNumber} · {p.supplierName} · {p.status}</option>
                ))}
              </select>
              {openPos.length === 0 && <p className="mt-1 text-[11px] text-stone-400">No open POs. Create POs first.</p>}
            </div>
            <div>
              <label className={labelCls}>Mode *</label>
              <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as "WITH_BILL" | "WITHOUT_BILL")}>
                <option value="WITH_BILL">With Bill (Tax Invoice)</option>
                <option value="WITHOUT_BILL">Without Bill (Fast path ≤ ₹10,000)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Invoice details + file upload */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Invoice Number {mode === "WITH_BILL" ? "*" : "(optional)"}</label>
              <input className={inputCls} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-2601-0001" />
            </div>
            <div>
              <label className={labelCls}>Invoice Date</label>
              <input type="date" className={inputCls} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Upload Vendor Invoice (PDF / Image)</label>
              <div
                onClick={() => fileRef.current?.click()}
                className="mt-1 flex cursor-pointer items-center gap-3 border border-dashed border-rlx-rule bg-stone-50/40 px-3 py-2 hover:border-rlx-green transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 shrink-0 text-stone-400">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-sm text-stone-500 truncate">
                  {invoiceFile ? invoiceFile.name : "Click to attach invoice…"}
                </span>
                {invoiceFile && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); setInvoiceFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                    className="ml-auto shrink-0 text-xs text-red-400 hover:text-red-600">✕</button>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes (optional)</label>
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any remarks about this receipt…" />
          </div>

          {/* Line items table */}
          {selectedPo && (
            <div className="border border-rlx-rule">
              <div className="border-b border-rlx-rule bg-stone-50 px-4 py-2.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  Spare Line Items — enter cost price, verify tax rate, and set qty received
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-rlx-rule bg-stone-50/60 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                      <th className="px-4 py-2.5 text-left">Spare / HSN</th>
                      <th className="px-4 py-2.5 text-center w-20">Ordered</th>
                      <th className="px-4 py-2.5 text-center w-20">Recd</th>
                      <th className="px-4 py-2.5 text-center w-20">Pending</th>
                      <th className="px-4 py-2.5 text-center w-28">Now Inward</th>
                      <th className="px-4 py-2.5 text-center w-32">Cost Price / Unit (₹)</th>
                      <th className="px-4 py-2.5 text-center w-24">GST % (HSN)</th>
                      <th className="px-4 py-2.5 text-right w-28">Taxable</th>
                      <th className="px-4 py-2.5 text-right w-28">Tax Amt</th>
                      <th className="px-4 py-2.5 text-right w-28">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPo.items.map((i) => {
                      const ls = lineState[i.id] ?? { qty: "0", costPrice: "0", gstRate: "18" };
                      const pending = Math.max(0, i.qtyOrdered - i.receivedQty);
                      const qty = Number(ls.qty) || 0;
                      const spare = spareById.get(i.spareId);
                      const t = computeTax(Number(ls.costPrice) || 0, qty, Number(ls.gstRate) || 18, isInterstate);
                      return (
                        <tr key={i.id} className="border-b border-rlx-rule last:border-0 hover:bg-stone-50/30">
                          <td className="px-4 py-3">
                            <p className="font-medium text-stone-800">{spare?.name ?? i.spareId}</p>
                            <p className="text-[11px] text-stone-400 font-mono">{spare?.sku ?? ""} · HSN: {spare?.hsn ?? "—"}</p>
                          </td>
                          <td className="px-4 py-3 text-center text-stone-600">{i.qtyOrdered}</td>
                          <td className="px-4 py-3 text-center text-stone-600">{i.receivedQty}</td>
                          <td className="px-4 py-3 text-center font-semibold text-amber-700">{pending}</td>
                          <td className="px-4 py-3 text-center">
                            <input type="number" min={0} max={pending} step={1}
                              className="w-20 border border-rlx-rule px-2 py-1.5 text-sm text-center outline-none focus:border-rlx-green"
                              value={ls.qty}
                              onChange={(e) => setLine(i.id, { qty: e.target.value })} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input type="number" min={0} step={0.01}
                              className="w-28 border border-rlx-rule px-2 py-1.5 text-sm text-center outline-none focus:border-rlx-green"
                              value={ls.costPrice}
                              onChange={(e) => setLine(i.id, { costPrice: e.target.value })} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <input type="number" min={0} max={100} step={0.5}
                                className="w-16 border border-rlx-rule px-2 py-1.5 text-sm text-center outline-none focus:border-rlx-green"
                                value={ls.gstRate}
                                onChange={(e) => setLine(i.id, { gstRate: e.target.value })} />
                              <span className="text-stone-400 text-xs">%</span>
                            </div>
                            {!isInterstate ? (
                              <p className="text-[10px] text-stone-400 mt-0.5">
                                CGST {Number(ls.gstRate) / 2}% + SGST {Number(ls.gstRate) / 2}%
                              </p>
                            ) : (
                              <p className="text-[10px] text-stone-400 mt-0.5">IGST {ls.gstRate}%</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-stone-700">
                            {qty > 0 ? `₹${t.taxable.toLocaleString("en-IN")}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-amber-700 font-semibold">
                            {qty > 0 ? `₹${t.taxAmount.toLocaleString("en-IN")}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-stone-800">
                            {qty > 0 ? `₹${t.total.toLocaleString("en-IN")}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {totals && (
                    <tfoot>
                      <tr className="border-t-2 border-rlx-rule bg-stone-50">
                        <td colSpan={7} className="px-4 py-3 text-xs text-stone-400">
                          {!isInterstate ? (
                            <span>CGST ₹{totals.totalCgst.toLocaleString("en-IN")} + SGST ₹{totals.totalSgst.toLocaleString("en-IN")}</span>
                          ) : (
                            <span>IGST ₹{totals.totalIgst.toLocaleString("en-IN")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-stone-600">₹{totals.subtotal.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-amber-700">₹{totals.totalTax.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 text-right text-base font-bold text-rlx-green">₹{totals.grand.toLocaleString("en-IN")}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          <div className="border-t border-rlx-rule pt-4">
            <button type="submit" disabled={busy || !selectedPo}
              className="bg-rlx-green px-8 py-2.5 text-sm font-semibold text-white hover:bg-rlx-green/90 transition disabled:opacity-40">
              {busy ? "Posting GRN…" : "Post GRN"}
            </button>
          </div>
        </form>
      </div>

      {/* Success modal */}
      {successData && (
        <GrnSuccessModal grnNumber={successData.grnNumber} movedQty={successData.movedQty} onClose={() => setSuccessData(null)} />
      )}
    </div>
  );
}
