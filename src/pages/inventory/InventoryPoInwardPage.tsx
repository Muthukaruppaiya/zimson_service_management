import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import { buildGrnDocument, openPrintDocument } from "../../lib/inventoryDocuments";
import type { PurchaseOrder } from "../../types/purchaseOrder";

type GrnItem = { id: string; poItemId: string; spareId: string; qtyReceived: number };
type GrnRow = {
  id: string;
  grnNumber: string;
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  regionId: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  mode: "WITH_BILL" | "WITHOUT_BILL";
  notes: string;
  createdBy: string;
  createdAt: string;
  items: GrnItem[];
};

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2";

export function InventoryPoInwardPage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const isHo = user?.role === "super_admin" || user?.role === "regional_admin";
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [grns, setGrns] = useState<GrnRow[]>([]);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [mode, setMode] = useState<"WITH_BILL" | "WITHOUT_BILL">("WITH_BILL");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineQty, setLineQty] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const spareNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of spares) m.set(s.id, `${s.name} (${s.sku})`);
    return m;
  }, [spares]);

  const selectedPo = useMemo(() => pos.find((p) => p.id === selectedPoId) ?? null, [pos, selectedPoId]);

  async function loadData() {
    try {
      const [poData, grnData] = await Promise.all([
        apiJson<{ pos: PurchaseOrder[] }>("/api/inventory/pos"),
        apiJson<{ grns: GrnRow[] }>("/api/inventory/grns"),
      ]);
      setPos(poData.pos);
      setGrns(grnData.grns);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load GRN data.");
    }
  }

  useEffect(() => {
    if (!isHo) return;
    void loadData();
  }, [isHo]);

  useEffect(() => {
    if (!selectedPo) {
      setLineQty({});
      return;
    }
    const next: Record<string, string> = {};
    for (const i of selectedPo.items) {
      const pending = Math.max(0, i.qtyOrdered - i.receivedQty);
      next[i.id] = pending > 0 ? String(pending) : "0";
    }
    setLineQty(next);
  }, [selectedPo]);

  async function createGrn(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (!selectedPo) {
      setErr("Select a PO.");
      return;
    }
    const lines = selectedPo.items
      .map((i) => ({
        poItemId: i.id,
        spareId: i.spareId,
        qtyReceived: Number(lineQty[i.id] ?? "0"),
        pending: Math.max(0, i.qtyOrdered - i.receivedQty),
      }))
      .filter((i) => i.qtyReceived > 0);
    if (lines.length === 0) {
      setErr("Enter inward quantity for at least one line.");
      return;
    }
    if (lines.some((i) => Number.isNaN(i.qtyReceived) || i.qtyReceived > i.pending)) {
      setErr("One or more inward qty values exceed pending.");
      return;
    }
    if (mode === "WITH_BILL" && !invoiceNumber.trim()) {
      setErr("Invoice number is required for WITH_BILL mode.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiJson<{ grnNumber: string; poStatus: string; movedQty: number }>("/api/inventory/grns", {
        method: "POST",
        json: {
          poId: selectedPo.id,
          mode,
          invoiceNumber: mode === "WITH_BILL" ? invoiceNumber.trim() : null,
          invoiceDate: mode === "WITH_BILL" && invoiceDate ? invoiceDate : null,
          notes: notes.trim(),
          items: lines.map((l) => ({ poItemId: l.poItemId, spareId: l.spareId, qtyReceived: l.qtyReceived })),
        },
      });
      setOk(`Created ${data.grnNumber}. Moved qty ${data.movedQty}. PO status ${data.poStatus}.`);
      openPrintDocument(
        `GRN ${data.grnNumber}`,
        buildGrnDocument({
          grnNumber: data.grnNumber,
          createdAt: new Date().toISOString(),
          poNumber: selectedPo.poNumber,
          supplierName: selectedPo.supplierName,
          mode,
          invoiceNumber: mode === "WITH_BILL" ? invoiceNumber.trim() : null,
          invoiceDate: mode === "WITH_BILL" ? invoiceDate : null,
          notes: notes.trim(),
          lines: lines.map((l) => ({
            description: spareNameById.get(l.spareId) ?? l.spareId,
            qtyReceived: l.qtyReceived,
          })),
        }),
      );
      setSelectedPoId("");
      setInvoiceNumber("");
      setInvoiceDate("");
      setNotes("");
      setLineQty({});
      await loadData();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not create GRN.");
    } finally {
      setBusy(false);
    }
  }

  const openPos = pos.filter((p) => p.status === "OPEN" || p.status === "PARTIAL");

  return (
    <div>
      <InventoryBreadcrumb current="PO inward / GRN" />
      <PageHeader
        title="Goods receipt against PO"
        description="Post physical receipt to stock: capture supplier tax invoice where required, or use the without-bill fast path only when purchase value is within ₹10,000 and policy allows it."
        actions={
          <Link
            to="/inventory"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Inventory home
          </Link>
        }
      />

      {!isHo ? (
        <Card title="Access">
          <p className="text-sm text-stone-600">Only regional/super admin can post GRN.</p>
        </Card>
      ) : (
        <>
          {err ? <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
          {ok ? <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p> : null}

          <Card title="Create GRN against PO" subtitle="Inward updates HO stock and PO receive status">
            <form onSubmit={createGrn} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-stone-600">PO *</label>
                  <select className={inputClass} value={selectedPoId} onChange={(e) => setSelectedPoId(e.target.value)}>
                    <option value="">Select open/partial PO…</option>
                    {openPos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.poNumber} · {p.supplierName} · {p.status}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-600">Mode *</label>
                  <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as "WITH_BILL" | "WITHOUT_BILL")}>
                    <option value="WITH_BILL">With bill</option>
                    <option value="WITHOUT_BILL">Without bill</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-stone-600">
                    Invoice number {mode === "WITH_BILL" ? "*" : "(optional)"}
                  </label>
                  <input className={inputClass} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-600">Invoice date</label>
                  <input type="date" className={inputClass} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600">Notes</label>
                <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {selectedPo ? (
                <div className="max-h-72 overflow-auto rounded-xl border border-zimson-200/80">
                  <table className="min-w-full text-left text-sm">
                    <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                      <tr>
                        <th className="px-3 py-2">Spare</th>
                        <th className="px-3 py-2">Ordered</th>
                        <th className="px-3 py-2">Received</th>
                        <th className="px-3 py-2">Pending</th>
                        <th className="px-3 py-2">Now inward</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPo.items.map((i) => {
                        const pending = Math.max(0, i.qtyOrdered - i.receivedQty);
                        return (
                          <tr key={i.id} className="border-b border-zimson-100">
                            <td className="px-3 py-2">{spareNameById.get(i.spareId) ?? i.spareId}</td>
                            <td className="px-3 py-2">{i.qtyOrdered}</td>
                            <td className="px-3 py-2">{i.receivedQty}</td>
                            <td className="px-3 py-2">{pending}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                max={pending}
                                step={0.001}
                                className="w-28 rounded border px-2 py-1 text-sm"
                                value={lineQty[i.id] ?? "0"}
                                onChange={(e) => setLineQty((prev) => ({ ...prev, [i.id]: e.target.value }))}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={busy || !selectedPo}
                className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Post GRN
              </button>
            </form>
          </Card>

          <Card title="GRN register" subtitle={`${grns.length} GRN(s)`} className="mt-8">
            <div className="max-h-[420px] overflow-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                  <tr>
                    <th className="px-3 py-2">GRN#</th>
                    <th className="px-3 py-2">PO#</th>
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2">Mode</th>
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Lines</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {grns.map((g) => (
                    <tr key={g.id} className="border-b border-zimson-100 align-top">
                      <td className="px-3 py-2 font-mono text-xs">{g.grnNumber}</td>
                      <td className="px-3 py-2 font-mono text-xs">{g.poNumber}</td>
                      <td className="px-3 py-2">{g.supplierName}</td>
                      <td className="px-3 py-2">{g.mode}</td>
                      <td className="px-3 py-2">{g.invoiceNumber ?? "-"}</td>
                      <td className="px-3 py-2 text-xs text-stone-700">
                        {g.items.map((i) => `${spareNameById.get(i.spareId) ?? i.spareId} x ${i.qtyReceived}`).join(" · ")}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            openPrintDocument(
                              `GRN ${g.grnNumber}`,
                              buildGrnDocument({
                                grnNumber: g.grnNumber,
                                createdAt: g.createdAt,
                                poNumber: g.poNumber,
                                supplierName: g.supplierName,
                                mode: g.mode,
                                invoiceNumber: g.invoiceNumber,
                                invoiceDate: g.invoiceDate,
                                notes: g.notes,
                                lines: g.items.map((i) => ({
                                  description: spareNameById.get(i.spareId) ?? i.spareId,
                                  qtyReceived: i.qtyReceived,
                                })),
                              }),
                            )
                          }
                          className="rounded-lg border border-zimson-300 bg-zimson-50 px-2 py-1 text-xs font-semibold text-zimson-800"
                        >
                          Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
