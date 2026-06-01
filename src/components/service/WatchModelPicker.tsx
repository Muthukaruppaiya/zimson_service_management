import { useEffect, useMemo, useState } from "react";
import { ApiError, apiJson } from "../../lib/api";
import { watchModelsForBrand } from "../../data/serviceSeed";
import { SearchableCombobox } from "./SearchableCombobox";

export type WatchModelRow = { id: string; brand: string; model: string; refHint: string };

type WatchModelPickerProps = {
  watchBrand: string;
  apiMode: boolean;
  model: string;
  onModelChange: (model: string) => void;
  inputClass: string;
  idPrefix?: string;
  /** Current serial/ref — stored on the model row when saving a new catalog model. */
  serialHint?: string;
  disableAutoSelect?: boolean;
  onSelectionModeChange?: (isNewModel: boolean) => void;
};

export function WatchModelPicker({
  watchBrand,
  apiMode,
  model,
  onModelChange,
  inputClass,
  idPrefix = "wm",
  serialHint = "",
  disableAutoSelect = false,
  onSelectionModeChange,
}: WatchModelPickerProps) {
  const [dbWatchModels, setDbWatchModels] = useState<WatchModelRow[]>([]);
  const [catalogModelKey, setCatalogModelKey] = useState("");
  const [customModelText, setCustomModelText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiMode || !watchBrand.trim()) {
      setDbWatchModels([]);
      return;
    }
    let cancelled = false;
    void apiJson<{ models: { id: string; brand: string; model: string; refHint: string | null }[] }>(
      `/api/service/watch-models?brand=${encodeURIComponent(watchBrand)}`,
    )
      .then((out) => {
        if (cancelled) return;
        setDbWatchModels(
          out.models.map((row) => ({
            id: row.id,
            brand: row.brand,
            model: row.model,
            refHint: row.refHint ?? "",
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setDbWatchModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [apiMode, watchBrand]);

  const catalogModels = useMemo(() => {
    const seed = watchModelsForBrand(watchBrand).map((m) => ({
      id: m.id,
      brand: m.brand,
      model: m.model,
      refHint: m.refHint,
    }));
    const by = new Map<string, WatchModelRow>();
    for (const m of seed) by.set(m.model.trim().toLowerCase(), m);
    for (const m of dbWatchModels) {
      const key = m.model.trim().toLowerCase();
      if (!by.has(key)) by.set(key, m);
    }
    return [...by.values()].sort((a, b) => a.model.localeCompare(b.model));
  }, [watchBrand, dbWatchModels]);

  const resolvedModel = useMemo(() => {
    if (catalogModelKey === "__new__") return customModelText.trim();
    return catalogModelKey.trim();
  }, [catalogModelKey, customModelText]);

  useEffect(() => {
    onModelChange(resolvedModel);
  }, [resolvedModel, onModelChange]);

  useEffect(() => {
    onSelectionModeChange?.(catalogModelKey === "__new__" || catalogModels.length === 0);
  }, [catalogModelKey, catalogModels.length, onSelectionModeChange]);

  useEffect(() => {
    const name = model.trim();
    if (!name) return;
    if (catalogModels.some((x) => x.model === name)) {
      setCatalogModelKey(name);
      setCustomModelText("");
      return;
    }
    setCatalogModelKey("__new__");
    setCustomModelText(name);
  }, [model, catalogModels]);

  useEffect(() => {
    if (disableAutoSelect) {
      setCatalogModelKey("");
      setCustomModelText("");
    } else {
      setCatalogModelKey("__new__");
      setCustomModelText(model.trim() ? model : "");
    }
    setSaveMsg(null);
  }, [watchBrand, disableAutoSelect]);

  useEffect(() => {
    if (disableAutoSelect) return;
    if (catalogModelKey === "__new__") return;
    if (catalogModels.some((m) => m.model === catalogModelKey)) return;
    if (catalogModels.length === 0) {
      setCatalogModelKey("__new__");
      return;
    }
    setCatalogModelKey(catalogModels[0]!.model);
    setCustomModelText("");
  }, [catalogModels, catalogModelKey, disableAutoSelect]);

  async function saveNewModel() {
    const name =
      catalogModelKey === "__new__"
        ? customModelText.trim()
        : catalogModels.length === 0
          ? customModelText.trim()
          : "";
    if (!watchBrand.trim() || !name) return;
    if (!apiMode) {
      setLoadError("Turn on API mode (VITE_USE_API) to save models to the server.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    setLoadError(null);
    try {
      await apiJson<{ ok: boolean }>("/api/service/watch-models", {
        method: "POST",
        json: {
          brand: watchBrand.trim(),
          model: name,
          refHint: serialHint.trim() || null,
        },
      });
      const list = await apiJson<{ models: { id: string; brand: string; model: string; refHint: string | null }[] }>(
        `/api/service/watch-models?brand=${encodeURIComponent(watchBrand)}`,
      );
      setDbWatchModels(
        list.models.map((row) => ({
          id: row.id,
          brand: row.brand,
          model: row.model,
          refHint: row.refHint ?? "",
        })),
      );
      setCatalogModelKey(name);
      setCustomModelText("");
      setSaveMsg("Saved — appears in the model list for this brand.");
      window.setTimeout(() => setSaveMsg(null), 4000);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Could not save model.");
    } finally {
      setSaving(false);
    }
  }

  const comboboxOptions = useMemo(
    () => catalogModels.map((m) => ({ value: m.model, label: m.model })),
    [catalogModels],
  );

  if (catalogModels.length === 0) {
    return (
      <div className="min-w-0">
        <p className="mb-1 text-xs text-amber-900">No saved models for this brand — enter the model name.</p>
        <div className="flex flex-wrap items-center gap-2">
          <SearchableCombobox
            id={`${idPrefix}-model-custom`}
            freeText
            freeTextValue={customModelText}
            onFreeTextChange={(t) => {
              setCustomModelText(t);
              setCatalogModelKey("__new__");
              setSaveMsg(null);
            }}
            value="__new__"
            options={[]}
            onChange={() => {}}
            inputClass={inputClass}
            placeholder="Model name *"
          />
          {apiMode ? (
            <button
              type="button"
              disabled={!customModelText.trim() || saving}
              onClick={() => void saveNewModel()}
              className="shrink-0 border border-rlx-gold/60 bg-white px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rlx-green hover:bg-rlx-green-light disabled:opacity-50"
            >
              {saving ? "…" : "Save"}
            </button>
          ) : null}
        </div>
        {saveMsg ? <p className="mt-1 text-xs text-emerald-800">{saveMsg}</p> : null}
        {loadError ? <p className="mt-1 text-xs text-red-800">{loadError}</p> : null}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <SearchableCombobox
            id={`${idPrefix}-model`}
            label="Model *"
            value={catalogModelKey === "__new__" ? "" : catalogModelKey}
            options={comboboxOptions}
            onChange={(v) => {
              setSaveMsg(null);
              if (!v) {
                setCatalogModelKey("");
                setCustomModelText("");
                return;
              }
              setCatalogModelKey(v);
              setCustomModelText("");
            }}
            inputClass={inputClass}
            placeholder="Search or select model…"
            actionOption={{ value: "__new__", label: "+ Add new model…" }}
            onActionSelect={() => {
              setCatalogModelKey("__new__");
              setCustomModelText("");
            }}
            freeText={catalogModelKey === "__new__"}
            freeTextValue={customModelText}
            onFreeTextChange={(t) => {
              setCustomModelText(t);
              setCatalogModelKey("__new__");
              setSaveMsg(null);
            }}
          />
        </div>
        {catalogModelKey === "__new__" && apiMode ? (
          <button
            type="button"
            disabled={!customModelText.trim() || saving}
            title="Save new model to database"
            onClick={() => void saveNewModel()}
            className="mt-6 shrink-0 border border-rlx-gold/60 bg-white px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rlx-green hover:bg-rlx-green-light disabled:opacity-50"
          >
            {saving ? "…" : "Save"}
          </button>
        ) : null}
      </div>
      {saveMsg ? <p className="mt-1 text-xs font-medium text-emerald-800">{saveMsg}</p> : null}
      {loadError ? <p className="mt-1 text-xs text-red-800">{loadError}</p> : null}
    </div>
  );
}
