import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProcessSuccessModal } from "../../components/ui/ProcessSuccessModal";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson } from "../../lib/api";
import { modalBtnPrimary, modalBtnSecondary } from "../../lib/appModalStyles";
import { isStoreInwardRole } from "../../lib/inventoryAccess";

type TransferStatus = "IN_TRANSIT" | "PARTIAL" | "RECEIVED";

type StoreTransferItem = {
  id: string;
  spareId: string;
  sku: string;
  name: string;
  qty: number;
  receivedQty: number;
  pendingQty: number;
};

type StoreTransfer = {
  id: string;
  transferNumber: string;
  grnNumber: string | null;
  regionName: string | null;
  storeName: string | null;
  status: TransferStatus;
  notes: string | null;
  createdAt: string;
  receivedAt: string | null;
  qty: number;
  receivedQty: number;
  items: StoreTransferItem[];
};

const STATUS_META: Record<TransferStatus, { label: string; className: string }> = {
  IN_TRANSIT: { label: "In transit", className: "bg-amber-100 text-amber-800" },
  PARTIAL: { label: "Partly inwarded", className: "bg-sky-100 text-sky-800" },
  RECEIVED: { label: "Inwarded", className: "bg-emerald-100 text-emerald-800" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TransferCard({
  transfer,
  canInward,
  onInwarded,
}: {
  transfer: StoreTransfer;
  canInward: boolean;
  onInwarded: (result: { transferNumber: string; movedQty: number; status: TransferStatus }) => void;
}) {
  const pendingItems = transfer.items.filter((it) => it.pendingQty > 0);
  const [open, setOpen] = useState(transfer.status !== "RECEIVED");
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(pendingItems.map((it) => [it.id, String(it.pendingQty)])),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const meta = STATUS_META[transfer.status];
  const editable = canInward && transfer.status !== "RECEIVED";

  const lines = pendingItems
    .map((it) => ({ itemId: it.id, qty: Number.parseFloat(qty[it.id] ?? "") || 0, pending: it.pendingQty }))
    .filter((l) => l.qty > 0);
  const over = lines.some((l) => l.qty > l.pending);
  const inwardTotal = lines.reduce((s, l) => s + l.qty, 0);

  async function submit() {
    setErr(null);
    if (lines.length === 0) {
      setErr("Enter an inward quantity for at least one spare.");
      return;
    }
    if (over) {
      setErr("Inward quantity cannot exceed the pending quantity.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiJson<{ movedQty: number; status: TransferStatus; transferNumber: string }>(
        `/api/inventory/store-transfers/${encodeURIComponent(transfer.id)}/inward`,
        { method: "POST", json: { items: lines.map(({ itemId, qty: q }) => ({ itemId, qty: q })) } },
      );
      onInwarded(data);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not inward transfer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-rlx-rule bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-left hover:bg-stone-50/60"
      >
        <span className="font-mono text-sm font-bold text-rlx-green">{transfer.transferNumber}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.className}`}>
          {meta.label}
        </span>
        {transfer.grnNumber ? (
          <span className="text-xs text-stone-500">
            GRN <span className="font-mono font-semibold text-stone-700">{transfer.grnNumber}</span>
          </span>
        ) : null}
        <span className="text-xs text-stone-500">
          From <span className="font-semibold text-stone-700">{transfer.regionName ?? "CSC"}</span>
        </span>
        {!canInward && transfer.storeName ? (
          <span className="text-xs text-stone-500">
            To <span className="font-semibold text-stone-700">{transfer.storeName}</span>
          </span>
        ) : null}
        <span className="text-xs text-stone-500">Sent {formatDate(transfer.createdAt)}</span>
        <span className="ml-auto text-xs font-semibold text-stone-700">
          {transfer.receivedQty} / {transfer.qty} inwarded
        </span>
        <span className="text-stone-400">{open ? "▴" : "▾"}</span>
      </button>

      {open ? (
        <div className="border-t border-rlx-rule">
          {transfer.notes ? (
            <p className="border-b border-rlx-rule bg-stone-50 px-5 py-2 text-xs text-stone-600">
              <span className="font-semibold text-stone-500">Remark:</span> {transfer.notes}
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  <th className="px-5 py-2.5 text-left">#</th>
                  <th className="px-5 py-2.5 text-left">Spare</th>
                  <th className="px-5 py-2.5 text-left">Part</th>
                  <th className="px-5 py-2.5 text-center">Sent</th>
                  <th className="px-5 py-2.5 text-center">Inwarded</th>
                  <th className="px-5 py-2.5 text-center">Pending</th>
                  {editable ? <th className="px-5 py-2.5 text-center">Inward Qty</th> : null}
                </tr>
              </thead>
              <tbody>
                {transfer.items.map((it, idx) => {
                  const val = qty[it.id] ?? "";
                  const n = Number.parseFloat(val) || 0;
                  return (
                    <tr key={it.id} className="border-b border-rlx-rule last:border-0">
                      <td className="px-5 py-2.5 text-stone-400">{idx + 1}</td>
                      <td className="px-5 py-2.5 font-medium text-stone-800">{it.name}</td>
                      <td className="px-5 py-2.5 font-mono text-xs text-stone-500">{it.sku}</td>
                      <td className="px-5 py-2.5 text-center font-semibold">{it.qty}</td>
                      <td className="px-5 py-2.5 text-center font-semibold text-emerald-700">{it.receivedQty}</td>
                      <td
                        className={`px-5 py-2.5 text-center font-semibold ${
                          it.pendingQty > 0 ? "text-amber-700" : "text-stone-400"
                        }`}
                      >
                        {it.pendingQty}
                      </td>
                      {editable ? (
                        <td className="px-5 py-2 text-center">
                          {it.pendingQty > 0 ? (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={val}
                              onChange={(e) =>
                                setQty((prev) => ({ ...prev, [it.id]: e.target.value.replace(/[^0-9.]/g, "") }))
                              }
                              className={`h-8 w-24 border bg-white px-2 text-center text-sm outline-none focus:ring-1 ${
                                n > it.pendingQty
                                  ? "border-red-400 focus:ring-red-300"
                                  : "border-rlx-rule focus:border-rlx-green focus:ring-rlx-green/30"
                              }`}
                            />
                          ) : (
                            <span className="text-xs text-stone-400">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {editable ? (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-rlx-rule bg-stone-50 px-5 py-3">
              {err ? <p className="mr-auto text-xs font-semibold text-red-700">✕ {err}</p> : null}
              <span className="text-xs text-stone-500">
                Inward total <span className="font-bold text-stone-800">{inwardTotal}</span>
              </span>
              <button
                type="button"
                disabled={busy || inwardTotal <= 0 || over}
                onClick={() => void submit()}
                className="bg-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-rlx-green/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Inwarding…" : "Inward to store"}
              </button>
            </div>
          ) : transfer.receivedAt ? (
            <p className="border-t border-rlx-rule bg-stone-50 px-5 py-2 text-xs text-stone-500">
              Inwarded {formatDate(transfer.receivedAt)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function InventoryStoreInwardPage() {
  const { user } = useAuth();
  const canInward = isStoreInwardRole(user?.role);
  const [tab, setTab] = useState<"pending" | "received">("pending");
  const [rows, setRows] = useState<StoreTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [done, setDone] = useState<{ transferNumber: string; movedQty: number; status: TransferStatus } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiJson<{ transfers: StoreTransfer[] }>(`/api/inventory/store-transfers?status=${tab}`);
      setRows(data.transfers);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load transfers.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.transferNumber.toLowerCase().includes(q) ||
        (r.grnNumber ?? "").toLowerCase().includes(q) ||
        (r.storeName ?? "").toLowerCase().includes(q) ||
        r.items.some((it) => it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const pendingUnits = useMemo(
    () => rows.reduce((s, r) => s + r.items.reduce((a, it) => a + it.pendingQty, 0), 0),
    [rows],
  );

  return (
    <div>
      <InventoryBreadcrumb current="Store inward" />
      <PageHeader title="Store inward" description="" />

      {err ? <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div> : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex border border-rlx-rule bg-white p-0.5">
          {(
            [
              { id: "pending", label: "Pending inward" },
              { id: "received", label: "Inwarded" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-widest transition ${
                tab === t.id ? "bg-rlx-green text-white" : "text-stone-600 hover:bg-stone-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "pending" ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-800">
            {rows.length} transfer(s) · {pendingUnits} unit(s) pending
          </span>
        ) : null}
        <input
          type="text"
          placeholder="Search transfer#, GRN#, spare…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto min-w-[220px] border border-rlx-rule bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-rlx-green"
        />
      </div>

      {loading ? (
        <div className="border border-rlx-rule bg-white px-5 py-10 text-center text-sm text-stone-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="border border-rlx-rule bg-white px-5 py-10 text-center text-sm text-stone-400">
          {rows.length === 0
            ? tab === "pending"
              ? "No transfers waiting for inward."
              : "No inwarded transfers yet."
            : "No records match your search."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <TransferCard
              key={`${t.id}-${t.receivedQty}`}
              transfer={t}
              canInward={canInward}
              onInwarded={(r) => {
                setDone(r);
                void load();
              }}
            />
          ))}
        </div>
      )}

      <ProcessSuccessModal
        open={!!done}
        title={done?.status === "RECEIVED" ? "Transfer inwarded" : "Partly inwarded"}
        description={done ? `${done.movedQty} unit(s) added to store stock.` : undefined}
        onBackdropClick={() => setDone(null)}
        actions={
          <>
            <button type="button" className={modalBtnSecondary} onClick={() => setDone(null)}>
              Close
            </button>
            <Link to="/inventory/stock-prices" className={modalBtnPrimary} onClick={() => setDone(null)}>
              Stock &amp; prices
            </Link>
          </>
        }
      >
        {done ? <p className="text-center font-mono text-lg font-bold text-rlx-green">{done.transferNumber}</p> : null}
      </ProcessSuccessModal>
    </div>
  );
}
