import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { clearRecentLookups, loadRecentLookups, pushRecentLookup, type RecentLookup } from "../../lib/dashboardRecentLookups";
import type { QuickBillHistoryRow } from "../../types/quickBill";
import { destinationFor, type HitKind } from "./GlobalSearch";

type Filter = "ALL" | HitKind;

type PaletteHit = {
  kind: HitKind;
  primary: string;
  secondary: string;
  status?: string;
  to: string;
  rank: number;
};

const KIND_ORDER: HitKind[] = ["SRF", "DC", "ODC", "QB"];

const KIND_META: Record<HitKind, { label: string; group: string; tile: string; pill: string }> = {
  SRF: { label: "SRF", group: "Service requests", tile: "bg-amber-50 text-amber-700 ring-amber-200", pill: "bg-amber-100 text-amber-800" },
  DC: { label: "DC", group: "Inward challans", tile: "bg-emerald-50 text-emerald-700 ring-emerald-200", pill: "bg-emerald-100 text-emerald-800" },
  ODC: { label: "ODC", group: "Outward challans", tile: "bg-orange-50 text-orange-700 ring-orange-200", pill: "bg-orange-100 text-orange-800" },
  QB: { label: "Quick bill", group: "Quick bills", tile: "bg-violet-50 text-violet-700 ring-violet-200", pill: "bg-violet-100 text-violet-800" },
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "SRF", label: "SRF" },
  { id: "DC", label: "DC inward" },
  { id: "ODC", label: "ODC outward" },
  { id: "QB", label: "Quick bill" },
];

