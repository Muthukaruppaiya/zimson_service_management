import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { canAccessModule } from "../../config/moduleAccess";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import type { QuickBillHistoryRow } from "../../types/quickBill";
import type { SessionUser } from "../../types/user";

type HitKind = "SRF" | "DC" | "ODC" | "QB";

type SearchHit = {
  kind: HitKind;
  primary: string;
  secondary: string;
  to: string;
};

type DetectedKind = HitKind | "AUTO";

function categorize(query: string): DetectedKind {
  const q = query.trim().toUpperCase();
  if (!q) return "AUTO";
  if (q.startsWith("SRF")) return "SRF";
  if (q.startsWith("ODC")) return "ODC";
  if (q.startsWith("DC")) return "DC";
  if (q.startsWith("QB") || q.startsWith("INV")) return "QB";
  return "AUTO";
}

function destinationFor(kind: HitKind, identifier: string, user: SessionUser | null): string | null {
  if (!user) return null;
  const q = encodeURIComponent(identifier);
  const hasService = canAccessModule(user, "service");
  const hasSc = canAccessModule(user, "service_centre");
  switch (kind) {
    case "SRF":
      if (hasService) return `/service/srf-register?q=${q}`;
      if (hasSc) return `/service-centre/watch-inventory?q=${q}`;
      return null;
    case "DC":
      if (hasSc) return `/service-centre/logistics?tab=inward&q=${q}`;
      if (hasService) return `/service/watch-inventory?q=${q}`;
      return null;
    case "ODC":
      if (hasSc) return `/service-centre/logistics?tab=outward&q=${q}`;
      if (hasService) return `/service/watch-inventory?q=${q}`;
      return null;
    case "QB":
      if (hasService) return `/service/quick-bill-history?q=${q}`;
      return null;
  }
}

const KIND_STYLES: Record<HitKind, { label: string; chip: string; dot: string }> = {
  SRF: {
    label: "SRF",
    chip: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
  },
  DC: {
    label: "DC (Inward)",
    chip: "bg-emerald-100 text-emerald-800",
    dot: "bg-emerald-500",
  },
  ODC: {
    label: "ODC (Outward)",
    chip: "bg-orange-100 text-orange-800",
    dot: "bg-orange-500",
  },
  QB: {
    label: "Quick bill",
    chip: "bg-violet-100 text-violet-800",
    dot: "bg-violet-500",
  },
};

function SearchIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
    </svg>
  );
}

function ScanIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7V5a1 1 0 011-1h2m10 0h2a1 1 0 011 1v2M4 17v2a1 1 0 001 1h2m10 0h2a1 1 0 001-1v-2M7 8v8m4-8v8m3-8v8m3-8v8" />
    </svg>
  );
}

function CloseIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function KindBadge({ kind }: { kind: HitKind }) {
  const s = KIND_STYLES[kind];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function GlobalSearch({ autoFocus = true }: { autoFocus?: boolean }) {
  const navigate = useNavigate();
  const apiMode = useApiMode();
  const { user } = useAuth();
  const { jobs } = useSrfJobs();
  const [query, setQuery] = useState("");
  const [bills, setBills] = useState<QuickBillHistoryRow[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerCaptureUntilRef = useRef(0);

  useEffect(() => {
    if (!apiMode || !user) return;
    apiJson<{ bills: QuickBillHistoryRow[] }>("/api/service/quick-bills?limit=500")
      .then((d) => setBills(d.bills))
      .catch((e) => {
        if (e instanceof ApiError) return;
      });
  }, [apiMode, user]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!autoFocus) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 120);
    return () => window.clearTimeout(t);
  }, [autoFocus]);

  useEffect(() => {
    function isEditable(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      return el.isContentEditable;
    }

    function onGlobalKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (isEditable(e.target)) return;

      const now = Date.now();
      const active = document.activeElement;
      const isInputActive = active === inputRef.current;

      const isPrintableKey = e.key.length === 1;
      if (isPrintableKey) {
        // Scanner keyboard wedges type very fast; keep capture window alive while keys are streaming.
        scannerCaptureUntilRef.current = now + 250;
        if (!isInputActive) {
          e.preventDefault();
          inputRef.current?.focus();
          setOpen(true);
          setQuery((prev) => `${prev}${e.key}`);
        }
        return;
      }

      if (e.key === "Enter" && scannerCaptureUntilRef.current > now && !isInputActive) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", onGlobalKeyDown, true);
    return () => window.removeEventListener("keydown", onGlobalKeyDown, true);
  }, []);

  const detectedKind = useMemo(() => categorize(query), [query]);

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SearchHit[] = [];
    const seen = new Set<string>();
    const push = (h: SearchHit) => {
      const key = `${h.kind}:${h.primary}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(h);
    };

    const tryPush = (kind: HitKind, identifier: string, secondary: string) => {
      const to = destinationFor(kind, identifier, user);
      if (!to) return;
      push({ kind, primary: identifier, secondary, to });
    };

    for (const j of jobs) {
      if (j.reference.toLowerCase().includes(q)) {
        tryPush(
          "SRF",
          j.reference,
          `${j.customerName} · ${j.watchBrand} ${j.watchModel}`.trim(),
        );
      }
      if (j.dcNumber && j.dcNumber.toLowerCase().includes(q)) {
        tryPush("DC", j.dcNumber, `${j.reference} · ${j.customerName}`);
      }
      if (j.outwardDcNumber && j.outwardDcNumber.toLowerCase().includes(q)) {
        tryPush("ODC", j.outwardDcNumber, `${j.reference} · ${j.customerName}`);
      }
    }

    for (const b of bills) {
      if (b.billNumber.toLowerCase().includes(q)) {
        const customer = b.customerName ?? b.company ?? "Walk-in";
        tryPush("QB", b.billNumber, `${customer} · ${b.watchBrand}`);
      }
    }

    return out.slice(0, 10);
  }, [jobs, bills, query, user]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  function go(hit: SearchHit) {
    navigate(hit.to);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (hits[activeIdx]) go(hits[activeIdx]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-2xl">
      <div
        className={[
          "relative flex items-center gap-2 rounded-full border bg-white px-3 transition-all",
          open
            ? "border-zimson-300 shadow-xl shadow-zimson-300/30 ring-2 ring-zimson-200/60"
            : "border-zimson-200 shadow-md shadow-zimson-200/40 hover:shadow-lg",
        ].join(" ")}
      >
        <span className="pl-2 text-stone-400">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search SRF, Internal Transfer, DC/ODC, Quick bill — or scan a barcode"
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-stone-400"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="rounded-full p-1.5 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
            aria-label="Clear"
          >
            <CloseIcon />
          </button>
        ) : null}
        <span
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-zimson-50 to-zimson-100 px-2.5 py-1.5 text-zimson-800 ring-1 ring-zimson-200"
          title="Use a USB / Bluetooth barcode scanner — it types into the box automatically"
        >
          <ScanIcon className="h-4 w-4" />
          <span className="hidden text-[11px] font-semibold sm:inline">Scanner ready</span>
        </span>
      </div>

      <div className="mt-2 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        <span>Detected:</span>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-zimson-800 ring-1 ring-zimson-200">
          {detectedKind === "AUTO" ? (query.trim() ? "Looking up…" : "Type or scan to begin") : KIND_STYLES[detectedKind].label}
        </span>
      </div>

      {open && query.trim() ? (
        <div className="absolute left-0 right-0 z-50 mt-3 overflow-hidden rounded-2xl border border-zimson-200 bg-white text-left shadow-2xl ring-1 ring-stone-100">
          {hits.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-stone-500">
              No matches for{" "}
              <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-stone-800">{query}</span>
              <p className="mt-1 text-xs text-stone-400">
                Try SRF ref, internal transfer ref, DC/ODC (inter-HO), or Quick bill number.
              </p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-auto py-1">
              {hits.map((h, i) => (
                <li key={`${h.kind}-${h.primary}-${i}`}>
                  <button
                    type="button"
                    onClick={() => go(h)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={[
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
                      i === activeIdx ? "bg-zimson-50" : "hover:bg-zimson-50/60",
                    ].join(" ")}
                  >
                    <KindBadge kind={h.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[13px] font-semibold text-stone-900">
                        {h.primary}
                      </div>
                      <div className="truncate text-xs text-stone-600">{h.secondary}</div>
                    </div>
                    <span className="text-stone-400">↵</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-stone-100 bg-stone-50/80 px-4 py-2 text-[11px] text-stone-500">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-stone-300 bg-white px-1.5 py-0.5 font-mono text-[10px]">↑</kbd>
              <kbd className="rounded border border-stone-300 bg-white px-1.5 py-0.5 font-mono text-[10px]">↓</kbd>
              <span>navigate</span>
              <span className="mx-1">·</span>
              <kbd className="rounded border border-stone-300 bg-white px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
              <span>open</span>
            </span>
            <span>{hits.length} result{hits.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
