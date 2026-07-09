import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiJson } from "../../lib/api";
import { sanitizeTextInput } from "../../lib/inputSanitize";
import { SearchableCombobox } from "./SearchableCombobox";

export type WatchFamilyRow = { id: string; brand: string; family: string };

type WatchFamilyPickerProps = {
  watchBrand: string;
  apiMode: boolean;
  family: string;
  onFamilyChange: (family: string) => void;
  inputClass: string;
  idPrefix?: string;
  required?: boolean;
  onSelectionModeChange?: (isNewFamily: boolean) => void;
  disableAutoSelect?: boolean;
};

export function WatchFamilyPicker({
  watchBrand,
  apiMode,
  family,
  onFamilyChange,
  inputClass,
  idPrefix = "wf",
  required = true,
  onSelectionModeChange,
  disableAutoSelect = false,
}: WatchFamilyPickerProps) {
  const [dbFamilies, setDbFamilies] = useState<WatchFamilyRow[]>([]);
  const [catalogFamilyKey, setCatalogFamilyKey] = useState("");
  const [customFamilyText, setCustomFamilyText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingFamilies, setLoadingFamilies] = useState(false);

  const prevBrandRef = useRef<string | null>(null);
  const onFamilyChangeRef = useRef(onFamilyChange);
  const customFamilyTextRef = useRef(customFamilyText);
  const editingNewFamilyRef = useRef(false);
  const hydratedExternalFamilyRef = useRef<string | null>(null);

  onFamilyChangeRef.current = onFamilyChange;
  customFamilyTextRef.current = customFamilyText;

  const catalogFamilies = useMemo(() => {
    const by = new Map<string, WatchFamilyRow>();
    for (const row of dbFamilies) {
      const key = row.family.trim().toLowerCase();
      if (!key) continue;
      if (!by.has(key)) by.set(key, row);
    }
    return [...by.values()].sort((a, b) => a.family.localeCompare(b.family));
  }, [dbFamilies]);

  const isNewFamilyEntry = catalogFamilyKey === "__new__" || catalogFamilies.length === 0;
  const fieldClass = inputClass.replace(/\bmt-1\b/g, "").trim();
  const label = required ? "Family *" : "Family";

  function applyFamilyFromProp(families: WatchFamilyRow[], nextFamily: string) {
    const f = nextFamily.trim();
    if (!f) {
      setCatalogFamilyKey(families.length === 0 ? "__new__" : "");
      setCustomFamilyText("");
      editingNewFamilyRef.current = false;
      return;
    }
    const match = families.find((x) => x.family.trim().toLowerCase() === f.toLowerCase());
    if (match) {
      setCatalogFamilyKey(match.family);
      setCustomFamilyText("");
      editingNewFamilyRef.current = false;
      return;
    }
    setCatalogFamilyKey("__new__");
    setCustomFamilyText(f);
    editingNewFamilyRef.current = false;
  }

  const reloadFamilies = useCallback(async () => {
    if (!apiMode || !watchBrand.trim()) {
      setDbFamilies([]);
      return;
    }
    const out = await apiJson<{ families: WatchFamilyRow[] }>(
      `/api/service/watch-families?brand=${encodeURIComponent(watchBrand)}`,
    );
    setDbFamilies(out.families);
  }, [apiMode, watchBrand]);

  useEffect(() => {
    onSelectionModeChange?.(isNewFamilyEntry);
  }, [isNewFamilyEntry, onSelectionModeChange]);

  useEffect(() => {
    if (!isNewFamilyEntry) {
      const selected = catalogFamilyKey.trim();
      if (selected && selected !== family.trim()) {
        onFamilyChangeRef.current(selected);
      }
      return;
    }
    if (!editingNewFamilyRef.current) return;
    const timer = window.setTimeout(() => {
      onFamilyChangeRef.current(customFamilyTextRef.current.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [isNewFamilyEntry, catalogFamilyKey, customFamilyText, family]);

  useEffect(() => {
    if (!apiMode || !watchBrand.trim()) {
      setDbFamilies([]);
      setCatalogFamilyKey("__new__");
      setCustomFamilyText("");
      setLoadingFamilies(false);
      editingNewFamilyRef.current = false;
      hydratedExternalFamilyRef.current = null;
      return;
    }
    let cancelled = false;
    setLoadError(null);
    setLoadingFamilies(true);
    void apiJson<{ families: WatchFamilyRow[] }>(
      `/api/service/watch-families?brand=${encodeURIComponent(watchBrand)}`,
    )
      .then((out) => {
        if (cancelled) return;
        setDbFamilies(out.families);
      })
      .catch(() => {
        if (!cancelled) {
          setDbFamilies([]);
          setLoadError("Could not load families for this brand.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFamilies(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiMode, watchBrand]);

  useEffect(() => {
    const prev = prevBrandRef.current;
    prevBrandRef.current = watchBrand;
    if (prev !== null && prev !== watchBrand) {
      setCatalogFamilyKey("");
      setCustomFamilyText("");
      editingNewFamilyRef.current = false;
      hydratedExternalFamilyRef.current = null;
      onFamilyChangeRef.current("");
    }
    setSaveMsg(null);
  }, [watchBrand]);

  useEffect(() => {
    if (!disableAutoSelect) return;
    if (editingNewFamilyRef.current) return;
    const externalFamily = family.trim();
    const hydrationKey = `${watchBrand}::${externalFamily}::${catalogFamilies.length}`;
    if (hydratedExternalFamilyRef.current === hydrationKey) return;
    hydratedExternalFamilyRef.current = hydrationKey;
    applyFamilyFromProp(catalogFamilies, externalFamily);
  }, [disableAutoSelect, family, watchBrand, catalogFamilies]);

  useEffect(() => {
    if (disableAutoSelect) return;
    if (catalogFamilyKey === "__new__") return;
    if (catalogFamilyKey && catalogFamilies.some((f) => f.family === catalogFamilyKey)) return;
    if (catalogFamilies.length === 0) {
      setCatalogFamilyKey("__new__");
      return;
    }
    setCatalogFamilyKey(catalogFamilies[0]!.family);
    setCustomFamilyText("");
    editingNewFamilyRef.current = false;
  }, [catalogFamilies, catalogFamilyKey, disableAutoSelect]);

  async function saveNewFamily() {
    const name = customFamilyText.trim();
    if (!watchBrand.trim() || !name) return;
    if (!apiMode) {
      setLoadError("Turn on API mode (VITE_USE_API) to save families to the server.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    setLoadError(null);
    try {
      await apiJson<{ ok: boolean }>("/api/service/watch-families", {
        method: "POST",
        json: { brand: watchBrand.trim(), family: name },
      });
      await reloadFamilies();
      setCatalogFamilyKey(name);
      setCustomFamilyText("");
      editingNewFamilyRef.current = false;
      hydratedExternalFamilyRef.current = `${watchBrand}::${name}::${catalogFamilies.length}`;
      onFamilyChangeRef.current(name);
      setSaveMsg("Saved — appears in the family list for this brand.");
      window.setTimeout(() => setSaveMsg(null), 4000);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Could not save family.");
    } finally {
      setSaving(false);
    }
  }

  const comboboxOptions = useMemo(
    () => catalogFamilies.map((f) => ({ value: f.family, label: f.family })),
    [catalogFamilies],
  );

  return (
    <div className="min-w-0">
      {catalogFamilies.length === 0 && !loadingFamilies ? (
        <p className="mb-1 text-xs text-amber-900">No saved families for this brand — enter a family name.</p>
      ) : null}
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          {isNewFamilyEntry ? (
            <div>
              <label htmlFor={`${idPrefix}-family-new`} className="text-xs font-medium text-stone-600">
                {label}
              </label>
              <input
                id={`${idPrefix}-family-new`}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={customFamilyText}
                required={required}
                placeholder="Enter new family name"
                className={`${fieldClass} mt-1`}
                onChange={(e) => {
                  editingNewFamilyRef.current = true;
                  setCustomFamilyText(sanitizeTextInput(e.target.value, 120));
                  setCatalogFamilyKey("__new__");
                  setSaveMsg(null);
                }}
                onBlur={(e) => {
                  editingNewFamilyRef.current = false;
                  const next = e.target.value.trim();
                  onFamilyChangeRef.current(next);
                  hydratedExternalFamilyRef.current = `${watchBrand}::${next}::${catalogFamilies.length}`;
                }}
              />
              {catalogFamilies.length > 0 ? (
                <button
                  type="button"
                  className="mt-1 text-[11px] font-medium text-rlx-green hover:underline"
                  onClick={() => {
                    editingNewFamilyRef.current = false;
                    hydratedExternalFamilyRef.current = null;
                    setCatalogFamilyKey("");
                    setCustomFamilyText("");
                    onFamilyChangeRef.current("");
                    setSaveMsg(null);
                  }}
                >
                  Pick from saved families
                </button>
              ) : null}
            </div>
          ) : (
            <SearchableCombobox
              id={`${idPrefix}-family`}
              label={label}
              required={required}
              value={catalogFamilyKey}
              options={comboboxOptions}
              onChange={(v) => {
                setSaveMsg(null);
                editingNewFamilyRef.current = false;
                if (!v) {
                  setCatalogFamilyKey("");
                  setCustomFamilyText("");
                  onFamilyChangeRef.current("");
                  return;
                }
                if (v === "__new__") {
                  editingNewFamilyRef.current = true;
                  hydratedExternalFamilyRef.current = null;
                  setCatalogFamilyKey("__new__");
                  setCustomFamilyText("");
                  onFamilyChangeRef.current("");
                  return;
                }
                setCatalogFamilyKey(v);
                setCustomFamilyText("");
                hydratedExternalFamilyRef.current = `${watchBrand}::${v}::${catalogFamilies.length}`;
                onFamilyChangeRef.current(v);
              }}
              inputClass={inputClass}
              placeholder="Search or select family…"
              actionOption={{ value: "__new__", label: "+ Add new family…" }}
              onActionSelect={() => {
                editingNewFamilyRef.current = true;
                hydratedExternalFamilyRef.current = null;
                setCatalogFamilyKey("__new__");
                setCustomFamilyText("");
                onFamilyChangeRef.current("");
                setSaveMsg(null);
              }}
            />
          )}
        </div>
        {isNewFamilyEntry && apiMode ? (
          <button
            type="button"
            disabled={!customFamilyText.trim() || saving}
            title="Save new family to database"
            onClick={() => void saveNewFamily()}
            className="mt-6 shrink-0 border border-rlx-gold/60 bg-white px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rlx-green hover:bg-rlx-green-light disabled:opacity-50"
          >
            {saving ? "…" : "Save"}
          </button>
        ) : null}
      </div>
      {saveMsg ? <p className="mt-1.5 text-xs font-medium text-emerald-800">{saveMsg}</p> : null}
      {loadError ? <p className="mt-1.5 text-xs text-red-800">{loadError}</p> : null}
    </div>
  );
}
