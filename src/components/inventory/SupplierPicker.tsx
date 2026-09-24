import { useEffect, useMemo, useRef, useState } from "react";

type SupplierOption = {
  id: string;
  name: string;
  supplierCode?: string | null;
  isActive?: boolean;
};

export function SupplierPicker({
  value,
  onChange,
  suppliers,
  className = "relative mt-1",
}: {
  value: string;
  onChange: (id: string) => void;
  suppliers: SupplierOption[];
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rows = useMemo(
    () => suppliers.filter((s) => s.isActive !== false),
    [suppliers],
  );
  const selected = rows.find((s) => s.id === value);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const list = q
      ? rows.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.supplierCode ?? "").toLowerCase().includes(q),
        )
      : rows;
    return list.slice(0, 80);
  }, [query, rows]);

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
        className="flex h-10 cursor-pointer items-center justify-between border border-rlx-rule bg-white px-3 text-sm transition hover:border-rlx-green"
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 40);
        }}
      >
        {selected ? (
          <span className="truncate">
            <span className="font-medium text-stone-800">{selected.name}</span>
            {selected.supplierCode ? (
              <span className="ml-2 font-mono text-[11px] text-stone-400">{selected.supplierCode}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-stone-400">Search supplier name or code…</span>
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
              placeholder="Type supplier name or code…"
              className="w-full bg-transparent text-sm text-stone-800 outline-none placeholder-stone-400"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-xs text-stone-400">No suppliers match "{query}"</li>
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
                  {s.supplierCode ? (
                    <span className="ml-4 shrink-0 font-mono text-[11px] text-stone-400">{s.supplierCode}</span>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
