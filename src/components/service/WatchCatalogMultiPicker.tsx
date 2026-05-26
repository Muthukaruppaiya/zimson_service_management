import { useCallback, useEffect, useMemo, useState } from "react";
import { SEED_WATCH_CASE_TYPES, SEED_WATCH_STRAP_CHAIN_TYPES } from "../../data/watchCatalogSeed";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { sanitizeTextInput } from "../../lib/inputSanitize";

export type WatchCatalogRow = { id: string; name: string };

export type WatchCatalogMultiKind = "case-types" | "strap-chain-types";

const ENDPOINTS: Record<WatchCatalogMultiKind, string> = {
  "case-types": "/api/service/watch-case-types",
  "strap-chain-types": "/api/service/watch-strap-chain-types",
};

const SEED_BY_KIND: Record<WatchCatalogMultiKind, readonly string[]> = {
  "case-types": SEED_WATCH_CASE_TYPES,
  "strap-chain-types": SEED_WATCH_STRAP_CHAIN_TYPES,
};

const LABELS: Record<WatchCatalogMultiKind, string> = {
  "case-types": "Case type",
  "strap-chain-types": "Strap / chain type",
};

type WatchCatalogMultiPickerProps = {
  kind: WatchCatalogMultiKind;
  selected: string[];
  onChange: (names: string[]) => void;
  inputClass: string;
  idPrefix: string;
  disabled?: boolean;
};

export function WatchCatalogMultiPicker({
  kind,
  selected,
  onChange,
  inputClass,
  idPrefix,
  disabled,
}: WatchCatalogMultiPickerProps) {
  const apiMode = useApiMode();
  const [rows, setRows] = useState<WatchCatalogRow[]>([]);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const label = LABELS[kind];
  const endpoint = ENDPOINTS[kind];

  const reload = useCallback(async () => {
    if (!apiMode) {
      setRows(SEED_BY_KIND[kind].map((name, i) => ({ id: `seed-${i}`, name })));
      return;
    }
    const out = await apiJson<{ items: WatchCatalogRow[] }>(endpoint);
    setRows(out.items ?? []);
  }, [apiMode, endpoint, kind]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void reload()
      .catch((e) => {
        if (!cancelled) {
          setRows(SEED_BY_KIND[kind].map((name, i) => ({ id: `seed-${i}`, name })));
          setError(e instanceof Error ? e.message : "Could not load list.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, kind]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byName = new Map<string, WatchCatalogRow>();
    for (const r of rows) {
      const key = r.name.trim().toLowerCase();
      if (!key || byName.has(key)) continue;
      byName.set(key, r);
    }
    let list = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q));
    return list;
  }, [rows, search]);

  const selectedSet = useMemo(() => new Set(selected.map((s) => s.trim().toLowerCase())), [selected]);

  function toggle(name: string) {
    const key = name.trim().toLowerCase();
    if (!key) return;
    if (selectedSet.has(key)) {
      onChange(selected.filter((s) => s.trim().toLowerCase() !== key));
    } else {
      onChange([...selected, name.trim()]);
    }
  }

  async function saveNew() {
    const name = newName.trim();
    if (!name) return;
    if (!apiMode) {
      if (!selectedSet.has(name.toLowerCase())) onChange([...selected, name]);
      setNewName("");
      setSaveMsg("Added locally (API mode off).");
      window.setTimeout(() => setSaveMsg(null), 3000);
      return;
    }
    setSaving(true);
    setError(null);
    setSaveMsg(null);
    try {
      await apiJson<{ ok: boolean }>(endpoint, { method: "POST", json: { name } });
      await reload();
      if (!selectedSet.has(name.toLowerCase())) onChange([...selected, name]);
      setNewName("");
      setSaveMsg("Saved to catalog.");
      window.setTimeout(() => setSaveMsg(null), 3000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0">
      <span className="text-xs font-medium text-stone-600">{label}</span>
      {selected.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {selected.map((name) => (
            <button
              key={name}
              type="button"
              disabled={disabled}
              onClick={() => toggle(name)}
              className="inline-flex items-center gap-1 border border-rlx-gold/50 bg-rlx-green-light px-2 py-0.5 text-[10px] font-semibold text-rlx-green disabled:opacity-50"
              title="Click to remove"
            >
              {name}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-0.5 text-[10px] text-rlx-ink-muted">None selected</p>
      )}
      <div className="mt-2 border border-rlx-rule bg-white">
        <input
          id={`${idPrefix}-${kind}-search`}
          type="text"
          disabled={disabled}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search or select ${label.toLowerCase()}…`}
          className={`${inputClass.replace(/\bmt-1\b/g, "").trim()} w-full border-0 border-b border-rlx-rule bg-transparent focus:bg-rlx-bg`}
          aria-label={`${label} search and filter`}
        />
        <div
          className="max-h-36 overflow-y-auto"
          role="listbox"
          aria-label={`${label} options`}
          aria-multiselectable="true"
        >
        {loading ? (
          <p className="px-2 py-2 text-[11px] text-rlx-ink-muted">Loading…</p>
        ) : filteredRows.length === 0 ? (
          <p className="px-2 py-2 text-[11px] text-rlx-ink-muted">No matches.</p>
        ) : (
          filteredRows.map((row) => {
            const checked = selectedSet.has(row.name.trim().toLowerCase());
            return (
              <label
                key={row.id}
                className={`flex cursor-pointer items-center gap-2 border-b border-rlx-rule/50 px-2 py-1.5 text-[11px] last:border-b-0 ${
                  checked ? "bg-rlx-green-light/80" : "hover:bg-rlx-bg"
                }`}
              >
                <input
                  type="checkbox"
                  className="circle shrink-0"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(row.name)}
                />
                <span className="min-w-0 flex-1 text-rlx-ink">{row.name}</span>
              </label>
            );
          })
        )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass.replace("mt-1 ", "")} min-w-0 flex-1 basis-[min(100%,12rem)]`}
          placeholder={`Add new ${label.toLowerCase()}…`}
          value={newName}
          disabled={disabled || saving}
          onChange={(e) => {
            setNewName(sanitizeTextInput(e.target.value, 200));
            setSaveMsg(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void saveNew();
            }
          }}
        />
        <button
          type="button"
          disabled={disabled || saving || !newName.trim()}
          onClick={() => void saveNew()}
          className="shrink-0 border border-rlx-gold/60 bg-white px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rlx-green hover:bg-rlx-green-light disabled:opacity-50"
        >
          {saving ? "…" : "Add"}
        </button>
      </div>
      {saveMsg ? <p className="mt-1 text-[10px] font-medium text-emerald-800">{saveMsg}</p> : null}
      {error ? <p className="mt-1 text-[10px] text-red-800">{error}</p> : null}
    </div>
  );
}
