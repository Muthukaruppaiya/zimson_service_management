import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ListPageShell } from "../../components/layout/ListPageShell";
import { IconTrash } from "../../components/ui/TableActionIcons";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { SRF_MIN_WATCH_PHOTOS_REQUIRED } from "../../lib/srfPhotoSlots";

type QuickBillDraftRow = {
  id: string;
  regionId: string;
  storeId: string;
  createdBy: string | null;
  customerName: string;
  phone: string;
  watchLabel: string;
  captureSessionId: string | null;
  watchPhotoCount: number;
  createdAt: string;
  updatedAt: string;
};

function formatDraftTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function QuickBillDraftsPage() {
  const apiMode = useApiMode();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<QuickBillDraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiMode) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ drafts: QuickBillDraftRow[] }>("/api/service/quick-bill-drafts");
      setDrafts(data.drafts ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load drafts.");
    } finally {
      setLoading(false);
    }
  }, [apiMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return drafts;
    return drafts.filter((d) => {
      const hay = `${d.customerName} ${d.phone} ${d.watchLabel}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [drafts, query]);

  function openDraft(id: string) {
    navigate(`/service/quick-bill?draft=${encodeURIComponent(id)}`);
  }

  async function deleteDraft(d: QuickBillDraftRow) {
    if (!window.confirm(`Delete draft for ${d.customerName || "customer"} (${d.watchLabel || "watch"})?`)) return;
    setBusyId(d.id);
    try {
      await apiJson(`/api/service/quick-bill-drafts/${encodeURIComponent(d.id)}`, { method: "DELETE" });
      setDrafts((prev) => prev.filter((x) => x.id !== d.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete draft.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ListPageShell
      breadcrumb="Quick bill drafts"
      eyebrow="Service"
      title="Quick Bill Drafts"
      actions={
        <Link
          to="/service/quick-bill"
          className="inline-flex items-center justify-center border border-rlx-gold bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-rlx-green transition hover:bg-rlx-green-light"
        >
          New Quick Bill
        </Link>
      }
      countLabel={`${filtered.length} Open Draft${filtered.length === 1 ? "" : "s"}`}
      error={error}
      loading={loading}
      isEmpty={!loading && filtered.length === 0}
      emptyMessage={query.trim() ? "No drafts match the search." : "No open drafts."}
    >
      <div className="mb-3 max-w-md">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer, mobile or watch"
          className="w-full border border-rlx-rule bg-white px-3 py-2 text-sm outline-none focus:border-rlx-green"
        />
      </div>
      {filtered.length > 0 ? (
        <div className="overflow-x-auto border border-rlx-rule bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-stone-50 text-left text-[10px] font-bold uppercase tracking-wider text-stone-500">
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Mobile</th>
                <th className="px-3 py-2.5">Watch</th>
                <th className="px-3 py-2.5">Photos</th>
                <th className="px-3 py-2.5">Saved</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((d) => {
                const photosOk = d.watchPhotoCount >= SRF_MIN_WATCH_PHOTOS_REQUIRED;
                return (
                  <tr
                    key={d.id}
                    onClick={() => openDraft(d.id)}
                    className="cursor-pointer transition hover:bg-rlx-green-light/40"
                  >
                    <td className="px-3 py-2.5 font-semibold text-stone-900">{d.customerName || "Customer"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-stone-700">{d.phone || "—"}</td>
                    <td className="px-3 py-2.5 text-stone-700">{d.watchLabel || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                          photosOk
                            ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                            : "bg-amber-50 text-amber-900 ring-amber-200"
                        }`}
                      >
                        {d.watchPhotoCount} Photos
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-600">{formatDraftTime(d.updatedAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openDraft(d.id)}
                          className="bg-rlx-green px-3 py-1 text-xs font-semibold text-white hover:bg-rlx-green-deep"
                        >
                          Resume
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteDraft(d)}
                          disabled={busyId === d.id}
                          className="border border-stone-300 bg-white p-1.5 text-stone-600 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
                          aria-label="Delete draft"
                          title="Delete draft"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </ListPageShell>
  );
}
