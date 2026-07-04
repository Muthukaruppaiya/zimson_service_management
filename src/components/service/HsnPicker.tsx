import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiJson } from "../../lib/api";
import { SearchableCombobox } from "./SearchableCombobox";
import type { HsnMasterRow } from "../../types/hsnMaster";

const defaultInputClass =
  "w-full rounded-lg border border-zimson-300 bg-zimson-50/50 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zimson-400/40";

type HsnPickerProps = {
  value: string;
  onChange: (code: string) => void;
  options: HsnMasterRow[];
  apiMode: boolean;
  onOptionsUpdated?: () => void;
  disabled?: boolean;
  idPrefix?: string;
  label?: string;
  required?: boolean;
  compact?: boolean;
  inputClass?: string;
  canSaveNew?: boolean;
};

function normalizeHsnDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 16);
}

export function HsnPicker({
  value,
  onChange,
  options,
  apiMode,
  onOptionsUpdated,
  disabled,
  idPrefix = "hsn",
  label = "HSN",
  required = false,
  compact = false,
  inputClass = defaultInputClass,
  canSaveNew = true,
}: HsnPickerProps) {
  const [catalogKey, setCatalogKey] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmittedRef = useRef("");

  const catalogRows = useMemo(() => {
    const by = new Map<string, HsnMasterRow>();
    for (const row of options) {
      const key = row.code.trim();
      if (!key) continue;
      if (!by.has(key)) by.set(key, row);
    }
    return [...by.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  }, [options]);

  const catalogCodeSet = useMemo(() => new Set(catalogRows.map((h) => h.code)), [catalogRows]);

  const comboboxOptions = useMemo(
    () =>
      catalogRows.map((h) => ({
        value: h.code,
        label: h.description?.trim() ? `${h.code} — ${h.description}` : h.code,
      })),
    [catalogRows],
  );

  const resolvedCode = useMemo(() => {
    if (catalogKey === "__new__") return normalizeHsnDigits(customCode);
    return catalogKey.trim();
  }, [catalogKey, customCode]);

  useEffect(() => {
    if (lastEmittedRef.current === resolvedCode) return;
    lastEmittedRef.current = resolvedCode;
    onChangeRef.current(resolvedCode);
  }, [resolvedCode]);

  useEffect(() => {
    const v = normalizeHsnDigits(value);
    if (catalogKey === "__new__" && normalizeHsnDigits(customCode) === v) return;
    if (catalogKey && catalogKey !== "__new__" && catalogKey === v) return;
    if (!v) {
      setCatalogKey("");
      setCustomCode("");
      lastEmittedRef.current = "";
      return;
    }
    const match = catalogRows.find((h) => h.code === v);
    if (match) {
      setCatalogKey(match.code);
      setCustomCode("");
      lastEmittedRef.current = v;
      return;
    }
    setCatalogKey("__new__");
    setCustomCode(v);
    lastEmittedRef.current = v;
  }, [value, catalogRows, catalogKey, customCode]);

  const applyTypedHsn = useCallback(
    (text: string) => {
      const digits = normalizeHsnDigits(text);
      if (!digits) return;
      const exact = catalogRows.find((h) => h.code === digits);
      if (exact) {
        setCatalogKey(exact.code);
        setCustomCode("");
        setSaveMsg(null);
        setLoadError(null);
        return;
      }
      setCatalogKey("__new__");
      setCustomCode(digits);
      setSaveMsg(null);
      setLoadError(null);
    },
    [catalogRows],
  );

  const reloadAfterSave = useCallback(async () => {
    await onOptionsUpdated?.();
  }, [onOptionsUpdated]);

  async function saveNewHsn() {
    const code = normalizeHsnDigits(catalogKey === "__new__" ? customCode : resolvedCode);
    if (!code || code.length < 4) {
      setLoadError("Enter a valid HSN code (at least 4 digits).");
      return;
    }
    if (!apiMode) {
      setLoadError("API mode is required to save HSN codes.");
      return;
    }
    if (!canSaveNew) {
      setLoadError("You do not have permission to add HSN codes.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    setLoadError(null);
    try {
      await apiJson("/api/hsn-master", {
        method: "POST",
        json: {
          code,
          description: newDescription.trim() || code,
        },
      });
      await reloadAfterSave();
      setCatalogKey(code);
      setCustomCode("");
      setNewDescription("");
      lastEmittedRef.current = code;
      onChangeRef.current(code);
      setSaveMsg("HSN saved.");
      window.setTimeout(() => setSaveMsg(null), 3500);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Could not save HSN.");
    } finally {
      setSaving(false);
    }
  }

  const pendingCode = normalizeHsnDigits(catalogKey === "__new__" ? customCode : resolvedCode);
  const needsSave = pendingCode.length >= 4 && !catalogCodeSet.has(pendingCode);
  const showSave = needsSave && apiMode && canSaveNew;
  const labelText = required ? `${label} *` : label;

  const comboboxShared = {
    inputClass,
    required,
    disabled,
    onInputChange: applyTypedHsn,
    placeholder: catalogRows.length === 0 ? "HSN code" : "Search or type HSN…",
    actionOption:
      catalogRows.length > 0
        ? ({ value: "__new__", label: "+ Add new HSN…" } as const)
        : undefined,
    onActionSelect: () => {
      setCatalogKey("__new__");
      setCustomCode("");
      setSaveMsg(null);
      setLoadError(null);
    },
  };

  return (
    <div className="min-w-[11rem]">
      {catalogRows.length === 0 && !compact ? (
        <p className="mb-1 text-[10px] text-amber-900">No HSN codes yet — type a code and Save.</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="min-w-0 flex-1">
          {catalogRows.length === 0 ? (
            <SearchableCombobox
              id={`${idPrefix}-hsn-custom`}
              label={compact ? undefined : labelText}
              freeText
              freeTextValue={customCode}
              onFreeTextChange={(t) => applyTypedHsn(t)}
              value="__new__"
              options={[]}
              onChange={() => {}}
              {...comboboxShared}
            />
          ) : (
            <SearchableCombobox
              id={`${idPrefix}-hsn`}
              label={compact ? undefined : labelText}
              value={catalogKey === "__new__" ? "" : catalogKey}
              options={comboboxOptions}
              onChange={(v) => {
                setSaveMsg(null);
                setLoadError(null);
                if (!v || v === "__new__") {
                  if (v === "__new__") {
                    setCatalogKey("__new__");
                    setCustomCode("");
                  } else {
                    setCatalogKey("");
                    setCustomCode("");
                  }
                  return;
                }
                setCatalogKey(v);
                setCustomCode("");
              }}
              freeText={catalogKey === "__new__"}
              freeTextValue={customCode}
              onFreeTextChange={(t) => applyTypedHsn(t)}
              {...comboboxShared}
            />
          )}
        </div>
        {showSave ? (
          <button
            type="button"
            disabled={disabled || pendingCode.length < 4 || saving}
            title="Save new HSN to master"
            onClick={() => void saveNewHsn()}
            className="shrink-0 rounded border border-emerald-400 bg-emerald-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
          >
            {saving ? "…" : "Save HSN"}
          </button>
        ) : null}
      </div>
      {!compact && catalogKey === "__new__" ? (
        <input
          className={`${inputClass} mt-1.5`}
          value={newDescription}
          disabled={disabled || saving}
          placeholder="Description (optional)"
          onChange={(e) => setNewDescription(e.target.value)}
        />
      ) : null}
      {saveMsg ? <p className="mt-1 text-[10px] font-medium text-emerald-800">{saveMsg}</p> : null}
      {loadError ? <p className="mt-1 text-[10px] text-red-800">{loadError}</p> : null}
      {needsSave && !showSave && !compact ? (
        <p className="mt-1 text-[10px] text-amber-800">HSN not in master — save it before submitting the invoice.</p>
      ) : null}
    </div>
  );
}
