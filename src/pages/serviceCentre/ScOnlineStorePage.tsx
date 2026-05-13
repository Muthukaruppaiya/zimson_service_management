import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
  const navigate = useNavigate();
  const { orderId } = useParams<{ orderId?: string }>();
  const { user } = useAuth();
  const [rows, setRows] = useState<InterHoSpareOrder[]>([]);
  const [msg, setMsg] = useState("");

  const selectedOrder = useMemo(
    () => rows.find((o) => o.id === orderId) ?? null,
    [rows, orderId],
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
    return user?.role === "super_admin" || user?.role === "admin" || o.toRegionId === (user?.regionId ?? "");
  }

  function canDispatch(o: InterHoSpareOrder): boolean {
    if (o.status !== "FULFILLED" || !!o.dispatchedAt) return false;
    return user?.role === "super_admin" || user?.role === "admin" || o.toRegionId === (user?.regionId ?? "");
  }

  function canInward(o: InterHoSpareOrder): boolean {
    if (o.status !== "FULFILLED" || !o.dispatchedAt || !!o.inwardReceivedAt) return false;
    return user?.role === "super_admin" || user?.role === "admin" || o.fromRegionId === (user?.regionId ?? "");
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
        description=""
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
              to={orderId ? "/service-centre/online-store" : "/service-centre/supervisor"}
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              {orderId ? "Back to orders" : "Supervisor"}
            </Link>
          </div>
        }
      />

      <Card title="Online spare orders" subtitle="Stock reaches requested HO only after inward receive.">
        {msg ? <p className="mb-3 text-xs text-stone-600">{msg}</p> : null}
        {!orderId && rows.length === 0 ? (
          <p className="text-sm text-stone-600">No online spare orders yet.</p>
        ) : null}
        {!orderId && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">SRF</th>
                  <th className="px-3 py-2">Route</th>
                  <th className="px-3 py-2">Requested at</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-b border-zimson-100 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{o.orderNumber}</td>
                    <td className="px-3 py-2 font-mono text-xs">{o.srfReference}</td>
                    <td className="px-3 py-2 text-xs">{o.fromRegionName} to {o.toRegionName}</td>
                    <td className="px-3 py-2 text-xs text-stone-600">{new Date(o.requestedAt).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.status === "FULFILLED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {stageLabel(o)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/service-centre/online-store/order/${encodeURIComponent(o.id)}`)}
                        className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {orderId ? (
          !selectedOrder ? (
            <p className="text-sm text-stone-600">Order not found.</p>
          ) : (
            <div className="space-y-4 rounded-xl border border-zimson-200/80 bg-white p-4 text-sm">
              <p className="font-mono text-sm font-semibold text-zimson-900">Order {selectedOrder.orderNumber} · SRF {selectedOrder.srfReference}</p>
              <div className="grid gap-2 rounded-xl border border-zimson-200 bg-zimson-50/40 p-3 text-xs text-stone-700 sm:grid-cols-2">
                <p><span className="font-semibold text-stone-900">Status:</span> {selectedOrder.status}</p>
                <p><span className="font-semibold text-stone-900">Invoice:</span> {selectedOrder.invoiceRef ?? "-"}</p>
                <p><span className="font-semibold text-stone-900">Fulfilled at:</span> {selectedOrder.fulfilledAt ? new Date(selectedOrder.fulfilledAt).toLocaleString() : "-"}</p>
                <p><span className="font-semibold text-stone-900">Outward:</span> {selectedOrder.dispatchedAt ? new Date(selectedOrder.dispatchedAt).toLocaleString() : "Pending"}</p>
                <p><span className="font-semibold text-stone-900">Inward:</span> {selectedOrder.inwardReceivedAt ? new Date(selectedOrder.inwardReceivedAt).toLocaleString() : "Pending"}</p>
                <p className="sm:col-span-2"><span className="font-semibold text-stone-900">Lines:</span> {selectedOrder.lines.map((l) => `${l.spareName} x${l.qty}`).join(", ")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canFulfill(selectedOrder) ? (
                  <Link
                    to={`/service-centre/online-store/invoice?onlineOrderId=${encodeURIComponent(selectedOrder.id)}`}
                    className="rounded-lg bg-zimson-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zimson-800"
                  >
                    Create invoice
                  </Link>
                ) : null}
                {canDispatch(selectedOrder) ? (
                  <button type="button" onClick={() => void markDispatch(selectedOrder.id)} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100">
                    Mark outward dispatch
                  </button>
                ) : null}
                {canInward(selectedOrder) ? (
                  <button type="button" onClick={() => void markInward(selectedOrder.id)} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100">
                    Mark inward receive
                  </button>
                ) : null}
              </div>
            </div>
          )
        ) : null}
      </Card>
    </div>
  );
}
