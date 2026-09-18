import { useEffect, useMemo, useRef, useState } from "react";

type SpareOption = {
  id: string;
  name: string;
  sku: string;
  altSku?: string | null;
  altName?: string | null;
  modelNo?: string | null;
  caliber?: string | null;
  subCategory?: string | null;
  size?: string | null;
  colour?: string | null;
  brand?: string;
  category?: string;
};

export function SparePicker({
  value,
  onChange,
  spares,
  className = "relative mt-1",
  showSku = true,
  compact = false,
  getMeta,
}: {
  value: string;
  onChange: (id: string) => void;
  spares: SpareOption[];
  className?: string;
  showSku?: boolean;
  compact?: boolean;
  getMeta?: (spare: SpareOption) => string | undefined;
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
          (s.altSku ?? "").toLowerCase().includes(q) ||
          (s.altName ?? "").toLowerCase().includes(q) ||
          (s.modelNo ?? "").toLowerCase().includes(q) ||
          (s.caliber ?? "").toLowerCase().includes(q) ||
          (s.subCategory ?? "").toLowerCase().includes(q) ||
          (s.size ?? "").toLowerCase().includes(q) ||
          (s.colour ?? "").toLowerCase().includes(q) ||
          (s.brand ?? "").toLowerCase().includes(q) ||
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

  function pick(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={ref} className={className}>
      <div
        className={`flex cursor-pointer items-center justify-between border border-rlx-rule bg-white text-sm transition hover:border-rlx-green ${
          compact ? "h-8 px-2.5" : "h-10 px-3"
        }`}
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 40);
        }}
      >
        {selected ? (
          <span className="truncate">
            <span className="font-medium text-stone-800">{selected.name}</span>
            {showSku && (
              <span className="ml-2 font-mono text-[11px] text-stone-400">
                {selected.sku}
                {selected.altSku ? ` / ${selected.altSku}` : ""}
                {selected.brand ? ` · ${selected.brand}` : ""}
              </span>
            )}
          </span>
        ) : (
          <span className="text-stone-400">Search spare by name, part no, brand, model, size or colour…</span>
        )}
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="ml-2 h-3.5 w-3.5 shrink-0 text-stone-400">
          <polyline points="4 6 8 10 12 6" />
        </svg>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-[80] border border-rlx-rule bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-rlx-rule px-3 py-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type name, part no, brand, model, size or colour…"
              className="w-full bg-transparent text-sm text-stone-800 outline-none placeholder-stone-400"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-xs text-stone-400">No spares match "{query}"</li>
            ) : (
              filtered.map((s) => (
                <li
                  key={s.id}
                  onMouseDown={() => pick(s.id)}
                  className={`flex cursor-pointer items-center justify-between border-b border-rlx-rule px-4 py-2.5 text-sm last:border-0 hover:bg-rlx-green/5 ${
                    s.id === value ? "bg-rlx-green/10" : ""
                  }`}
                >
                  <span className="min-w-0 truncate font-medium text-stone-800">{s.name}</span>
                  <span className="ml-4 flex shrink-0 items-center gap-3 font-mono text-[11px] text-stone-400">
                    {getMeta?.(s) ? <span className="font-semibold text-rlx-green">{getMeta(s)}</span> : null}
                    <span>
                      {s.sku}
                      {s.altSku ? ` / ${s.altSku}` : ""}
                      {s.brand ? ` · ${s.brand}` : ""}
                    </span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
