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
  const [catalogKey, setCatalogKey] = useState("");
  const [customText, setCustomText] = useState("");
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
    return [...byName.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({ value: r.name, label: r.name }));
  }, [rows]);

  const resolvedName = useMemo(() => {
    if (catalogKey === "__new__") return customText.trim();
    return catalogKey.trim();
  }, [catalogKey, customText]);

  useEffect(() => {
    const next = resolvedName;
    const current = value.trim();
    const parts = parseWatchCatalogMultiValue(value);
    const normalizedCurrent = (parts[0] ?? current).trim();
    if (!next && normalizedCurrent) return;
    if (next !== normalizedCurrent) onChange(next);
  }, [resolvedName, onChange, value]);

  useEffect(() => {
    const v = value.trim();
    const parts = parseWatchCatalogMultiValue(value);
    const single = (parts[0] ?? v).trim();
    if (!single) {
      setCatalogKey("");
      setCustomText("");
      return;
    }
    const match = options.find((o) => o.value.trim().toLowerCase() === single.toLowerCase());
    if (match) {
      setCatalogKey(match.value);
      setCustomText("");
      return;
    }
    setCatalogKey("__new__");
    setCustomText(single);
  }, [value, options]);

  async function saveNew() {
    const name =
      catalogKey === "__new__"
        ? customText.trim()
        : options.length === 0
          ? customText.trim()
          : "";
    if (!name) return;
    if (!apiMode) {
      onChange(name);
      setCatalogKey(name);
      setCustomText("");
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
      setCatalogKey(name);
      setCustomText("");
      onChange(name);
      setSaveMsg("Saved to catalog.");
      window.setTimeout(() => setSaveMsg(null), 3000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const comboboxDisabled = disabled || loading;
  const placeholder = loading ? "Loading…" : `Search or select ${label.toLowerCase()}…`;

  if (options.length === 0 && !loading) {
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <SearchableCombobox
            id={`${idPrefix}-${kind}`}
            label={label}
            freeText
            freeTextValue={customText}
            onFreeTextChange={(t) => {
              setCustomText(sanitizeTextInput(t, 200));
              setCatalogKey("__new__");
              setSaveMsg(null);
            }}
            value="__new__"
            options={[]}
            onChange={() => {}}
            inputClass={inputClass}
            disabled={comboboxDisabled}
            placeholder={`Enter ${label.toLowerCase()}…`}
          />
          {apiMode ? (
            <button
              type="button"
              disabled={!customText.trim() || saving || comboboxDisabled}
              onClick={() => void saveNew()}
              className="mt-6 shrink-0 border border-rlx-gold/60 bg-white px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rlx-green hover:bg-rlx-green-light disabled:opacity-50"
            >
              {saving ? "…" : "Save"}
            </button>
          ) : null}
        </div>
        {saveMsg ? <p className="mt-1.5 text-xs font-medium text-emerald-800">{saveMsg}</p> : null}
        {error ? <p className="mt-1.5 text-xs text-red-800">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <SearchableCombobox
            id={`${idPrefix}-${kind}`}
            label={label}
            value={catalogKey === "__new__" ? "" : catalogKey}
            options={options}
            onChange={(v) => {
              setSaveMsg(null);
              if (!v) {
                setCatalogKey("");
                setCustomText("");
                return;
              }
              setCatalogKey(v);
              setCustomText("");
            }}
            inputClass={inputClass}
            disabled={comboboxDisabled}
            placeholder={placeholder}
            actionOption={{ value: "__new__", label: `+ Add new ${label.toLowerCase()}…` }}
            onActionSelect={() => {
              setCatalogKey("__new__");
              setCustomText("");
            }}
            freeText={catalogKey === "__new__"}
            freeTextValue={customText}
            onFreeTextChange={(t) => {
              setCustomText(sanitizeTextInput(t, 200));
              setCatalogKey("__new__");
              setSaveMsg(null);
            }}
          />
        </div>
        {catalogKey === "__new__" && apiMode ? (
          <button
            type="button"
            disabled={!customText.trim() || saving || comboboxDisabled}
            title={`Save new ${label.toLowerCase()} to catalog`}
            onClick={() => void saveNew()}
            className="mt-6 shrink-0 border border-rlx-gold/60 bg-white px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rlx-green hover:bg-rlx-green-light disabled:opacity-50"
          >
            {saving ? "…" : "Save"}
          </button>
        ) : null}
      </div>
      {saveMsg ? <p className="mt-1.5 text-xs font-medium text-emerald-800">{saveMsg}</p> : null}
      {error ? <p className="mt-1.5 text-xs text-red-800">{error}</p> : null}
    </div>
  );
}
