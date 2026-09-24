import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson } from "../../lib/api";
import { GRN_DOC_ACCEPT, grnDocNumberLabel, isAllowedGrnDocument } from "../../lib/grnMode";
import { buildPurchaseReturnDocument, openPrintDocument } from "../../lib/inventoryDocuments";
import { PURCHASE_RETURN_REASONS, purchaseReturnReasonLabel, type PurchaseReturnReason } from "../../lib/purchaseReturn";

const inputCls =
  "mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/30 transition-colors";
const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-stone-500";

type EligibleGrnItem = {
  id: string;
  poItemId: string;
  spareId: string;
  sku: string;
  name: string;
  qtyReceived: number;
  qtyTransferred: number;
  qtyReturned: number;
  qtyReturnable: number;
  hoAvailable: number;
  costPrice?: number;
  gstRate?: number;
  taxAmount?: number;
};

type EligibleGrn = {
  id: string;
  grnNumber: string;
  poId: string | null;
  poNumber: string | null;
  supplierId: string;
  supplierName: string;
  regionId: string;
  invoiceNumber: string | null;
  mode?: "WITH_BILL" | "WITHOUT_BILL";
  createdAt: string;
  items: EligibleGrnItem[];
};

function SectionHeader({ title }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-rlx-rule bg-rlx-green px-5 py-4">
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">{title}</h3>
    </div>
  );
}

function ReturnSuccessModal({
  prtNumber,
  returnedQty,
  onClose,
}: {
  prtNumber: string;
  returnedQty: number;
  onClose: () => void;
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
          <h2 className="text-base font-semibold uppercase tracking-[0.15em] text-white">Spare Return Posted</h2>
        </div>
        <div className="px-6 py-5 text-center space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">Return Number</p>
          <p className="font-mono text-2xl font-bold text-rlx-green">{prtNumber}</p>
          <p className="text-sm text-stone-500 mt-2">{returnedQty} unit(s) deducted from HO stock.</p>
        </div>
        <div className="border-t border-rlx-rule bg-rlx-bg px-6 py-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="bg-rlx-green px-8 py-2 text-sm font-semibold text-white hover:bg-rlx-green/90 transition"
          >
            Post Another Return
          </button>
        </div>
      </div>
    </div>
  );
}

export function InventoryPurchaseReturnPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetGrnId = searchParams.get("grnId") ?? "";

  const isHo =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.role === "ho_manager" ||
    user?.role === "ho_purchase";

  const [grns, setGrns] = useState<EligibleGrn[]>([]);
  const [selectedGrnId, setSelectedGrnId] = useState(presetGrnId);
  const [reason, setReason] = useState<PurchaseReturnReason>("DEFECTIVE");
  const [debitNoteNumber, setDebitNoteNumber] = useState("");
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [supportFile, setSupportFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [qtyByItem, setQtyByItem] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [successData, setSuccessData] = useState<{ prtNumber: string; returnedQty: number } | null>(null);

  const selectedGrn = useMemo(
    () => grns.find((g) => g.id === selectedGrnId) ?? null,
    [grns, selectedGrnId],
  );

  const loadData = useCallback(async () => {
    try {
      const data = await apiJson<{ grns: EligibleGrn[] }>("/api/inventory/purchase-returns/eligible-grns");
      setGrns(data.grns);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load returnable GRNs.");
    }
  }, []);

  useEffect(() => {
    if (isHo) void loadData();
  }, [isHo, loadData]);

  useEffect(() => {
    if (!selectedGrnId && presetGrnId && grns.some((g) => g.id === presetGrnId)) {
      setSelectedGrnId(presetGrnId);
    }
  }, [grns, presetGrnId, selectedGrnId]);

  useEffect(() => {
    if (!selectedGrn) {
      setQtyByItem({});
      return;
    }
    const next: Record<string, string> = {};
    for (const i of selectedGrn.items) {
      const max = Math.min(i.qtyReturnable, i.hoAvailable);
      next[i.id] = max > 0 ? String(max) : "0";
    }
    setQtyByItem(next);
  }, [selectedGrn]);

  async function submitReturn(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!selectedGrn) {
      setErr("Select a GRN to return against.");
      return;
    }
    const lines = selectedGrn.items
      .map((i) => {
        const qty = Number(qtyByItem[i.id] ?? "0");
        const max = Math.min(i.qtyReturnable, i.hoAvailable);
        return { item: i, qty, max };
      })
      .filter((l) => l.qty > 0);
    if (lines.length === 0) {
      setErr("Enter return quantity for at least one spare.");
      return;
    }
    if (lines.some((l) => l.qty > l.max)) {
      setErr("Return qty exceeds remaining HO qty or on-hand stock on one or more lines.");
      return;
    }
    if (supportFile && !isAllowedGrnDocument(supportFile)) {
      setErr("Upload PDF or DOC only. Images are not allowed.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        grnId: selectedGrn.id,
        reason,
        debitNoteNumber: debitNoteNumber.trim() || null,
        returnDate,
        notes: notes.trim(),
        items: lines.map((l) => ({
          grnItemId: l.item.id,
          spareId: l.item.spareId,
          qtyReturned: l.qty,
        })),
      };
      let data: { prtNumber: string; returnedQty: number; grnNumber: string };
      if (supportFile) {
        const fd = new FormData();
        fd.append("grnId", payload.grnId);
        fd.append("reason", payload.reason);
        fd.append("debitNoteNumber", payload.debitNoteNumber ?? "");
        fd.append("returnDate", payload.returnDate);
        fd.append("notes", payload.notes);
        fd.append("items", JSON.stringify(payload.items));
        fd.append("supportDoc", supportFile);
        const resp = await fetch("/api/inventory/purchase-returns", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const j = (await resp.json()) as {
          error?: string;
          prtNumber?: string;
          returnedQty?: number;
          grnNumber?: string;
        };
        if (!resp.ok) throw new Error(j.error || "Could not post purchase return.");
        data = { prtNumber: j.prtNumber!, returnedQty: j.returnedQty!, grnNumber: j.grnNumber! };
      } else {
        data = await apiJson<typeof data>("/api/inventory/purchase-returns", {
          method: "POST",
          json: payload,
        });
      }
      openPrintDocument(
        `Purchase Return ${data.prtNumber}`,
        buildPurchaseReturnDocument({
          prtNumber: data.prtNumber,
          createdAt: new Date().toISOString(),
          returnDate,
          grnNumber: selectedGrn.grnNumber,
          poNumber: selectedGrn.poNumber || "Direct",
          supplierName: selectedGrn.supplierName,
          reason: purchaseReturnReasonLabel(reason),
          debitNoteNumber: debitNoteNumber.trim() || null,
          notes: notes.trim(),
          lines: lines.map((l) => ({
            description: `${l.item.name} (${l.item.sku})`,
            qtyReturned: l.qty,
            costPrice: l.item.costPrice,
            gstRate: l.item.gstRate,
            taxAmount: +(((l.item.costPrice ?? 0) * l.qty * (l.item.gstRate ?? 18)) / 100).toFixed(2),
          })),
        }),
      );
      setSuccessData({ prtNumber: data.prtNumber, returnedQty: data.returnedQty });
      setSelectedGrnId("");
      setDebitNoteNumber("");
      setNotes("");
      setSupportFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setQtyByItem({});
      await loadData();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!isHo) {
    return (
      <div>
        <InventoryBreadcrumb current="GRN return" />
        <PageHeader title="GRN return" description="" />
        <div className="border border-rlx-rule bg-white px-6 py-10 text-center text-sm text-stone-400">
          Only HO Manager, HO Purchase, or Admin can post GRN returns to suppliers.
        </div>
      </div>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb current="GRN return" />
      <PageHeader
        title="GRN return"
        description="Return unused HO stock to the supplier against a GRN. Transferred store stock cannot be returned from here."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate("/inventory/purchase-return-history")}
              className="border border-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-rlx-green hover:bg-rlx-green/5 transition"
            >
              GRN return history
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition"
            >
              ← Back
            </button>
          </div>
        }
      />

      {err && <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div>}

      <div className="mb-6 border border-rlx-rule bg-white shadow-sm">
        <SectionHeader
          title="Return Spares Against GRN"
          subtitle="Qty is capped by GRN remaining at HO (received − transferred − already returned) and current HO stock."
        />
        <form onSubmit={submitReturn} className="p-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>GRN *</label>
              <select
                className={inputCls}
                value={selectedGrnId}
                onChange={(e) => setSelectedGrnId(e.target.value)}
              >
                <option value="">Select GRN with returnable stock…</option>
                {grns.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.grnNumber} · {g.poNumber || "Direct"} · {g.supplierName}
                  </option>
                ))}
              </select>
              {grns.length === 0 && (
                <p className="mt-1 text-[11px] text-stone-400">
                  No GRN has unused HO stock. Post a GRN first, or stock may already be transferred/returned.
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Return reason *</label>
              <select
                className={inputCls}
                value={reason}
                onChange={(e) => setReason(e.target.value as typeof reason)}
              >
                {PURCHASE_RETURN_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelCls}>Return date</label>
              <input type="date" className={inputCls} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Debit note # (optional)</label>
              <input
                className={inputCls}
                value={debitNoteNumber}
                onChange={(e) => setDebitNoteNumber(e.target.value)}
                placeholder="Supplier debit note / credit note"
              />
            </div>
            <div>
              <label className={labelCls}>Remark</label>
              <input
                className={inputCls}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Support document (optional)</label>
              <div
                onClick={() => fileRef.current?.click()}
                className="mt-1 flex cursor-pointer items-center gap-3 border border-dashed border-rlx-rule bg-stone-50/40 px-3 py-2 hover:border-rlx-green transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 shrink-0 text-stone-400">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="truncate text-sm text-stone-500">
                  {supportFile ? supportFile.name : "Click to attach PDF or DOC…"}
                </span>
                {supportFile ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSupportFile(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="ml-auto shrink-0 text-xs text-red-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={GRN_DOC_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && !isAllowedGrnDocument(file)) {
                    setErr("Upload PDF or DOC only. Images are not allowed.");
                    setSupportFile(null);
                    e.target.value = "";
                    return;
                  }
                  setErr(null);
                  setSupportFile(file);
                }}
              />
              <p className="mt-1 text-[11px] text-stone-400">PDF or DOC only. Images are not accepted.</p>
            </div>
          </div>

          {selectedGrn && (
            <div className="border border-rlx-rule">
              <div className="border-b border-rlx-rule bg-stone-50 px-4 py-2.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  {selectedGrn.grnNumber} · {selectedGrn.supplierName} · {grnDocNumberLabel(selectedGrn.mode ?? "WITH_BILL")} {selectedGrn.invoiceNumber ?? "—"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-rlx-rule bg-white text-[10px] font-bold uppercase tracking-widest text-stone-400">
                      <th className="px-4 py-2.5 text-left">Spare</th>
                      <th className="px-4 py-2.5 text-center">Received</th>
                      <th className="px-4 py-2.5 text-center">Transferred</th>
                      <th className="px-4 py-2.5 text-center">Returned</th>
                      <th className="px-4 py-2.5 text-center">HO stock</th>
                      <th className="px-4 py-2.5 text-center">Returnable</th>
                      <th className="px-4 py-2.5 text-center">Qty to return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGrn.items.map((i) => {
                      const max = Math.min(i.qtyReturnable, i.hoAvailable);
                      const done = max <= 0;
                      return (
                        <tr key={i.id} className="border-b border-rlx-rule last:border-0">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-stone-800">{i.name}</p>
                            <p className="text-[11px] text-stone-400">{i.sku}</p>
                          </td>
                          <td className="px-4 py-2.5 text-center text-stone-700">{i.qtyReceived}</td>
                          <td className="px-4 py-2.5 text-center text-stone-600">{i.qtyTransferred}</td>
                          <td className="px-4 py-2.5 text-center text-stone-600">{i.qtyReturned}</td>
                          <td className="px-4 py-2.5 text-center text-stone-700">{i.hoAvailable}</td>
                          <td className="px-4 py-2.5 text-center font-semibold text-rlx-green">{max}</td>
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="number"
                              min={0}
                              max={max}
                              step={1}
                              inputMode="numeric"
                              disabled={done || busy}
                              className="mx-auto w-24 border border-rlx-rule px-2 py-1 text-center text-sm outline-none focus:border-rlx-green disabled:bg-stone-50"
                              value={qtyByItem[i.id] ?? "0"}
                              onChange={(e) => setQtyByItem((prev) => ({ ...prev, [i.id]: e.target.value }))}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy || !selectedGrn}
              className="bg-rlx-green px-8 py-2.5 text-xs font-semibold uppercase tracking-widest text-white hover:bg-rlx-green/90 disabled:opacity-50 transition"
            >
              {busy ? "Posting…" : "Post Spare Return"}
            </button>
          </div>
        </form>
      </div>

      {successData && (
        <ReturnSuccessModal
          prtNumber={successData.prtNumber}
          returnedQty={successData.returnedQty}
          onClose={() => setSuccessData(null)}
        />
      )}
    </div>
  );
}
