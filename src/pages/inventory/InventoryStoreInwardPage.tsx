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
  IN_TRANSIT: { label: "In transit", className: "bg-amber-100 text-amber-800 ring-amber-300/70" },
  PARTIAL: { label: "Partly inwarded", className: "bg-sky-100 text-sky-800 ring-sky-300/70" },
  RECEIVED: { label: "Inwarded", className: "bg-emerald-100 text-emerald-800 ring-emerald-300/70" },
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

function StatTile({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="border border-rlx-rule bg-white shadow-sm">
      <div className="border-b-2 border-rlx-gold bg-rlx-green px-3 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">{label}</p>
      </div>
      <p className={`px-3 py-2.5 text-xl font-semibold tabular-nums ${accent ? "text-rlx-green" : "text-stone-800"}`}>{value}</p>
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
      <div
        className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-rlx-gold"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
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
  const [open, setOpen] = useState(false);
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
  const pendingTotal = pendingItems.reduce((s, it) => s + it.pendingQty, 0);

  function fillAllPending() {
    setQty(Object.fromEntries(pendingItems.map((it) => [it.id, String(it.pendingQty)])));
    setErr(null);
  }

  function clearAll() {
    setQty(Object.fromEntries(pendingItems.map((it) => [it.id, ""])));
    setErr(null);
  }

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
    <div className="overflow-hidden border border-rlx-rule bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full border-b-2 border-rlx-gold bg-gradient-to-r from-rlx-green-deep to-rlx-green px-5 py-3 text-left text-white transition hover:brightness-110"
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="font-mono text-sm font-bold tracking-wide text-rlx-gold-light">{transfer.transferNumber}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${meta.className}`}>
            {meta.label}
          </span>
          {transfer.grnNumber ? (
            <span className="text-xs text-white/70">
              GRN <span className="font-mono font-semibold text-white">{transfer.grnNumber}</span>
            </span>
          ) : null}
          <span className="text-xs text-white/70">
            From <span className="font-semibold text-white">{transfer.regionName ?? "CSC"}</span>
          </span>
          {!canInward && transfer.storeName ? (
            <span className="text-xs text-white/70">
              To <span className="font-semibold text-white">{transfer.storeName}</span>
            </span>
          ) : null}
          <span className="text-xs text-white/70">Sent {formatDate(transfer.createdAt)}</span>
          <span className="text-xs text-white/70">
            <span className="font-semibold text-white">{transfer.items.length}</span> line(s)
          </span>
          <span className="ml-auto flex items-center gap-3">
            <span className="text-xs font-semibold tabular-nums">
              {transfer.receivedQty} / {transfer.qty} inwarded
            </span>
            <svg
              className={`h-4 w-4 text-white/80 transition-transform ${open ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>
        <div className="mt-2.5">
          <ProgressBar done={transfer.receivedQty} total={transfer.qty} />
        </div>
      </button>

      {open ? (
        <div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-rlx-rule bg-rlx-bg/60 px-5 py-2 text-xs text-stone-600">
            <span>
              <span className="font-semibold text-stone-500">Lines:</span> {transfer.items.length}
            </span>
            <span>
              <span className="font-semibold text-stone-500">Pending units:</span>{" "}
              <span className="font-semibold text-amber-700">{pendingTotal}</span>
            </span>
            {transfer.notes ? (
              <span className="min-w-0 break-words">
                <span className="font-semibold text-stone-500">Remark:</span> {transfer.notes}
              </span>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-500">
                  <th className="w-12 px-5 py-2.5 text-left">#</th>
                  <th className="px-5 py-2.5 text-left">Spare</th>
                  <th className="px-5 py-2.5 text-left">Part number</th>
                  <th className="px-5 py-2.5 text-center">Sent</th>
                  <th className="px-5 py-2.5 text-center">Inwarded</th>
                  <th className="px-5 py-2.5 text-center">Pending</th>
                  {editable ? <th className="px-5 py-2.5 text-center">Inward qty</th> : null}
                </tr>
              </thead>
              <tbody>
                {transfer.items.map((it, idx) => {
                  const val = qty[it.id] ?? "";
                  const n = Number.parseFloat(val) || 0;
                  const invalid = n > it.pendingQty;
                  const filled = n > 0 && !invalid;
                  return (
                    <tr
                      key={it.id}
                      className={`border-b border-l-4 border-rlx-rule transition-colors last:border-b-0 ${
                        invalid
                          ? "border-l-red-500 bg-red-50/50"
                          : filled
                            ? "border-l-rlx-green bg-rlx-green-light/40"
                            : it.pendingQty === 0
                              ? "border-l-transparent bg-stone-50/60 text-stone-500"
                              : "border-l-transparent"
                      }`}
                    >
                      <td className="px-5 py-2.5 text-stone-400">{idx + 1}</td>
                      <td className="px-5 py-2.5 font-medium text-stone-800">{it.name}</td>
                      <td className="px-5 py-2.5 font-mono text-xs text-stone-500">{it.sku}</td>
                      <td className="px-5 py-2.5 text-center font-semibold tabular-nums">{it.qty}</td>
                      <td className="px-5 py-2.5 text-center font-semibold tabular-nums text-emerald-700">{it.receivedQty}</td>
                      <td className="px-5 py-2.5 text-center">
                        {it.pendingQty > 0 ? (
                          <span className="inline-flex min-w-[2.5rem] justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-800">
                            {it.pendingQty}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            Done
                          </span>
                        )}
                      </td>
                      {editable ? (
                        <td className="px-5 py-2 text-center">
                          {it.pendingQty > 0 ? (
                            <div
                              className={`inline-flex items-center overflow-hidden rounded-lg border bg-white shadow-sm focus-within:ring-2 ${
                                invalid ? "border-red-400 focus-within:ring-red-200" : "border-rlx-rule focus-within:ring-rlx-green/25"
                              }`}
                            >
                              <input
                                type="text"
                                inputMode="decimal"
                                value={val}
                                aria-label={`Inward quantity for ${it.name}`}
                                onChange={(e) =>
                                  setQty((prev) => ({ ...prev, [it.id]: e.target.value.replace(/[^0-9.]/g, "") }))
                                }
                                className={`h-8 w-20 border-0 px-2 text-center text-sm font-semibold tabular-nums outline-none ${
                                  invalid ? "text-red-700" : "text-stone-800"
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => setQty((prev) => ({ ...prev, [it.id]: String(it.pendingQty) }))}
                                className="h-8 border-l border-rlx-rule bg-stone-50 px-2 text-[10px] font-bold uppercase tracking-wide text-rlx-green hover:bg-rlx-green-light"
                              >
                                Max
                              </button>
                            </div>
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
            <div className="flex flex-wrap items-center gap-3 border-t border-rlx-rule bg-rlx-bg/60 px-5 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fillAllPending}
                  className="rounded-lg border border-rlx-rule bg-white px-3 py-1.5 text-xs font-semibold text-rlx-green hover:border-rlx-green hover:bg-rlx-green-light"
                >
                  Fill pending
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg border border-rlx-rule bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100"
                >
                  Clear
                </button>
              </div>
              {err ? <p className="border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">{err}</p> : null}
              <div className="ml-auto flex items-center gap-4">
                <span className="text-xs text-stone-500">
                  Inward total{" "}
                  <span className={`text-base font-bold tabular-nums ${over ? "text-red-700" : "text-rlx-green"}`}>{inwardTotal}</span>
                  <span className="text-stone-400"> / {pendingTotal}</span>
                </span>
                <button
                  type="button"
                  disabled={busy || inwardTotal <= 0 || over}
                  onClick={() => void submit()}
                  className="inline-flex items-center gap-2 rounded-lg bg-rlx-green px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-white shadow-sm transition hover:bg-rlx-green-deep disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  {busy ? "Inwarding…" : "Inward to store"}
                </button>
              </div>
            </div>
          ) : transfer.receivedAt ? (
            <p className="border-t border-rlx-rule bg-emerald-50/60 px-5 py-2 text-xs font-medium text-emerald-800">
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
  const totalUnits = useMemo(() => rows.reduce((s, r) => s + r.qty, 0), [rows]);
  const inwardedUnits = useMemo(() => rows.reduce((s, r) => s + r.receivedQty, 0), [rows]);

  return (
    <div>
      <InventoryBreadcrumb current="Store inward" />
      <PageHeader title="Store inward" description="" />

      {err ? <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label={tab === "pending" ? "Pending transfers" : "Inwarded transfers"} value={rows.length} />
        <StatTile label={tab === "pending" ? "Pending units" : "Units inwarded"} value={tab === "pending" ? pendingUnits : inwardedUnits} accent />
        <StatTile label="Units sent" value={totalUnits} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 border border-rlx-rule bg-white p-3 shadow-sm">
        <div className="inline-flex overflow-hidden rounded-lg border border-rlx-rule bg-white">
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
              className={`px-4 py-2 text-xs font-semibold uppercase tracking-widest transition ${
                tab === t.id ? "bg-rlx-green text-white" : "text-stone-600 hover:bg-stone-50"
              }`}
            >
              {t.label}
              {t.id === "pending" && tab === "pending" && rows.length > 0 ? (
                <span className="ml-2 rounded-full bg-rlx-gold px-1.5 py-0.5 text-[10px] font-bold text-rlx-green-deep">{rows.length}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full min-w-[220px] sm:w-80">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
          <input
            type="text"
            placeholder="Transfer#, GRN#, spare, part number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-rlx-rule bg-white py-2 pl-9 pr-3 text-sm text-stone-800 outline-none focus:border-rlx-green focus:ring-2 focus:ring-rlx-green/20"
          />
        </div>
      </div>

      {loading ? (
        <div className="border border-rlx-rule bg-white px-5 py-10 text-center text-sm text-stone-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-rlx-rule bg-white px-5 py-12 text-center text-sm text-stone-400">
          {rows.length === 0
            ? tab === "pending"
              ? "No transfers waiting for inward."
              : "No inwarded transfers yet."
            : "No records match your search."}
        </div>
      ) : (
        <div className="space-y-4">
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
