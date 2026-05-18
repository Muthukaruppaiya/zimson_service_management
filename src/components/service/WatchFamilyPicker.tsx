import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiJson } from "../../lib/api";
import { sanitizeTextInput } from "../../lib/inputSanitize";

export type WatchFamilyRow = { id: string; brand: string; family: string };

type WatchFamilyPickerProps = {
  watchBrand: string;
  apiMode: boolean;
  family: string;
  onFamilyChange: (family: string) => void;
  inputClass: string;
  idPrefix?: string;
  required?: boolean;
  /** Fires when user picks an existing family vs typing a new one. */
  onSelectionModeChange?: (isNewFamily: boolean) => void;
  /** When true, do not auto-pick the first family or pre-fill serial/refs. */
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

  const catalogFamilies = useMemo(() => {
    const by = new Map<string, WatchFamilyRow>();
    for (const row of dbFamilies) {
      const key = row.family.trim().toLowerCase();
      if (!key) continue;
      if (!by.has(key)) by.set(key, row);
    }
    return [...by.values()].sort((a, b) => a.family.localeCompare(b.family));
  }, [dbFamilies]);

  const resolvedFamily = useMemo(() => {
    if (catalogFamilyKey === "__new__") return customFamilyText.trim();
    return catalogFamilyKey.trim();
  }, [catalogFamilyKey, customFamilyText]);

  useEffect(() => {
    onFamilyChange(resolvedFamily);
  }, [resolvedFamily, onFamilyChange]);

  useEffect(() => {
    onSelectionModeChange?.(catalogFamilyKey === "__new__" || catalogFamilies.length === 0);
  }, [catalogFamilyKey, catalogFamilies.length, onSelectionModeChange]);

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
    if (!apiMode || !watchBrand.trim()) {
      setDbFamilies([]);
      setCatalogFamilyKey("__new__");
      setCustomFamilyText("");
      return;
    }
    let cancelled = false;
    setLoadError(null);
    setDbFamilies([]);
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
      });
    return () => {
      cancelled = true;
    };
  }, [apiMode, watchBrand]);

  useEffect(() => {
    if (disableAutoSelect) {
      setCatalogFamilyKey("");
      setCustomFamilyText("");
    } else {
      setCatalogFamilyKey("__new__");
      setCustomFamilyText(family.trim() ? family : "");
    }
    setSaveMsg(null);
  }, [watchBrand, disableAutoSelect]);

  useEffect(() => {
    if (disableAutoSelect) return;
    if (catalogFamilyKey === "__new__") return;
    if (catalogFamilies.some((f) => f.family === catalogFamilyKey)) return;
    if (catalogFamilies.length === 0) {
      setCatalogFamilyKey("__new__");
      return;
    }
    setCatalogFamilyKey(catalogFamilies[0]!.family);
    setCustomFamilyText("");
  }, [catalogFamilies, catalogFamilyKey, disableAutoSelect]);

  useEffect(() => {
    if (disableAutoSelect) return;
    if (!family.trim() || catalogFamilyKey !== "__new__") return;
    const match = catalogFamilies.find((f) => f.family.trim().toLowerCase() === family.trim().toLowerCase());
    if (match) {
      setCatalogFamilyKey(match.family);
      setCustomFamilyText("");
    }
  }, [family, catalogFamilies, catalogFamilyKey, disableAutoSelect]);

  async function saveNewFamily() {
    const name =
      catalogFamilyKey === "__new__"
        ? customFamilyText.trim()
        : catalogFamilies.length === 0
          ? customFamilyText.trim()
          : "";
    if (!watchBrand.trim() || !name) return;
    if (!apiMode) {
      setSaveMsg(null);
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
      setSaveMsg("Saved — appears in the family list for this brand.");
      window.setTimeout(() => setSaveMsg(null), 4000);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Could not save family.");
    } finally {
      setSaving(false);
    }
  }

  const label = required ? "Family *" : "Family";

  return (
    <div>
      <label htmlFor={`${idPrefix}-family`} className="text-xs font-medium text-stone-600">
        {label}
      </label>
      {catalogFamilies.length > 0 ? (
        <>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <select
                id={`${idPrefix}-family`}
                value={catalogFamilyKey === "__new__" ? "__new__" : catalogFamilyKey || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setSaveMsg(null);
                  if (!v) {
                    setCatalogFamilyKey("");
                    setCustomFamilyText("");
                    return;
                  }
                  if (v === "__new__") {
                    setCatalogFamilyKey("__new__");
                    setCustomFamilyText("");
                    return;
                  }
                  setCatalogFamilyKey(v);
                  setCustomFamilyText("");
                }}
                className={inputClass.replace("mt-1 ", "")}
              >
                {disableAutoSelect ? <option value="">Select family</option> : null}
                {catalogFamilies.map((f) => (
                  <option key={f.id} value={f.family}>
                    {f.family}
                  </option>
                ))}
                <option value="__new__">+ Add new family…</option>
              </select>
            </div>
            {catalogFamilyKey === "__new__" && apiMode ? (
              <button
                type="button"
                disabled={!customFamilyText.trim() || saving}
                title="Save new family to database"
                onClick={() => void saveNewFamily()}
                className="shrink-0 rounded-md border border-zimson-500 bg-zimson-600 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "…" : "Save"}
              </button>
            ) : null}
          </div>
          {catalogFamilyKey === "__new__" ? (
            <input
              className={`${inputClass} mt-2`}
              placeholder="Type new family name"
              value={customFamilyText}
              onChange={(e) => {
                setCustomFamilyText(sanitizeTextInput(e.target.value, 120));
                setSaveMsg(null);
              }}
              aria-label="New family name"
            />
          ) : null}
        </>
      ) : (
        <div>
          <p className="mb-1 text-xs text-amber-900">No saved families for this brand — enter a family name.</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              id={`${idPrefix}-family-custom`}
              className={`${inputClass.replace("mt-1 ", "")} min-w-0 flex-1 basis-[min(100%,14rem)]`}
              placeholder="Family name *"
              value={customFamilyText}
              onChange={(e) => {
                setCustomFamilyText(sanitizeTextInput(e.target.value, 120));
                setCatalogFamilyKey("__new__");
                setSaveMsg(null);
              }}
            />
            {apiMode ? (
              <button
                type="button"
                disabled={!customFamilyText.trim() || saving}
                title="Save new family to database"
                onClick={() => void saveNewFamily()}
                className="shrink-0 rounded-md border border-zimson-500 bg-zimson-600 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "…" : "Save"}
              </button>
            ) : null}
          </div>
        </div>
      )}
      {saveMsg ? <p className="mt-1.5 text-xs font-medium text-emerald-800">{saveMsg}</p> : null}
      {loadError ? <p className="mt-1.5 text-xs text-red-800">{loadError}</p> : null}
    </div>
  );
}
