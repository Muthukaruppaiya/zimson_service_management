import { useCallback, useEffect, useMemo, useState } from "react";
import { SEED_WATCH_CASE_TYPES, SEED_WATCH_STRAP_CHAIN_TYPES } from "../../data/watchCatalogSeed";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { sanitizeTextInput } from "../../lib/inputSanitize";
import { parseWatchCatalogMultiValue } from "../../lib/watchCatalogMulti";
import { SearchableCombobox } from "./SearchableCombobox";

export type WatchCatalogRow = { id: string; name: string };

export type WatchCatalogSingleKind = "case-types" | "strap-chain-types";

const ENDPOINTS: Record<WatchCatalogSingleKind, string> = {
  "case-types": "/api/service/watch-case-types",
  "strap-chain-types": "/api/service/watch-strap-chain-types",
};

const SEED_BY_KIND: Record<WatchCatalogSingleKind, readonly string[]> = {
  "case-types": SEED_WATCH_CASE_TYPES,
  "strap-chain-types": SEED_WATCH_STRAP_CHAIN_TYPES,
};

const LABELS: Record<WatchCatalogSingleKind, string> = {
  "case-types": "Case type",
  "strap-chain-types": "Strap / chain type",
};

type Props = {
  kind: WatchCatalogSingleKind;
  value: string;
  onChange: (name: string) => void;
  inputClass: string;
  idPrefix: string;
  disabled?: boolean;
};

export function WatchCatalogSinglePicker({
  kind,
  value,
  onChange,
  inputClass,
  idPrefix,
  disabled,
}: Props) {
  const apiMode = useApiMode();
  const [rows, setRows] = useState<WatchCatalogRow[]>([]);
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

  const options = useMemo(() => {
    const byName = new Map<string, WatchCatalogRow>();
    for (const r of rows) {
      const key = r.name.trim().toLowerCase();
      if (!key || byName.has(key)) continue;
      byName.set(key, r);
    }
    const list = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    return list.map((r) => ({ value: r.name, label: r.name }));
  }, [rows]);

  const selectedValue = useMemo(() => {
    const v = value.trim();
    if (!v) return "";
    const parts = parseWatchCatalogMultiValue(v);
    return parts[0] ?? v;
  }, [value]);

  async function saveNew() {
    const name = newName.trim();
    if (!name) return;
    if (!apiMode) {
      onChange(name);
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
      onChange(name);
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
      <SearchableCombobox
        id={`${idPrefix}-${kind}`}
        label={label}
        value={selectedValue}
        options={options}
        onChange={onChange}
        inputClass={inputClass}
        disabled={disabled || loading}
        placeholder={loading ? "Loading…" : `Select ${label.toLowerCase()}…`}
        actionOption={{ value: "__add_new__", label: `+ Add new ${label.toLowerCase()}` }}
        onActionSelect={() => {
          const el = document.getElementById(`${idPrefix}-${kind}-new`) as HTMLInputElement | null;
          el?.focus();
        }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          id={`${idPrefix}-${kind}-new`}
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
