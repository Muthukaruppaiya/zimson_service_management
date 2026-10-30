import { useEffect, useMemo, useRef, useState } from "react";
import { formatInr } from "../../lib/formatInr";

export type SpareSearchOption = {
  id: string;
  sku: string;
  altSku?: string | null;
  brand?: string | null;
  name: string;
  hsn?: string | null;
  price: number;
  stockQty: number;
};

type Props = {
  options: SpareSearchOption[];
  loading?: boolean;
  disabled?: boolean;
  placeholder: string;
  onPick: (spareId: string) => void;
};

const MAX_RESULTS = 60;

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-amber-200/70 text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function SpareSearchPicker({ options, loading, disabled, placeholder, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const q = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return options;
    const terms = q.split(/\s+/).filter(Boolean);
    return options.filter((o) => {
      const hay = `${o.name} ${o.sku} ${o.altSku ?? ""} ${o.brand ?? ""} ${o.hsn ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [options, q]);

  const shown = matches.slice(0, MAX_RESULTS);

  useEffect(() => {
    setActiveIdx(0);
  }, [q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(id: string) {
    onPick(id);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, Math.max(shown.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = shown[activeIdx];
      if (open && hit) pick(hit.id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1">
      <div
        className={`flex items-stretch overflow-hidden rounded-lg border bg-white shadow-sm transition ${
          open ? "border-zimson-500 ring-2 ring-zimson-200" : "border-zimson-300"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <span className="flex items-center pl-3 text-zimson-500" aria-hidden>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-label="Search spare to add"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2.5 text-sm text-zimson-900 outline-none placeholder:text-stone-400"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="px-2 text-stone-400 transition hover:text-stone-700"
            aria-label="Clear spare search"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : null}
        <span className="flex shrink-0 items-center border-l border-zimson-200 bg-zimson-50 px-3 text-[11px] font-semibold tabular-nums text-zimson-800">
          {loading ? "…" : q ? `${matches.length}/${options.length}` : options.length}
        </span>
      </div>

      {open && !disabled ? (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-zimson-200 bg-white shadow-[0_12px_32px_rgba(16,37,112,0.18)]">
          {loading ? (
            <p className="px-4 py-4 text-center text-sm text-stone-500">Loading spares…</p>
          ) : shown.length === 0 ? (
            <p className="px-4 py-4 text-center text-sm text-stone-500">
              {options.length === 0 ? "No spares in the catalogue" : "No matching spares"}
            </p>
          ) : (
            <ul ref={listRef} role="listbox" className="max-h-80 overflow-y-auto py-1">
              {shown.map((o, i) => {
                const active = i === activeIdx;
                const out = o.stockQty <= 0;
                return (
                  <li key={o.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      data-idx={i}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(o.id)}
                      onMouseMove={() => setActiveIdx(i)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${active ? "bg-zimson-50" : ""}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zimson-950">
                          <Highlight text={o.name} q={q} />
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-stone-500">
                          <Highlight text={o.sku} q={q} />
                          {o.altSku ? (
                            <>
                              {" · "}
                              <Highlight text={o.altSku} q={q} />
                            </>
                          ) : null}
                          {o.brand ? (
                            <>
                              {" · "}
                              <Highlight text={o.brand} q={q} />
                            </>
                          ) : null}
                          {o.hsn ? ` · HSN ${o.hsn}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums text-zimson-900">{formatInr(o.price)}</span>
                        <span
                          className={`mt-0.5 inline-block rounded-full px-2 py-px text-[10px] font-semibold ${
                            out ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {out ? "Out of stock" : `Qty ${o.stockQty}`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {matches.length > shown.length ? (
            <p className="border-t border-zimson-100 bg-zimson-50/60 px-3 py-1.5 text-[11px] text-stone-500">
              Showing {shown.length} of {matches.length}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
