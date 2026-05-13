import { Link, useNavigate } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson } from "../../lib/api";
import { buildPrDocument, openPrintDocument } from "../../lib/inventoryDocuments";
import { useEffect, useMemo, useRef, useState } from "react";

// ── Styles ──────────────────────────────────────────────────────────────────

const inputCls =
  "mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/30 transition-colors";
const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-stone-500";

// ── Searchable Spare Picker ─────────────────────────────────────────────────

function SparePicker({
  value,
  onChange,
  spares,
}: {
  value: string;
  onChange: (id: string) => void;
  spares: Array<{ id: string; name: string; sku: string; category?: string }>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = spares.find((s) => s.id === value);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return spares.slice(0, 60);
    return spares
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.sku.toLowerCase().includes(q) ||
          (s.category ?? "").toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [query, spares]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function pick(id: string) { onChange(id); setQuery(""); setOpen(false); }

  return (
    <div ref={ref} className="relative mt-1">
      <div
        className="flex cursor-pointer items-center justify-between border border-rlx-rule bg-white px-3 py-2 text-sm transition hover:border-rlx-green"
        onClick={() => { setOpen((v) => !v); setTimeout(() => inputRef.current?.focus(), 40); }}
      >
        {selected ? (
          <span className="truncate">
            <span className="font-medium text-stone-800">{selected.name}</span>
            <span className="ml-2 font-mono text-[11px] text-stone-400">{selected.sku}</span>
          </span>
        ) : (
          <span className="text-stone-400">Search spare by name, SKU or category…</span>
        )}
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="ml-2 h-3.5 w-3.5 shrink-0 text-stone-400">
          <polyline points="4 6 8 10 12 6" />
        </svg>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 border border-rlx-rule bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-rlx-rule px-3 py-2">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5 shrink-0 text-stone-400">
              <circle cx="6.5" cy="6.5" r="4.5" /><line x1="10" y1="10" x2="14" y2="14" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type name, SKU or category…"
              className="w-full bg-transparent text-sm text-stone-800 outline-none placeholder-stone-400"
            />
            {query && <button type="button" onClick={() => setQuery("")} className="text-stone-400 hover:text-stone-600 text-sm">✕</button>}
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-xs text-stone-400">No spares match "{query}"</li>
            ) : filtered.map((s) => (
              <li
                key={s.id}
                onMouseDown={() => pick(s.id)}
                className={`flex cursor-pointer items-center justify-between border-b border-rlx-rule px-4 py-2.5 text-sm hover:bg-rlx-green/5 last:border-0 ${s.id === value ? "bg-rlx-green/10" : ""}`}
              >
                <div>
                  <span className="font-medium text-stone-800">{s.name}</span>
                  {s.category && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-stone-400">{s.category}</span>}
                </div>
                <span className="ml-4 shrink-0 font-mono text-[11px] text-stone-400">{s.sku}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Success Popup ───────────────────────────────────────────────────────────

function PrSuccessModal({
  prNumber,
  onClose,
  onPrintAndClose,
}: {
  prNumber: string;
  onClose: () => void;
  onPrintAndClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="w-full max-w-sm bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-rlx-green px-6 py-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/30 bg-white/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" className="h-7 w-7">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-base font-semibold uppercase tracking-[0.15em] text-white">PR Submitted to HO</h2>
        </div>
        {/* Body */}
        <div className="px-6 py-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">Purchase Request Number</p>
          <p className="mt-2 font-mono text-2xl font-bold text-rlx-green">{prNumber}</p>
          <p className="mt-3 text-sm text-stone-500">Your request has been sent to HO for review and fulfilment.</p>
        </div>
        {/* Footer */}
        <div className="flex gap-2 border-t border-rlx-rule bg-rlx-bg px-6 py-4">
          <button
            type="button"
            onClick={onPrintAndClose}
            className="flex-1 border border-rlx-rule bg-white py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition"
          >
            Print & Close
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-rlx-green py-2 text-sm font-semibold text-white hover:bg-rlx-green/90 transition"
          >
            Create Another PR
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function InventoryPurchaseRequestsPage() {
  const { user } = useAuth();
  const { spares } = useSpares();
  const navigate = useNavigate();

  const canCreate =
    user?.role === "store_user" ||
    user?.role === "store_manager" ||
    user?.role === "store_accounts";

  const [neededBy, setNeededBy] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Array<{ spareId: string; qty: string; reason: string }>>([
    { spareId: "", qty: "1", reason: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createdPr, setCreatedPr] = useState<{
    prNumber: string;
    neededBy: string | null;
    notes: string;
    lines: Array<{ spareId: string; qty: number; reason: string }>;
  } | null>(null);

  const minNeededByDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const spareNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of spares) map.set(s.id, `${s.name} (${s.sku})`);
    return map;
  }, [spares]);

  async function createPr() {
    const parsed = lines
      .map((l) => ({ spareId: l.spareId, qty: Number(l.qty), reason: l.reason.trim() }))
      .filter((l) => l.spareId && !Number.isNaN(l.qty) && l.qty > 0);
    if (parsed.length === 0) { setErr("Add at least one spare item with a valid quantity."); return; }
    setBusy(true); setErr(null);
    try {
      const data = await apiJson<{ prNumber: string }>("/api/inventory/prs", {
        method: "POST",
        json: { neededBy: neededBy || null, notes, items: parsed },
      });
      setCreatedPr({ prNumber: data.prNumber, neededBy: neededBy || null, notes, lines: parsed });
      // Reset form
      setNeededBy(""); setNotes(""); setLines([{ spareId: "", qty: "1", reason: "" }]);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not create PR.");
    } finally { setBusy(false); }
  }

  function handlePrintAndClose() {
    if (!createdPr) return;
    openPrintDocument(`PR ${createdPr.prNumber}`, buildPrDocument({
      prNumber: createdPr.prNumber,
      createdAt: new Date().toISOString(),
      regionId: user?.regionId ?? "-",
      storeId: user?.storeId ?? "-",
      regionName: user?.regionId ?? "-",
      storeName: user?.storeId ?? "-",
      neededBy: createdPr.neededBy,
      notes: createdPr.notes,
      lines: createdPr.lines.map((p) => ({
        description: spareNameById.get(p.spareId) ?? p.spareId,
        qty: p.qty,
        reason: p.reason,
      })),
    }));
    setCreatedPr(null);
  }

  if (!canCreate) {
    return (
      <div>
        <InventoryBreadcrumb current="Purchase requests" />
        <PageHeader title="Purchase Requests" description="" />
        <div className="border border-rlx-rule bg-white px-6 py-10 text-center text-sm text-stone-400">
          Only store users can create purchase requests.
          <div className="mt-4">
            <Link to="/inventory" className="font-semibold text-rlx-green hover:underline">← Back to Inventory</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb current="Purchase requests" />
      <PageHeader
        title="New Purchase Request"
        description=""
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/inventory/pr-history"
              className="border border-rlx-green px-4 py-2 text-xs font-semibold uppercase tracking-widest text-rlx-green hover:bg-rlx-green/5 transition"
            >
              PR History
            </Link>
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

      {/* Error */}
      {err && (
        <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          ✕ {err}
        </div>
      )}

      {/* PR Form */}
      <div className="border border-rlx-rule bg-white shadow-sm">
        {/* Form header */}
        <div className="border-b border-rlx-rule bg-rlx-green px-5 py-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">Spare Items Required</h3>
          <p className="mt-0.5 text-[11px] text-white/55"></p>
        </div>

        <div className="p-5 space-y-3">
          {/* Lines */}
          {lines.map((line, idx) => (
            <div key={idx} className="border border-rlx-rule bg-stone-50/40 p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Item {idx + 1}</span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                    className="text-[11px] font-semibold text-red-400 hover:text-red-600 transition"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-12">
                <div className="sm:col-span-6">
                  <label className={labelCls}>Spare Part</label>
                  <SparePicker
                    value={line.spareId}
                    onChange={(id) => setLines((p) => p.map((x, i) => (i === idx ? { ...x, spareId: id } : x)))}
                    spares={spares}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Qty</label>
                  <input
                    type="number" min={1} step={1}
                    className={inputCls}
                    value={line.qty}
                    onChange={(e) => setLines((p) => p.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))}
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className={labelCls}>Reason (optional)</label>
                  <input
                    className={inputCls}
                    placeholder="e.g. Customer repair SRF-0123"
                    value={line.reason}
                    onChange={(e) => setLines((p) => p.map((x, i) => (i === idx ? { ...x, reason: e.target.value } : x)))}
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Add line */}
          <button
            type="button"
            onClick={() => setLines((p) => [...p, { spareId: "", qty: "1", reason: "" }])}
            className="flex w-full items-center justify-center gap-2 border border-dashed border-rlx-rule py-3 text-xs font-semibold text-stone-400 hover:border-rlx-green hover:text-rlx-green transition"
          >
            + Add Another Item
          </button>

          {/* Needed By + Notes */}
          <div className="grid gap-4 border-t border-rlx-rule pt-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Needed By Date (optional)</label>
              <input type="date" min={minNeededByDate} className={inputCls} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Notes for HO (optional)</label>
              <input className={inputCls} placeholder="Any special instructions…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4 border-t border-rlx-rule pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void createPr()}
              className="bg-rlx-green px-8 py-2.5 text-sm font-semibold text-white hover:bg-rlx-green/90 transition disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit PR to HO"}
            </button>
            <Link
              to="/inventory/pr-history"
              className="text-sm font-semibold text-rlx-green hover:underline"
            >
              View PR History →
            </Link>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {createdPr && (
        <PrSuccessModal
          prNumber={createdPr.prNumber}
          onClose={() => setCreatedPr(null)}
          onPrintAndClose={handlePrintAndClose}
        />
      )}
    </div>
  );
}
