import { Link, useNavigate } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import { buildPrDocument, buildTransferDocument, openPrintDocument } from "../../lib/inventoryDocuments";
import { useEffect, useMemo, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

type PrItem = { id: string; spareId: string; qty: number; issuedQty: number; receivedQty: number; reason: string };
type PrRow = {
  id: string;
  prNumber: string;
  regionId: string;
  regionName?: string;
  storeId: string;
  storeName?: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PARTIAL" | "FULFILLED" | "GOODS_AT_HO";
  internalStatusCode?: string;
  internalStatusLabel?: string;
  neededBy: string | null;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: PrItem[];
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const inputCls = "mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/30 transition-colors";
const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-stone-500";

const STATUS_LABEL: Record<string, string> = {
  DRAFT:        "Draft",
  SUBMITTED:    "Waiting for Approval",
  APPROVED:     "Waiting for PO Conversion",
  REJECTED:     "Rejected",
  GOODS_AT_HO:  "Goods at HO — Awaiting Transfer",
  PARTIAL:      "Partially Delivered to Store",
  FULFILLED:    "Delivered to Store",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT:        "border-stone-300 bg-stone-50 text-stone-500",
  SUBMITTED:    "border-amber-400 bg-amber-50 text-amber-700",
  APPROVED:     "border-blue-300 bg-blue-50 text-blue-700",
  REJECTED:     "border-red-300 bg-red-50 text-red-700",
  GOODS_AT_HO:  "border-indigo-300 bg-indigo-50 text-indigo-700",
  PARTIAL:      "border-purple-300 bg-purple-50 text-purple-700",
  FULFILLED:    "border-rlx-green bg-rlx-green/10 text-rlx-green",
};

function statusBadge(status: PrRow["status"]) {
  return `inline-block border px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${STATUS_COLOR[status] ?? STATUS_COLOR.DRAFT}`;
}

function statusLabel(status: PrRow["status"]) {
  return STATUS_LABEL[status] ?? status;
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function InventoryPrHistoryPage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const navigate = useNavigate();

  const isHo = user?.role === "super_admin" || user?.role === "admin" || user?.role === "ho_manager" || user?.role === "ho_purchase";
  // Only ho_manager/admin can approve or reject
  const canApprove = user?.role === "ho_manager" || user?.role === "super_admin" || user?.role === "admin";
  // ho_purchase can also fulfil (HO→Store stock transfer)
  const canFulfil = canApprove || user?.role === "ho_purchase";
  const isStore = user?.role === "store_user" || user?.role === "store_manager" || user?.role === "store_accounts";

  const [prs, setPrs] = useState<PrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [detailPrId, setDetailPrId] = useState<string | null>(null);
  const [fulfillPrId, setFulfillPrId] = useState<string | null>(null);
  const [fulfillQty, setFulfillQty] = useState<Record<string, string>>({});
  const [hoStockByItem, setHoStockByItem] = useState<Record<string, number>>({});
  const [hoStockLoading, setHoStockLoading] = useState(false);
  const [inwardPrId, setInwardPrId] = useState<string | null>(null);
  const [inwardQty, setInwardQty] = useState<Record<string, string>>({});
  const [remindingPrId, setRemindingPrId] = useState<string | null>(null);

  const spareNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of spares) map.set(s.id, `${s.name} (${s.sku})`);
    return map;
  }, [spares]);

  async function loadPrs() {
    setLoading(true);
    try {
      const data = await apiJson<{ prs: PrRow[] }>("/api/inventory/prs");
      setPrs(data.prs);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load PRs.");
    } finally { setLoading(false); }
  }

  async function sendReminder(prId: string) {
    setRemindingPrId(prId);
    setErr(null); setOk(null);
    try {
      await apiJson(`/api/inventory/prs/${encodeURIComponent(prId)}/remind`, { method: "POST" });
      setOk("Reminder sent to HO Manager.");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not send reminder.");
    } finally { setRemindingPrId(null); }
  }

  useEffect(() => { void loadPrs(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return prs.filter((pr) => {
      if (statusFilter !== "ALL" && pr.status !== statusFilter) return false;
      if (!q) return true;
      return (
        pr.prNumber.toLowerCase().includes(q) ||
        (pr.storeName ?? "").toLowerCase().includes(q) ||
        (pr.regionName ?? "").toLowerCase().includes(q)
      );
    });
  }, [prs, search, statusFilter]);

  async function updateStatus(prId: string, status: PrRow["status"]) {
    setErr(null); setOk(null);
    try {
      await apiJson(`/api/inventory/prs/${encodeURIComponent(prId)}/status`, { method: "PATCH", json: { status } });
      setOk(`PR updated — ${statusLabel(status)}.`);
      await loadPrs();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not update PR."); }
  }

  async function openFulfill(pr: PrRow) {
    const initial: Record<string, string> = {};
    for (const i of pr.items) { const p = Math.max(0, i.qty - i.issuedQty); if (p > 0) initial[i.id] = String(p); }
    setFulfillQty(initial);
    setHoStockLoading(true);
    try {
      const data = await apiJson<{ rows: Array<{ itemId: string; hoAvailable: number }> }>(
        `/api/inventory/prs/${encodeURIComponent(pr.id)}/ho-stock`,
      );
      setHoStockByItem(Object.fromEntries(data.rows.map((r) => [r.itemId, r.hoAvailable])));
    } catch { setHoStockByItem({}); }
    finally { setHoStockLoading(false); }
    setFulfillPrId(pr.id);
  }

  async function fulfillPr(pr: PrRow) {
    setErr(null); setOk(null);
    const items = pr.items.map((i) => ({ itemId: i.id, qty: Number(fulfillQty[i.id] ?? "0") })).filter((i) => i.qty > 0);
    if (items.length === 0) { setErr("Enter qty for at least one line."); return; }
    try {
      const data = await apiJson<{ movedQty: number; status: string }>(`/api/inventory/prs/${encodeURIComponent(pr.id)}/fulfill`, {
        method: "POST", json: { items },
      });
      setOk(`Stock issued: ${data.movedQty}. PR status: ${data.status}.`);
      openPrintDocument(`Transfer ${pr.prNumber}`, buildTransferDocument({
        refNumber: pr.prNumber,
        date: new Date().toISOString(),
        fromLocation: `HO: ${pr.regionName ?? pr.regionId}`,
        toLocation: `STORE: ${pr.storeName ?? pr.storeId}`,
        lines: items.map((it) => {
          const line = pr.items.find((x) => x.id === it.itemId);
          return { description: spareNameById.get(line?.spareId ?? "") ?? it.itemId, qty: it.qty };
        }),
      }));
      setFulfillPrId(null);
      await loadPrs();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not fulfill PR."); }
  }

  function openInward(pr: PrRow) {
    const initial: Record<string, string> = {};
    for (const i of pr.items) { const p = Math.max(0, i.issuedQty - i.receivedQty); if (p > 0) initial[i.id] = String(p); }
    setInwardQty(initial);
    setInwardPrId(pr.id);
  }

  async function inwardPr(pr: PrRow) {
    setErr(null); setOk(null);
    const items = pr.items.map((i) => ({ itemId: i.id, qty: Number(inwardQty[i.id] ?? "0") })).filter((i) => i.qty > 0);
    if (items.length === 0) { setErr("Enter inward qty for at least one line."); return; }
    try {
      const data = await apiJson<{ movedQty: number; status: string }>(`/api/inventory/prs/${encodeURIComponent(pr.id)}/inward`, {
        method: "POST", json: { items },
      });
      setOk(`Store inward done: ${data.movedQty}. PR status: ${data.status}.`);
      setInwardPrId(null);
      await loadPrs();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not inward PR."); }
  }

  const statuses = ["ALL", "SUBMITTED", "APPROVED", "GOODS_AT_HO", "PARTIAL", "FULFILLED", "REJECTED", "DRAFT"];

  return (
    <div>
      <InventoryBreadcrumb current="PR History" />
      <PageHeader
        title="Purchase Request History"
        description=""
        actions={
          <div className="flex gap-2">
            {isStore && (
              <Link
                to="/inventory/purchase-requests"
                className="bg-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:bg-rlx-green/90 transition"
              >
                + New PR
              </Link>
            )}
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

      {/* Messages */}
      {ok && <div className="mb-4 border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">✓ {ok}</div>}
      {err && <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div>}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400">
            <circle cx="6.5" cy="6.5" r="4.5" /><line x1="10" y1="10" x2="14" y2="14" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PR#, store or region…"
            className="w-full border border-rlx-rule bg-white py-2 pl-9 pr-3 text-sm text-stone-800 outline-none focus:border-rlx-green"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${
                statusFilter === s
                  ? "border-rlx-green bg-rlx-green text-white"
                  : "border-rlx-rule bg-white text-stone-500 hover:border-rlx-green/50"
              }`}
            >
              {s === "ALL" ? "All" : statusLabel(s as PrRow["status"])}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void loadPrs()}
          className="border border-rlx-rule px-3 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-50 transition"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {/* Table */}
      <div className="border border-rlx-rule bg-white shadow-sm">
        <div className="border-b border-rlx-rule bg-rlx-green px-5 py-3.5 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">
            {isHo ? "HO — PR Inbox & History" : "Store PR History"}
          </h3>
          <span className="border border-white/30 px-2 py-0.5 text-[10px] font-bold text-white/70">{filtered.length}</span>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">No PRs found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  <th className="px-5 py-3 text-left">PR#</th>
                  {isHo && <th className="px-5 py-3 text-left">Store</th>}
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Items</th>
                  <th className="px-5 py-3 text-left">Needed By</th>
                  <th className="px-5 py-3 text-left">Created</th>
                  <th className="px-5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((pr) => {
                  const canApproveReject = canApprove && pr.status === "SUBMITTED";
                  // Fulfil = HO→Store transfer: available when goods are at HO (GOODS_AT_HO or PARTIAL)
                  const canFulfill = canFulfil && (pr.status === "GOODS_AT_HO" || pr.status === "PARTIAL");
                  const canInward = isStore && pr.items.some((i) => i.issuedQty > i.receivedQty);
                  return (
                    <tr key={pr.id} className="border-b border-rlx-rule last:border-0 hover:bg-stone-50/50 transition align-top">
                      <td className="px-5 py-3 font-mono text-xs font-bold text-rlx-green">{pr.prNumber}</td>
                      {isHo && (
                        <td className="px-5 py-3">
                          <p className="font-medium text-stone-800">{pr.storeName ?? pr.storeId}</p>
                          <p className="text-[11px] text-stone-400">{pr.regionName ?? pr.regionId}</p>
                        </td>
                      )}
                      <td className="px-5 py-3">
                        <span className={statusBadge(pr.status)}>{statusLabel(pr.status)}</span>
                        {pr.internalStatusLabel && (
                          <p className="mt-0.5 text-[10px] text-stone-400">{pr.internalStatusLabel}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-stone-600">
                        {pr.items.length} item{pr.items.length !== 1 ? "s" : ""}
                      </td>
                      <td className="px-5 py-3 text-xs text-stone-500">{pr.neededBy ?? "—"}</td>
                      <td className="px-5 py-3 text-xs text-stone-500">
                        {new Date(pr.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailPrId((x) => (x === pr.id ? null : pr.id))}
                            className="border border-rlx-rule px-2.5 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-50 transition"
                          >
                            Details
                          </button>
                          {isStore && pr.status === "SUBMITTED" && (
                            <button
                              type="button"
                              disabled={remindingPrId === pr.id}
                              onClick={() => void sendReminder(pr.id)}
                              title="Send reminder to HO Manager"
                              className="flex items-center gap-1 border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition disabled:opacity-50"
                            >
                              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3">
                                <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.2 3.2l.7.7M12.1 12.1l.7.7M12.1 3.9l-.7.7M4.6 12.1l-.7.7" strokeLinecap="round"/>
                                <circle cx="8" cy="8" r="3" />
                              </svg>
                              {remindingPrId === pr.id ? "Sending…" : "Remind"}
                            </button>
                          )}
                          {canApprove && (
                            <>
                              <button
                                type="button"
                                disabled={!canApproveReject}
                                onClick={() => void updateStatus(pr.id, "APPROVED")}
                                className={`px-2.5 py-1 text-[11px] font-semibold text-white transition ${canApproveReject ? "bg-rlx-green hover:bg-rlx-green-deep" : "bg-stone-200 text-stone-400 cursor-not-allowed"}`}
                              >Approve</button>
                              <button
                                type="button"
                                disabled={!canApproveReject}
                                onClick={() => void updateStatus(pr.id, "REJECTED")}
                                className={`px-2.5 py-1 text-[11px] font-semibold text-white transition ${canApproveReject ? "bg-red-600 hover:bg-red-700" : "bg-stone-200 text-stone-400 cursor-not-allowed"}`}
                              >Reject</button>
                            </>
                          )}
                          {canFulfil && (
                            <button
                              type="button"
                              disabled={!canFulfill}
                              onClick={() => void openFulfill(pr)}
                              title={!canFulfill ? `Fulfil is available when PR is Approved or Partially Fulfilled` : "Transfer stock from HO to Store"}
                              className={`px-2.5 py-1 text-[11px] font-semibold text-white transition ${canFulfill ? "bg-rlx-green hover:bg-rlx-green/90" : "bg-stone-200 text-stone-400 cursor-not-allowed"}`}
                            >Fulfil</button>
                          )}
                          {canInward && (
                            <button
                              type="button"
                              onClick={() => openInward(pr)}
                              className="bg-rlx-green px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rlx-green/90 transition"
                            >Inward</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ── */}

      {/* Detail Modal */}
      {detailPrId && (() => {
        const pr = prs.find((p) => p.id === detailPrId);
        if (!pr) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailPrId(null); }}
          >
            <div className="w-full max-w-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="bg-rlx-green px-6 py-4 shrink-0 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-white">{pr.prNumber}</h3>
                  <p className="text-[11px] text-white/60 mt-0.5">{pr.storeName ?? pr.storeId} · {pr.regionName ?? pr.regionId}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openPrintDocument(`PR ${pr.prNumber}`, buildPrDocument({
                      prNumber: pr.prNumber, createdAt: pr.createdAt,
                      regionId: pr.regionId, regionName: pr.regionName,
                      storeId: pr.storeId, storeName: pr.storeName,
                      neededBy: pr.neededBy, notes: pr.notes,
                      lines: pr.items.map((i) => ({ description: spareNameById.get(i.spareId) ?? i.spareId, qty: i.qty, reason: i.reason })),
                    }))}
                    className="border border-white/30 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10 transition"
                  >Print</button>
                  <button type="button" onClick={() => setDetailPrId(null)} className="text-white/70 hover:text-white text-xl">×</button>
                </div>
              </div>
              <div className="overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-4 border-b border-rlx-rule px-6 py-4 text-sm">
                  <div>
                    <span className="text-[11px] font-bold uppercase text-stone-400">Status</span>
                    <p className="mt-1"><span className={statusBadge(pr.status)}>{statusLabel(pr.status)}</span></p>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase text-stone-400">Needed By</span>
                    <p className="mt-1 text-stone-700">{pr.neededBy ?? "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[11px] font-bold uppercase text-stone-400">Notes</span>
                    <p className="mt-1 text-stone-700">{pr.notes || "—"}</p>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                      <th className="px-6 py-3 text-left">Spare</th>
                      <th className="px-4 py-3 text-center">Req</th>
                      <th className="px-4 py-3 text-center">Issued</th>
                      <th className="px-4 py-3 text-center">Received</th>
                      <th className="px-4 py-3 text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pr.items.map((i) => (
                      <tr key={i.id} className="border-b border-rlx-rule last:border-0">
                        <td className="px-6 py-3 font-medium text-stone-800">{spareNameById.get(i.spareId) ?? i.spareId}</td>
                        <td className="px-4 py-3 text-center">{i.qty}</td>
                        <td className="px-4 py-3 text-center">{i.issuedQty}</td>
                        <td className="px-4 py-3 text-center">{i.receivedQty}</td>
                        <td className="px-4 py-3 text-xs text-stone-500">{i.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="shrink-0 border-t border-rlx-rule bg-rlx-bg px-6 py-4">
                <button type="button" onClick={() => setDetailPrId(null)} className="border border-rlx-rule px-5 py-2 text-sm text-stone-600 hover:bg-stone-50 transition">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Fulfil Modal */}
      {canFulfil && fulfillPrId && (() => {
        const pr = prs.find((p) => p.id === fulfillPrId);
        if (!pr) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setFulfillPrId(null); }}
          >
            <div className="w-full max-w-xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="bg-rlx-green px-6 py-4 shrink-0 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wide text-white">Fulfil PR — {pr.prNumber}</h3>
                <button type="button" onClick={() => setFulfillPrId(null)} className="text-white/70 hover:text-white text-xl">×</button>
              </div>
              <div className="overflow-y-auto flex-1 p-5 space-y-3">
                {pr.items.map((i) => {
                  const pending = Math.max(0, i.qty - i.issuedQty);
                  const hoStock = hoStockLoading ? null : (hoStockByItem[i.id] ?? 0);
                  return (
                    <div key={i.id} className="border border-rlx-rule p-4">
                      <p className="font-semibold text-stone-800">{spareNameById.get(i.spareId) ?? i.spareId}</p>
                      <div className="mt-1 flex flex-wrap gap-4 text-xs text-stone-500">
                        <span>Requested: <strong>{i.qty}</strong></span>
                        <span>Issued: <strong>{i.issuedQty}</strong></span>
                        <span>Pending: <strong>{pending}</strong></span>
                        <span>HO Stock: <strong className={hoStock === 0 ? "text-red-600" : "text-blue-700"}>{hoStock ?? "…"}</strong></span>
                      </div>
                      <div className="mt-3">
                        <label className={labelCls}>Transfer Qty</label>
                        <input type="number" min={0} max={pending} step={1} className={inputCls}
                          value={fulfillQty[i.id] ?? "0"}
                          onChange={(e) => setFulfillQty((prev) => ({ ...prev, [i.id]: e.target.value }))}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="shrink-0 flex gap-3 border-t border-rlx-rule bg-rlx-bg px-6 py-4">
                <button type="button" onClick={() => void fulfillPr(pr)} className="bg-rlx-green px-6 py-2 text-sm font-semibold text-white hover:bg-rlx-green/90 transition">Confirm Transfer</button>
                <button type="button" onClick={() => setFulfillPrId(null)} className="border border-rlx-rule px-5 py-2 text-sm text-stone-600 hover:bg-stone-50 transition">Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Inward Modal */}
      {isStore && inwardPrId && (() => {
        const pr = prs.find((p) => p.id === inwardPrId);
        if (!pr) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setInwardPrId(null); }}
          >
            <div className="w-full max-w-xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="bg-rlx-green px-6 py-4 shrink-0 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wide text-white">Store Inward — {pr.prNumber}</h3>
                <button type="button" onClick={() => setInwardPrId(null)} className="text-white/70 hover:text-white text-xl">×</button>
              </div>
              <div className="overflow-y-auto flex-1 p-5 space-y-3">
                {pr.items.map((i) => {
                  const pending = Math.max(0, i.issuedQty - i.receivedQty);
                  return (
                    <div key={i.id} className="border border-rlx-rule p-4">
                      <p className="font-semibold text-stone-800">{spareNameById.get(i.spareId) ?? i.spareId}</p>
                      <div className="mt-1 flex flex-wrap gap-4 text-xs text-stone-500">
                        <span>Issued: <strong>{i.issuedQty}</strong></span>
                        <span>Received: <strong>{i.receivedQty}</strong></span>
                        <span>Pending: <strong>{pending}</strong></span>
                      </div>
                      <div className="mt-3">
                        <label className={labelCls}>Inward Qty</label>
                        <input type="number" min={0} max={pending} step={1} className={inputCls}
                          value={inwardQty[i.id] ?? "0"}
                          onChange={(e) => setInwardQty((prev) => ({ ...prev, [i.id]: e.target.value }))}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="shrink-0 flex gap-3 border-t border-rlx-rule bg-rlx-bg px-6 py-4">
                <button type="button" onClick={() => void inwardPr(pr)} className="bg-rlx-green px-6 py-2 text-sm font-semibold text-white hover:bg-rlx-green-deep transition">Confirm Inward</button>
                <button type="button" onClick={() => setInwardPrId(null)} className="border border-rlx-rule px-5 py-2 text-sm text-stone-600 hover:bg-stone-50 transition">Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
