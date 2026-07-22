import { useEffect, useMemo, useState } from "react";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { apiJson, ApiError } from "../../lib/api";

type CarriedWatch = {
  id: string;
  reference: string;
  customerName: string;
  watchBrand: string;
  watchModel: string;
  status: string;
};

type DeliveryHistoryTransfer = {
  id: string;
  dcNumber: string;
  toLocation: "SERVICE_CENTRE" | "STORE";
  status: string;
  createdAt: string;
  handedToDeliveryAt: string | null;
  deliveryReceivedAt: string | null;
  deliveryTripNumber: string | null;
  deliveryBoyUserId: string;
  deliveryBoyName: string;
  deliveryBoyPhone: string | null;
  watchCount: number;
  watches: CarriedWatch[];
};

type HistoryLine = CarriedWatch & {
  transferId: string;
  dcNumber: string;
  deliveryTripNumber: string | null;
  direction: "Store → HO" | "HO → Store";
  transferStatus: string;
  handedAt: string | null;
  receivedAt: string | null;
  deliveryBoyUserId: string;
  deliveryBoyName: string;
  deliveryBoyPhone: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "Pending";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function transferStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    CREATED: "Waiting for handoff",
    IN_TRANSIT: "With delivery boy",
    AWAITING_INWARD: "Delivered · awaiting inward",
    INWARDED: "Inward completed",
    RECEIVED: "Received",
    DISPATCHED: "Dispatched",
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

export function DeliveryBoyHistoryPage() {
  const { user } = useAuth();
  const [transfers, setTransfers] = useState<DeliveryHistoryTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boyId, setBoyId] = useState("all");
  const [direction, setDirection] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<HistoryLine | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void apiJson<{ rows: DeliveryHistoryTransfer[] }>("/api/service/delivery-handoff/history")
      .then((out) => {
        if (!cancelled) setTransfers(out.rows ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load delivery-boy history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const boys = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; phone: string | null }>();
    for (const transfer of transfers) {
      byId.set(transfer.deliveryBoyUserId, {
        id: transfer.deliveryBoyUserId,
        name: transfer.deliveryBoyName,
        phone: transfer.deliveryBoyPhone,
      });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [transfers]);

  const lines = useMemo<HistoryLine[]>(
    () =>
      transfers.flatMap((transfer) =>
        (transfer.watches ?? []).map((watch) => ({
          ...watch,
          transferId: transfer.id,
          dcNumber: transfer.dcNumber,
          deliveryTripNumber: transfer.deliveryTripNumber,
          direction: transfer.toLocation === "STORE" ? "HO → Store" : "Store → HO",
          transferStatus: transfer.status,
          handedAt: transfer.handedToDeliveryAt,
          receivedAt: transfer.deliveryReceivedAt,
          deliveryBoyUserId: transfer.deliveryBoyUserId,
          deliveryBoyName: transfer.deliveryBoyName,
          deliveryBoyPhone: transfer.deliveryBoyPhone,
        })),
      ),
    [transfers],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter((line) => {
      if (boyId !== "all" && line.deliveryBoyUserId !== boyId) return false;
      if (direction !== "all" && line.direction !== direction) return false;
      if (!q) return true;
      return [
        line.reference,
        line.dcNumber,
        line.deliveryTripNumber,
        line.deliveryBoyName,
        line.deliveryBoyPhone,
        line.customerName,
        line.watchBrand,
        line.watchModel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [lines, boyId, direction, query]);

  const activeCount = lines.filter((line) => line.transferStatus === "IN_TRANSIT").length;
  const completedCount = lines.filter((line) => Boolean(line.receivedAt)).length;
  const storeSide = user?.role === "store_user" || user?.role === "store_manager" || user?.role === "store_accounts";

  return (
    <div className="space-y-6">
      <ServiceBreadcrumb
        items={[
          { label: "Service", to: storeSide ? "/service" : "/service-centre" },
          { label: "Delivery-boy history" },
        ]}
      />
      <PageHeader
        title="Delivery-boy carrying history"
        subtitle="Track which delivery boy carried each SRF and transfer document."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">SRFs carried</p>
          <p className="mt-1 text-2xl font-bold text-blue-950">{lines.length}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Currently with delivery boy</p>
          <p className="mt-1 text-2xl font-bold text-amber-950">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Delivered</p>
          <p className="mt-1 text-2xl font-bold text-emerald-950">{completedCount}</p>
        </div>
      </div>

      <Card title="Carrying records">
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SRF, TD, customer, watch…"
            className="rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm md:col-span-2"
          />
          <select
            value={boyId}
            onChange={(e) => setBoyId(e.target.value)}
            className="rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All delivery boys</option>
            {boys.map((boy) => (
              <option key={boy.id} value={boy.id}>
                {boy.name}{boy.phone ? ` · ${boy.phone}` : ""}
              </option>
            ))}
          </select>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">Both directions</option>
            <option value="Store → HO">Store → HO</option>
            <option value="HO → Store">HO → Store</option>
          </select>
        </div>

        {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        {loading ? (
          <p className="py-8 text-center text-sm text-stone-500">Loading carrying history…</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-500">No delivery-boy carrying records found.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zimson-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zimson-50 text-xs uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-3 py-2">Delivery boy</th>
                  <th className="px-3 py-2">Trip no.</th>
                  <th className="px-3 py-2">SRF</th>
                  <th className="px-3 py-2">TD</th>
                  <th className="px-3 py-2">Direction</th>
                  <th className="px-3 py-2">Watch / customer</th>
                  <th className="px-3 py-2">Handed over</th>
                  <th className="px-3 py-2">Delivered</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((line) => (
                  <tr
                    key={`${line.transferId}-${line.id}`}
                    onClick={() => setSelected(line)}
                    className="cursor-pointer border-t border-zimson-100 align-top transition hover:bg-zimson-50/70"
                    title="View delivery carrying details"
                  >
                    <td className="px-3 py-2">
                      <p className="font-semibold text-zimson-900">{line.deliveryBoyName}</p>
                      <p className="text-xs text-stone-500">{line.deliveryBoyPhone || "—"}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-bold text-amber-800">
                      {line.deliveryTripNumber || "Legacy trip"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-bold text-zimson-900">{line.reference}</td>
                    <td className="px-3 py-2 font-mono text-xs">{line.dcNumber}</td>
                    <td className="whitespace-nowrap px-3 py-2">{line.direction}</td>
                    <td className="px-3 py-2">
                      <p>{line.watchBrand} {line.watchModel}</p>
                      <p className="text-xs text-stone-500">{line.customerName}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDate(line.handedAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDate(line.receivedAt)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-900">
                        {transferStatusLabel(line.transferStatus)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Delivery trip ${selected.deliveryTripNumber ?? selected.dcNumber}`}
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-gradient-to-r from-[#0c1c56] to-[#24499c] px-6 py-5 text-white">
              <div className="absolute inset-x-0 top-0 h-1 bg-amber-400" />
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/10 text-xl hover:bg-white/20"
                aria-label="Close"
              >
                ×
              </button>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-100">Delivery carrying record</p>
              <h3 className="mt-1 font-mono text-xl font-bold">
                {selected.deliveryTripNumber || "Legacy delivery trip"}
              </h3>
              <p className="mt-1 text-sm text-blue-100">{selected.direction} · {selected.dcNumber}</p>
            </div>

            <div className="grid gap-3 bg-slate-50 p-5 sm:grid-cols-2">
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Delivery boy</p>
                <p className="mt-2 font-semibold text-slate-900">{selected.deliveryBoyName}</p>
                <p className="text-sm text-slate-600">{selected.deliveryBoyPhone || "No mobile number"}</p>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">SRF / transfer</p>
                <p className="mt-2 font-mono font-bold text-slate-900">{selected.reference}</p>
                <p className="font-mono text-sm text-slate-600">{selected.dcNumber}</p>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Watch / customer</p>
                <p className="mt-2 font-semibold text-slate-900">{selected.watchBrand} {selected.watchModel}</p>
                <p className="text-sm text-slate-600">{selected.customerName}</p>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Current status</p>
                <p className="mt-2 font-semibold text-blue-900">{transferStatusLabel(selected.transferStatus)}</p>
                <p className="text-sm text-slate-600">{selected.status.replace(/_/g, " ")}</p>
              </section>
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Handed to delivery boy</p>
                <p className="mt-2 text-sm font-semibold text-amber-950">{formatDate(selected.handedAt)}</p>
              </section>
              <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Delivered at destination</p>
                <p className="mt-2 text-sm font-semibold text-emerald-950">{formatDate(selected.receivedAt)}</p>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
