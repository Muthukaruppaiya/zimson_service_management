import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { apiJson } from "../../lib/api";

type InterHoSpareOrder = {
  id: string;
  orderNumber: string;
  srfId: string;
  srfReference: string;
  fromRegionId: string;
  fromRegionName: string;
  toRegionId: string;
  toRegionName: string;
  status: "REQUESTED" | "FULFILLED" | "CANCELLED";
  note: string;
  requestedBy: string;
  requestedByName: string | null;
  requestedAt: string;
  invoiceRef: string | null;
  fulfilledNote: string;
  fulfilledBy: string | null;
  fulfilledByName: string | null;
  fulfilledAt: string | null;
  dispatchNote: string;
  dispatchedBy: string | null;
  dispatchedByName: string | null;
  dispatchedAt: string | null;
  inwardNote: string;
  inwardReceivedBy: string | null;
  inwardReceivedByName: string | null;
  inwardReceivedAt: string | null;
  lines: Array<{
    id: string;
    spareId: string;
    spareName: string;
    qty: number;
    unitPriceInr: number;
    lineTotalInr: number;
  }>;
};

export function ScOnlineStorePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InterHoSpareOrder[]>([]);
  const [msg, setMsg] = useState("");
  const [orderDetailsId, setOrderDetailsId] = useState<string | null>(null);

  const selectedOrder = useMemo(
    () => rows.find((o) => o.id === orderDetailsId) ?? null,
    [rows, orderDetailsId],
  );

  async function refreshOrders() {
    try {
      const out = await apiJson<{ rows: InterHoSpareOrder[] }>("/api/service/inter-ho-spare-orders");
      setRows(out.rows);
      setMsg("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not load online store orders.");
    }
  }

  useEffect(() => {
    if (!user) return;
    void refreshOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function canFulfill(o: InterHoSpareOrder): boolean {
    if (o.status !== "REQUESTED") return false;
    return user?.role === "super_admin" || user?.role === "ho_admin" || o.toRegionId === (user?.regionId ?? "");
  }

  function canDispatch(o: InterHoSpareOrder): boolean {
    if (o.status !== "FULFILLED" || !!o.dispatchedAt) return false;
    return user?.role === "super_admin" || user?.role === "ho_admin" || o.toRegionId === (user?.regionId ?? "");
  }

  function canInward(o: InterHoSpareOrder): boolean {
    if (o.status !== "FULFILLED" || !o.dispatchedAt || !!o.inwardReceivedAt) return false;
    return user?.role === "super_admin" || user?.role === "ho_admin" || o.fromRegionId === (user?.regionId ?? "");
  }

  function stageLabel(o: InterHoSpareOrder): string {
    if (o.status !== "FULFILLED") return "REQUESTED";
    if (!o.dispatchedAt) return "INVOICED";
    if (!o.inwardReceivedAt) return "OUTWARD DONE";
    return "INWARD DONE";
  }

  async function markDispatch(orderId: string) {
    const note = window.prompt("Outward note (optional)") ?? "";
    try {
      await apiJson(`/api/service/inter-ho-spare-orders/${encodeURIComponent(orderId)}/dispatch`, {
        method: "POST",
        json: { note: note.trim() },
      });
      await refreshOrders();
      setMsg("Outward dispatch updated.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not mark outward dispatch.");
    }
  }

  async function markInward(orderId: string) {
    const note = window.prompt("Inward note (optional)") ?? "";
    try {
      await apiJson(`/api/service/inter-ho-spare-orders/${encodeURIComponent(orderId)}/inward-receive`, {
        method: "POST",
        json: { note: note.trim() },
      });
      await refreshOrders();
      setMsg("Inward receive updated.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not mark inward receive.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Online store"
        description="Flow: request from other HO -> sender invoice -> sender ODC outward -> requested HO inward -> supervisor uses spares in SRF repair."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refreshOrders()}
              className="rounded-xl border border-zimson-300 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
            >
              Refresh
            </button>
            <Link
              to="/service-centre/supervisor"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Supervisor
            </Link>
          </div>
        }
      />

      <Card title="Online spare orders" subtitle="Stock reaches requested HO only after inward receive.">
        {msg ? <p className="mb-3 text-xs text-stone-600">{msg}</p> : null}
        {rows.length === 0 ? (
          <p className="text-sm text-stone-600">No online spare orders yet.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((o) => (
              <div key={o.id} className="rounded-xl border border-zimson-200/80 bg-white p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono font-semibold text-zimson-900">{o.orderNumber} · SRF {o.srfReference}</p>
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${o.status === "FULFILLED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                    {stageLabel(o)}
                  </span>
                </div>
                <p className="mt-1 text-stone-700">
                  {o.fromRegionName} → {o.toRegionName} · {new Date(o.requestedAt).toLocaleString()}
                </p>
                <p className="mt-1 text-stone-700">{o.lines.map((l) => `${l.spareName} x${l.qty}`).join(", ")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {canFulfill(o) ? (
                    <Link
                      to={`/service-centre/online-store/invoice?onlineOrderId=${encodeURIComponent(o.id)}`}
                      className="rounded-lg bg-zimson-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zimson-800"
                    >
                      Create invoice
                    </Link>
                  ) : null}
                  {canDispatch(o) ? (
                    <button type="button" onClick={() => void markDispatch(o.id)} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100">
                      Mark outward dispatch
                    </button>
                  ) : null}
                  {canInward(o) ? (
                    <button type="button" onClick={() => void markInward(o.id)} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100">
                      Mark inward receive
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOrderDetailsId(o.id)}
                    className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                  >
                    View details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {selectedOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between">
              <h3 className="text-lg font-semibold text-zimson-900">Order details — {selectedOrder.orderNumber}</h3>
              <button type="button" onClick={() => setOrderDetailsId(null)} className="rounded-xl border border-zimson-300 px-3 py-1.5 text-sm">
                Close
              </button>
            </div>
            <div className="grid gap-2 rounded-xl border border-zimson-200 bg-zimson-50/40 p-3 text-xs text-stone-700 sm:grid-cols-2">
              <p><span className="font-semibold text-stone-900">Status:</span> {selectedOrder.status}</p>
              <p><span className="font-semibold text-stone-900">Invoice:</span> {selectedOrder.invoiceRef ?? "-"}</p>
              <p><span className="font-semibold text-stone-900">Fulfilled at:</span> {selectedOrder.fulfilledAt ? new Date(selectedOrder.fulfilledAt).toLocaleString() : "-"}</p>
              <p><span className="font-semibold text-stone-900">Outward:</span> {selectedOrder.dispatchedAt ? new Date(selectedOrder.dispatchedAt).toLocaleString() : "Pending"}</p>
              <p><span className="font-semibold text-stone-900">Inward:</span> {selectedOrder.inwardReceivedAt ? new Date(selectedOrder.inwardReceivedAt).toLocaleString() : "Pending"}</p>
              <p className="sm:col-span-2"><span className="font-semibold text-stone-900">Dispatch note:</span> {selectedOrder.dispatchNote || "-"}</p>
              <p className="sm:col-span-2"><span className="font-semibold text-stone-900">Inward note:</span> {selectedOrder.inwardNote || "-"}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