function Svg({ className = "h-5 w-5", children, strokeWidth = 1.8 }: { className?: string; children: ReactNode; strokeWidth?: number }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export function SearchGlyph({ className }: { className?: string }) {
  return (
    <Svg className={className} strokeWidth={2}>
      <path d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
    </Svg>
  );
}

function KindGlyph({ kind, className = "h-5 w-5" }: { kind: HitKind; className?: string }) {
  switch (kind) {
    case "SRF":
      return (
        <Svg className={className}>
          <circle cx="12" cy="12" r="5" />
          <path d="M12 10v2l1.2 1.2M9 7.5L9.7 3h4.6l.7 4.5M9 16.5l.7 4.5h4.6l.7-4.5" />
        </Svg>
      );
    case "DC":
      return (
        <Svg className={className}>
          <path d="M4 13h4l1.5 2.5h5L16 13h4M4 13l2.5-7h11L20 13v6H4v-6zM12 3v7m0 0l-2.5-2.5M12 10l2.5-2.5" />
        </Svg>
      );
    case "ODC":
      return (
        <Svg className={className}>
          <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z" />
        </Svg>
      );
    case "QB":
      return (
        <Svg className={className}>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6M9 16h3" />
        </Svg>
      );
  }
}

function statusLabel(status: string): string {
  const words = status
    .split("_")
    .filter(Boolean)
    .map((w) => (w === "sc" || w === "ho" ? "CSC" : w));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="gsp-r-md bg-[#F0DC90]/70 px-0.5 text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function rankOf(value: string, q: string): number {
  const v = value.toLowerCase();
  if (v === q) return 0;
  if (v.startsWith(q)) return 1;
  return 2;
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return el.isContentEditable;
}

export function GlobalSearchPalette() {
  const navigate = useNavigate();
  const apiMode = useApiMode();
  const { user } = useAuth();
  const { jobs } = useSrfJobs();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [activeIdx, setActiveIdx] = useState(0);
  const [bills, setBills] = useState<QuickBillHistoryRow[]>([]);
  const [billsRequested, setBillsRequested] = useState(false);
  const [recents, setRecents] = useState<RecentLookup[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const openPalette = useCallback((seed?: string) => {
    setOpen(true);
    if (seed) setQuery((prev) => `${prev}${seed}`);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setFilter("ALL");
  }, []);

  useEffect(() => {
    function onGlobalKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (isEditable(e.target)) return;
      if (e.key.length === 1 && e.key !== " ") {
        e.preventDefault();
        openPalette(e.key);
      }
    }
    window.addEventListener("keydown", onGlobalKeyDown, true);
    return () => window.removeEventListener("keydown", onGlobalKeyDown, true);
  }, [openPalette]);

  useEffect(() => {
    if (!open) return;
    setRecents(loadRecentLookups());
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onRecent = () => setRecents(loadRecentLookups());
    window.addEventListener("dashboard-recent-lookups", onRecent);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("dashboard-recent-lookups", onRecent);
    };
  }, [open]);

  useEffect(() => {
    if (!open || billsRequested || !apiMode || !user) return;
    setBillsRequested(true);
    apiJson<{ bills: QuickBillHistoryRow[] }>("/api/service/quick-bills?limit=500")
      .then((d) => setBills(d.bills))
      .catch((e) => {
        if (e instanceof ApiError) return;
      });
  }, [open, billsRequested, apiMode, user]);

  const q = query.trim().toLowerCase();

  const allHits = useMemo<PaletteHit[]>(() => {
    if (!q) return [];
    const out: PaletteHit[] = [];
    const seen = new Set<string>();
    const push = (h: Omit<PaletteHit, "to">, identifier: string) => {
      const key = `${h.kind}:${h.primary}`;
      if (seen.has(key)) return;
      const to = destinationFor(h.kind, identifier, user);
      if (!to) return;
      seen.add(key);
      out.push({ ...h, to });
    };

    for (const j of jobs) {
      const watch = `${j.watchBrand ?? ""} ${j.watchModel ?? ""}`.trim();
      const fields = [j.reference, j.customerName, j.phone, j.serial, watch].filter(Boolean) as string[];
      const hit = fields.find((f) => f.toLowerCase().includes(q));
      if (hit) {
        const secondary = [j.customerName, j.phone, watch, j.serial ? `S/N ${j.serial}` : ""].filter(Boolean).join(" · ");
        push({ kind: "SRF", primary: j.reference, secondary, status: j.status, rank: rankOf(hit, q) }, j.reference);
      }
      if (j.dcNumber && j.dcNumber.toLowerCase().includes(q)) {
        push({ kind: "DC", primary: j.dcNumber, secondary: `${j.reference} · ${j.customerName}`, rank: rankOf(j.dcNumber, q) }, j.dcNumber);
      }
      if (j.outwardDcNumber && j.outwardDcNumber.toLowerCase().includes(q)) {
        push({ kind: "ODC", primary: j.outwardDcNumber, secondary: `${j.reference} · ${j.customerName}`, rank: rankOf(j.outwardDcNumber, q) }, j.outwardDcNumber);
      }
    }

    for (const b of bills) {
      const customer = b.customerName ?? b.company ?? "Walk-in";
      const fields = [b.billNumber, customer, b.phone ?? ""].filter(Boolean);
      const hit = fields.find((f) => f.toLowerCase().includes(q));
      if (hit) {
        const secondary = [customer, b.phone ?? "", b.watchBrand].filter(Boolean).join(" · ");
        push({ kind: "QB", primary: b.billNumber, secondary, rank: rankOf(hit, q) }, b.billNumber);
      }
    }

    return out.sort((a, b) => a.rank - b.rank);
  }, [jobs, bills, q, user]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: allHits.length, SRF: 0, DC: 0, ODC: 0, QB: 0 };
    for (const h of allHits) c[h.kind] += 1;
    return c;
  }, [allHits]);

  const groups = useMemo(() => {
    const kinds = filter === "ALL" ? KIND_ORDER : [filter];
    const perGroup = filter === "ALL" ? 6 : 40;
    return kinds
      .map((kind) => ({ kind, items: allHits.filter((h) => h.kind === kind).slice(0, perGroup) }))
      .filter((g) => g.items.length > 0);
  }, [allHits, filter]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const recentItems = q ? [] : recents;
  const navCount = q ? flat.length : recentItems.length;

  useEffect(() => {
    setActiveIdx(0);
  }, [q, filter]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  function go(entry: { kind: string; primary: string; secondary: string; to: string }) {
    pushRecentLookup({ query: entry.primary, label: entry.secondary, kind: entry.kind, to: entry.to });
    navigate(entry.to);
    close();
  }

  function activate(i: number) {
    if (q) {
      const h = flat[i];
      if (h) go(h);
    } else {
      const r = recentItems[i];
      if (r) go({ kind: r.kind, primary: r.query, secondary: r.label, to: r.to });
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(navCount - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(activeIdx);
    } else if (e.key === "Tab" && q) {
      e.preventDefault();
      const order = FILTERS.map((f) => f.id);
      const next = order[(order.indexOf(filter) + (e.shiftKey ? order.length - 1 : 1)) % order.length];
      setFilter(next);
    }
  }

  const rowClass = (active: boolean) =>
    [
      "gsp-r-xl group relative flex w-full items-center gap-3 px-3 py-2.5 text-left transition",
      active ? "bg-white shadow-[0_4px_14px_rgba(16,37,112,0.10)] ring-1 ring-[#1b3a8f]/15" : "hover:bg-white/70",
    ].join(" ");

  const activeBar = (active: boolean) =>
    active ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[#C9A227]" aria-hidden /> : null;

  let idx = -1;

  const palette = open
    ? createPortal(
        <div
          className="global-search-palette fixed inset-0 z-[90] flex items-start justify-center px-3 pt-[8vh] sm:px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          <div className="absolute inset-0 bg-[#0b1430]/55 backdrop-blur-[3px]" onMouseDown={close} />

          <div className="gsp-r-2xl relative flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden bg-white shadow-[0_28px_70px_rgba(8,20,60,0.38)] ring-1 ring-black/5">
            <div
              className="relative shrink-0 px-4 pb-3 pt-4 sm:px-5"
              style={{ background: "linear-gradient(135deg, #102570 0%, #1b3a8f 55%, #243f6e 100%)" }}
            >
              <div
                className="absolute inset-x-0 top-0 h-[3px]"
                style={{ background: "linear-gradient(90deg, #A8850F, #C9A227, #F0DC90, #C9A227, #A8850F)" }}
                aria-hidden
              />
              <div className="gsp-r-xl flex items-center gap-3 border border-white/15 bg-white/10 px-3.5 transition focus-within:border-[#F0DC90]/60 focus-within:bg-white/[0.14]">
                <SearchGlyph className="h-5 w-5 shrink-0 text-[#F0DC90]" />
                <input
                  ref={inputRef}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="SRF, DC / ODC, quick bill, customer, phone or serial"
                  className="h-12 min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/45 sm:h-14 sm:text-lg"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      inputRef.current?.focus();
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/15 hover:text-white"
                    aria-label="Clear search"
                  >
                    <Svg className="h-4 w-4" strokeWidth={2}>
                      <path d="M6 18L18 6M6 6l12 12" />
                    </Svg>
                  </button>
                ) : null}
                <span
                  className="hidden shrink-0 items-center gap-1.5 rounded-full border border-[#C9A227]/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#F0DC90] sm:inline-flex"
                  style={{ background: "rgba(201,162,39,0.14)" }}
                  title="Barcode scanner ready"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  Scanner
                </span>
                <button
                  type="button"
                  onClick={close}
                  className="gsp-r-md shrink-0 border border-white/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/70 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close search"
                >
                  Esc
                </button>
              </div>

              {q ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {FILTERS.map((f) => {
                    const on = filter === f.id;
                    const n = counts[f.id];
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setFilter(f.id);
                          inputRef.current?.focus();
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                          on ? "bg-[#C9A227] text-[#102570] shadow-sm" : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
                        } ${n === 0 && !on ? "opacity-50" : ""}`}
                      >
                        {f.label}
                        <span className={`rounded-full px-1.5 text-[10px] ${on ? "bg-[#102570]/15" : "bg-white/15"}`}>{n}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div ref={listRef} className="min-h-[180px] flex-1 overflow-y-auto bg-slate-50/80 p-2">
              {q ? (
                flat.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <span className="gsp-r-2xl mb-3 flex h-14 w-14 items-center justify-center bg-white text-slate-400 ring-1 ring-slate-200">
                      <SearchGlyph className="h-6 w-6" />
                    </span>
                    <p className="text-sm font-semibold text-slate-700">No matches</p>
                    <p className="mt-1 max-w-full truncate font-mono text-xs text-slate-500">“{query.trim()}”</p>
                  </div>
                ) : (
                  groups.map((g) => (
                    <div key={g.kind} className="mb-1">
                      <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{KIND_META[g.kind].group}</span>
                        {filter === "ALL" && counts[g.kind] > g.items.length ? (
                          <button
                            type="button"
                            onClick={() => setFilter(g.kind)}
                            className="text-[11px] font-semibold text-[#1b3a8f] hover:underline"
                          >
                            View all {counts[g.kind]}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">{counts[g.kind]}</span>
                        )}
                      </div>
                      {g.items.map((h) => {
                        idx += 1;
                        const i = idx;
                        const active = i === activeIdx;
                        const meta = KIND_META[h.kind];
                        return (
                          <button
                            key={`${h.kind}-${h.primary}`}
                            type="button"
                            data-idx={i}
                            onClick={() => go(h)}
                            onMouseMove={() => setActiveIdx(i)}
                            className={rowClass(active)}
                          >
                            {activeBar(active)}
                            <span className={`gsp-r-lg flex h-10 w-10 shrink-0 items-center justify-center ring-1 ${meta.tile}`}>
                              <KindGlyph kind={h.kind} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-mono text-[13px] font-semibold text-slate-900">
                                  <Highlight text={h.primary} q={q} />
                                </span>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.pill}`}>
                                  {meta.label}
                                </span>
                                {h.status ? (
                                  <span className="hidden shrink-0 truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 sm:inline">
                                    {statusLabel(h.status)}
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-slate-500">
                                <Highlight text={h.secondary} q={q} />
                              </span>
                            </span>
                            <Svg className={`h-4 w-4 shrink-0 transition ${active ? "translate-x-0 text-[#1b3a8f] opacity-100" : "-translate-x-1 opacity-0"}`} strokeWidth={2}>
                              <path d="M9 5l7 7-7 7" />
                            </Svg>
                          </button>
                        );
                      })}
                    </div>
                  ))
                )
              ) : recentItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                  <span className="gsp-r-2xl mb-3 flex h-14 w-14 items-center justify-center bg-white text-[#1b3a8f] ring-1 ring-slate-200">
                    <SearchGlyph className="h-6 w-6" />
                  </span>
                  <p className="text-sm font-semibold text-slate-700">No recent searches</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Recent</span>
                    <button
                      type="button"
                      onClick={() => {
                        clearRecentLookups();
                        inputRef.current?.focus();
                      }}
                      className="text-[11px] font-semibold text-slate-500 hover:text-red-600"
                    >
                      Clear
                    </button>
                  </div>
                  {recentItems.map((r, i) => {
                    const active = i === activeIdx;
                    const kind = (KIND_ORDER as string[]).includes(r.kind) ? (r.kind as HitKind) : null;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        data-idx={i}
                        onClick={() => go({ kind: r.kind, primary: r.query, secondary: r.label, to: r.to })}
                        onMouseMove={() => setActiveIdx(i)}
                        className={rowClass(active)}
                      >
                        {activeBar(active)}
                        <span
                          className={`gsp-r-lg flex h-10 w-10 shrink-0 items-center justify-center ring-1 ${
                            kind ? KIND_META[kind].tile : "bg-slate-100 text-slate-500 ring-slate-200"
                          }`}
                        >
                          {kind ? (
                            <KindGlyph kind={kind} />
                          ) : (
                            <Svg className="h-5 w-5">
                              <circle cx="12" cy="12" r="9" />
                              <path d="M12 7v5l3 2" />
                            </Svg>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[13px] font-semibold text-slate-900">{r.query}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">{r.label}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {new Date(r.at).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {q && flat.length > 0 ? (
              <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 py-2 text-[11px] text-slate-500">
                <span>
                  {counts.ALL} result{counts.ALL === 1 ? "" : "s"}
                </span>
                {flat.length < (filter === "ALL" ? counts.ALL : counts[filter]) ? <span>Showing {flat.length}</span> : null}
              </div>
            ) : null}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => openPalette()}
        aria-label="Search"
        title="Search (Ctrl+K)"
        className={`topbar-icon-btn flex h-10 w-10 shrink-0 items-center justify-center text-rlx-ink transition ${open ? "topbar-icon-btn--active" : ""}`}
      >
        <SearchGlyph className="h-[18px] w-[18px]" />
      </button>
      {palette}
    </>
  );
}
