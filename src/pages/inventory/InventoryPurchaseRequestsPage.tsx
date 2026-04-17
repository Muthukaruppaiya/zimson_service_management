import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import { useEffect, useMemo, useState } from "react";

type PrItem = { id: string; spareId: string; qty: number; issuedQty: number; receivedQty: number; reason: string };
type PrRow = {
  id: string;
  prNumber: string;
  regionId: string;
  storeId: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PARTIAL" | "FULFILLED";
  neededBy: string | null;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: PrItem[];
};

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 focus:ring-2";

export function InventoryPurchaseRequestsPage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const isStore = user?.role === "store_user";
  const isHo = user?.role === "regional_admin" || user?.role === "super_admin";
  const [neededBy, setNeededBy] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Array<{ spareId: string; qty: string; reason: string }>>([
    { spareId: "", qty: "1", reason: "" },
  ]);
  const [prs, setPrs] = useState<PrRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailPrId, setDetailPrId] = useState<string | null>(null);
  const [fulfillPrId, setFulfillPrId] = useState<string | null>(null);
  const [fulfillQty, setFulfillQty] = useState<Record<string, string>>({});
  const [inwardPrId, setInwardPrId] = useState<string | null>(null);
  const [inwardQty, setInwardQty] = useState<Record<string, string>>({});

  const spareNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of spares) map.set(s.id, `${s.name} (${s.sku})`);
    return map;
  }, [spares]);

  async function loadPrs() {
    try {
      const data = await apiJson<{ prs: PrRow[] }>("/api/inventory/prs");
      setPrs(data.prs);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load PR queue.");
    }
  }

  useEffect(() => {
    void loadPrs();
  }, []);

  async function createPr(status: "DRAFT" | "SUBMITTED") {
    const parsed = lines
      .map((l) => ({ spareId: l.spareId, qty: Number(l.qty), reason: l.reason.trim() }))
      .filter((l) => l.spareId && !Number.isNaN(l.qty) && l.qty > 0);
    if (parsed.length === 0) {
      setErr("Add at least one valid PR line.");
      return;
    }
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const data = await apiJson<{ prNumber: string }>("/api/inventory/prs", {
        method: "POST",
        json: {
          status,
          neededBy: neededBy || null,
          notes,
          items: parsed,
        },
      });
      setOk(`PR ${data.prNumber} ${status === "DRAFT" ? "saved as draft" : "submitted"} successfully.`);
      setNeededBy("");
      setNotes("");
      setLines([{ spareId: "", qty: "1", reason: "" }]);
      await loadPrs();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not create PR.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(prId: string, status: PrRow["status"]) {
    setErr(null);
    setOk(null);
    try {
      await apiJson(`/api/inventory/prs/${encodeURIComponent(prId)}/status`, {
        method: "PATCH",
        json: { status },
      });
      setOk(`PR updated to ${status}.`);
      await loadPrs();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not update PR.");
    }
  }

  function openFulfill(pr: PrRow) {
    const initial: Record<string, string> = {};
    for (const i of pr.items) {
      const pending = Math.max(0, i.qty - i.issuedQty);
      if (pending > 0) initial[i.id] = String(pending);
    }
    setFulfillQty(initial);
    setFulfillPrId(pr.id);
  }

  async function fulfillPr(pr: PrRow) {
    setErr(null);
    setOk(null);
    const items = pr.items
      .map((i) => ({
        itemId: i.id,
        qty: Number(fulfillQty[i.id] ?? "0"),
      }))
      .filter((i) => i.qty > 0);
    if (items.length === 0) {
      setErr("Enter transfer qty for at least one line.");
      return;
    }
    try {
      const data = await apiJson<{ movedQty: number; status: string }>(`/api/inventory/prs/${encodeURIComponent(pr.id)}/fulfill`, {
        method: "POST",
        json: { items },
      });
      setOk(`Stock issued: ${data.movedQty}. PR status: ${data.status}.`);
      setFulfillPrId(null);
      await loadPrs();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not fulfill PR.");
    }
  }

  function openInward(pr: PrRow) {
    const initial: Record<string, string> = {};
    for (const i of pr.items) {
      const pending = Math.max(0, i.issuedQty - i.receivedQty);
      if (pending > 0) initial[i.id] = String(pending);
    }
    setInwardQty(initial);
    setInwardPrId(pr.id);
  }

  async function inwardPr(pr: PrRow) {
    setErr(null);
    setOk(null);
    const items = pr.items
      .map((i) => ({ itemId: i.id, qty: Number(inwardQty[i.id] ?? "0") }))
      .filter((i) => i.qty > 0);
    if (items.length === 0) {
      setErr("Enter inward qty for at least one line.");
      return;
    }
    try {
      const data = await apiJson<{ movedQty: number; status: string }>(`/api/inventory/prs/${encodeURIComponent(pr.id)}/inward`, {
        method: "POST",
        json: { items },
      });
      setOk(`Store inward done: ${data.movedQty}. PR status: ${data.status}.`);
      setInwardPrId(null);
      await loadPrs();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not inward PR.");
    }
  }

  return (
    <div>
      <InventoryBreadcrumb current="Purchase requests" />
      <PageHeader
        title="Purchase requests (PR)"
        description="Store raises material needs; HO receives them in the same regional bucket. No PO is created until HO converts an approved PR."
        actions={
          <Link
            to="/inventory"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Inventory home
          </Link>
        }
      />

      {isStore ? (
        <Card title="New PR from this store" subtitle="Save draft or submit to regional HO" className="mb-8">
          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div key={idx} className="grid gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-3 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <label className="text-xs font-medium text-stone-600">Spare</label>
                  <select
                    className={inputClass}
                    value={line.spareId}
                    onChange={(e) =>
                      setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, spareId: e.target.value } : x)))
                    }
                  >
                    <option value="">Select spare</option>
                    {spares.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.sku})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-stone-600">Qty</label>
                  <input
                    type="number"
                    min={0.001}
                    step={0.001}
                    className={inputClass}
                    value={line.qty}
                    onChange={(e) =>
                      setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))
                    }
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="text-xs font-medium text-stone-600">Reason</label>
                  <input
                    className={inputClass}
                    value={line.reason}
                    onChange={(e) =>
                      setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, reason: e.target.value } : x)))
                    }
                  />
                </div>
                <div className="sm:col-span-1 flex items-end">
                  <button
                    type="button"
                    className="w-full rounded-xl border border-stone-300 px-2 py-2 text-xs"
                    onClick={() => setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="rounded-xl border border-zimson-400 bg-white px-3 py-2 text-xs font-semibold text-zimson-900"
              onClick={() => setLines((prev) => [...prev, { spareId: "", qty: "1", reason: "" }])}
            >
              + Add line
            </button>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-stone-600">Needed by</label>
                <input type="date" className={inputClass} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600">Notes</label>
                <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void createPr("DRAFT")}
                className="rounded-xl border border-zimson-400 bg-white px-4 py-2 text-sm font-semibold text-zimson-900"
              >
                Save draft
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void createPr("SUBMITTED")}
                className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Submit to HO
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      {isHo ? (
        <Card title="HO — PR inbox" subtitle="Approve, reject, or ask revision before PO">
          <div className="max-h-[480px] overflow-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                <tr>
                  <th className="px-3 py-2">PR#</th>
                  <th className="px-3 py-2">Store</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Lines</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {prs.map((pr) => (
                  <tr key={pr.id} className="border-b border-zimson-100 align-top">
                    <td className="px-3 py-2 font-mono text-xs">{pr.prNumber}</td>
                    <td className="px-3 py-2">{pr.storeId}</td>
                    <td className="px-3 py-2">{pr.status}</td>
                    <td className="px-3 py-2">
                      {pr.items
                        .map((i) => `${spareNameById.get(i.spareId) ?? i.spareId} req:${i.qty} issued:${i.issuedQty} received:${i.receivedQty}`)
                        .join(", ")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailPrId((x) => (x === pr.id ? null : pr.id))}
                          className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-semibold text-stone-700"
                        >
                          Details
                        </button>
                        <button type="button" onClick={() => void updateStatus(pr.id, "APPROVED")} className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
                          Approve
                        </button>
                        <button type="button" onClick={() => void updateStatus(pr.id, "REJECTED")} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                          Reject
                        </button>
                        {(pr.status === "APPROVED" || pr.status === "PARTIAL" || pr.status === "SUBMITTED") ? (
                          <button type="button" onClick={() => openFulfill(pr)} className="rounded-lg bg-zimson-700 px-2 py-1 text-xs font-semibold text-white">
                            Fulfill
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {isHo && fulfillPrId ? (
        <Card title="Fulfill PR — choose transfer quantities" subtitle="Enter quantity per line to transfer from HO to store">
          {(() => {
            const pr = prs.find((p) => p.id === fulfillPrId);
            if (!pr) return <p className="text-sm text-stone-600">PR not found.</p>;
            return (
              <div className="space-y-3">
                {pr.items.map((i) => {
                  const pending = Math.max(0, i.qty - i.issuedQty);
                  return (
                    <div key={i.id} className="grid gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-3 sm:grid-cols-12">
                      <div className="sm:col-span-8">
                        <p className="text-sm font-medium text-stone-900">{spareNameById.get(i.spareId) ?? i.spareId}</p>
                        <p className="text-xs text-stone-600">Requested: {i.qty} · Issued: {i.issuedQty} · Pending: {pending}</p>
                      </div>
                      <div className="sm:col-span-4">
                        <label className="text-xs font-medium text-stone-600">Transfer qty</label>
                        <input
                          type="number"
                          min={0}
                          max={pending}
                          step={0.001}
                          className={inputClass}
                          value={fulfillQty[i.id] ?? "0"}
                          onChange={(e) => setFulfillQty((prev) => ({ ...prev, [i.id]: e.target.value }))}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="flex gap-2">
                  <button type="button" onClick={() => void fulfillPr(pr)} className="rounded-xl bg-zimson-700 px-4 py-2 text-sm font-semibold text-white">
                    Confirm transfer
                  </button>
                  <button type="button" onClick={() => setFulfillPrId(null)} className="rounded-xl border border-stone-300 px-4 py-2 text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            );
          })()}
        </Card>
      ) : null}

      {isStore && inwardPrId ? (
        <Card title="Store inward against PR transfer" subtitle="Confirm physically received quantity per line">
          {(() => {
            const pr = prs.find((p) => p.id === inwardPrId);
            if (!pr) return <p className="text-sm text-stone-600">PR not found.</p>;
            return (
              <div className="space-y-3">
                {pr.items.map((i) => {
                  const pending = Math.max(0, i.issuedQty - i.receivedQty);
                  return (
                    <div key={i.id} className="grid gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-3 sm:grid-cols-12">
                      <div className="sm:col-span-8">
                        <p className="text-sm font-medium text-stone-900">{spareNameById.get(i.spareId) ?? i.spareId}</p>
                        <p className="text-xs text-stone-600">Issued: {i.issuedQty} · Received: {i.receivedQty} · Pending inward: {pending}</p>
                      </div>
                      <div className="sm:col-span-4">
                        <label className="text-xs font-medium text-stone-600">Inward qty</label>
                        <input
                          type="number"
                          min={0}
                          max={pending}
                          step={0.001}
                          className={inputClass}
                          value={inwardQty[i.id] ?? "0"}
                          onChange={(e) => setInwardQty((prev) => ({ ...prev, [i.id]: e.target.value }))}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="flex gap-2">
                  <button type="button" onClick={() => void inwardPr(pr)} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
                    Confirm inward
                  </button>
                  <button type="button" onClick={() => setInwardPrId(null)} className="rounded-xl border border-stone-300 px-4 py-2 text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            );
          })()}
        </Card>
      ) : null}

      {isStore ? (
        <Card title="My PRs" subtitle="Drafts and submitted requests">
          <div className="max-h-[380px] overflow-auto rounded-xl border border-zimson-200/80">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                <tr>
                  <th className="px-3 py-2">PR#</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Lines</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {prs.map((pr) => (
                  <tr key={pr.id} className="border-b border-zimson-100">
                    <td className="px-3 py-2 font-mono text-xs">{pr.prNumber}</td>
                    <td className="px-3 py-2">{pr.status}</td>
                    <td className="px-3 py-2">{pr.items.length}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailPrId((x) => (x === pr.id ? null : pr.id))}
                          className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-semibold text-stone-700"
                        >
                          Details
                        </button>
                        {pr.status === "DRAFT" ? (
                          <button
                            type="button"
                            onClick={() => void updateStatus(pr.id, "SUBMITTED")}
                            className="rounded-lg bg-zimson-600 px-2 py-1 text-xs font-semibold text-white"
                          >
                            Submit
                          </button>
                        ) : null}
                        {pr.items.some((i) => i.issuedQty > i.receivedQty) ? (
                          <button
                            type="button"
                            onClick={() => openInward(pr)}
                            className="rounded-lg bg-emerald-700 px-2 py-1 text-xs font-semibold text-white"
                          >
                            Inward
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {!isStore && !isHo ? (
        <Card title="Access">
          <p className="text-sm text-stone-600">
            Sign in as a store user to raise PRs, or as regional / super admin to review HO inbox.
          </p>
        </Card>
      ) : null}

      {err ? <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      {ok ? <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p> : null}

      {detailPrId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            {(() => {
              const pr = prs.find((p) => p.id === detailPrId);
              if (!pr) {
                return (
                  <div>
                    <p className="text-sm text-stone-600">PR details not found.</p>
                    <button
                      type="button"
                      onClick={() => setDetailPrId(null)}
                      className="mt-4 rounded-xl border border-stone-300 px-4 py-2 text-sm"
                    >
                      Close
                    </button>
                  </div>
                );
              }
              return (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-stone-900">PR details — {pr.prNumber}</h3>
                      <p className="text-sm text-stone-600">
                        Store: {pr.storeId} · Region: {pr.regionId} · Status: {pr.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailPrId(null)}
                      className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid gap-3 rounded-xl border border-zimson-200/80 bg-zimson-50/40 p-4 sm:grid-cols-2">
                    <p className="text-sm text-stone-700">
                      <span className="font-semibold">Needed by:</span> {pr.neededBy ?? "-"}
                    </p>
                    <p className="text-sm text-stone-700">
                      <span className="font-semibold">Created:</span> {new Date(pr.createdAt).toLocaleString()}
                    </p>
                    <p className="text-sm text-stone-700 sm:col-span-2">
                      <span className="font-semibold">Notes:</span> {pr.notes || "-"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zimson-200/80">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-zimson-200 bg-zimson-50/95 text-xs font-semibold uppercase text-stone-600">
                        <tr>
                          <th className="px-3 py-2">Spare</th>
                          <th className="px-3 py-2">Requested</th>
                          <th className="px-3 py-2">Issued</th>
                          <th className="px-3 py-2">Received</th>
                          <th className="px-3 py-2">Pending</th>
                          <th className="px-3 py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pr.items.map((i) => (
                          <tr key={i.id} className="border-b border-zimson-100">
                            <td className="px-3 py-2">{spareNameById.get(i.spareId) ?? i.spareId}</td>
                            <td className="px-3 py-2">{i.qty}</td>
                            <td className="px-3 py-2">{i.issuedQty}</td>
                            <td className="px-3 py-2">{i.receivedQty}</td>
                            <td className="px-3 py-2">{Math.max(0, i.qty - i.receivedQty)}</td>
                            <td className="px-3 py-2">{i.reason || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
