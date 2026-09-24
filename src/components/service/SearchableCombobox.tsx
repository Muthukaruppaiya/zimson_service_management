import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Second line in the dropdown (brand, SKU, price, etc.). */
  hint?: string;
  /** Extra haystack for type-to-search (description, MRP, SKU, brand…). */
  searchText?: string;
};

type SearchableComboboxProps = {
  id: string;
  label?: string;
  /** Selected option value (empty string = none). */
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  inputClass: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Option pinned at bottom (e.g. add new). */
  actionOption?: ComboboxOption;
  onActionSelect?: () => void;
  /** Free-text mode — input drives `onInputChange` instead of picking from list. */
  freeText?: boolean;
  freeTextValue?: string;
  onFreeTextChange?: (text: string) => void;
  /** Fired on every keystroke in the input (search or free-text). */
  onInputChange?: (text: string) => void;
};

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

export function SearchableCombobox({
  id,
  label,
  value,
  options,
  onChange,
  inputClass,
  placeholder = "Type to search or select…",
  disabled,
  required,
  actionOption,
  onActionSelect,
  freeText = false,
  freeTextValue = "",
  onFreeTextChange,
  onInputChange,
}: SearchableComboboxProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? "",
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const tokens = q.split(/\s+/).filter(Boolean);
    return options.filter((o) => {
      const hay = `${o.label} ${o.value} ${o.hint ?? ""} ${o.searchText ?? ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [options, query]);

  const showList = open && !freeText && !disabled;

  function updateMenuPos() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 10;
    const spaceAbove = r.top - 10;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(224, openUp ? spaceAbove : spaceBelow));
    const width = Math.max(r.width, 320);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setMenuPos({
      top: openUp ? Math.max(8, r.top - maxHeight - 4) : r.bottom + 4,
      left,
      width,
      maxHeight,
    });
  }

  useEffect(() => {
    if (freeText) {
      setOpen(false);
      setQuery("");
    }
  }, [freeText]);

  useLayoutEffect(() => {
    if (!showList) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
    const onWin = () => updateMenuPos();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [showList, query, filtered.length]);

  useEffect(() => {
    if (!showList) return;
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [showList]);

  const inputDisplay = freeText ? freeTextValue : open ? query : value ? selectedLabel : query;

  function handleInputChange(text: string) {
    onInputChange?.(text);
    if (freeText) {
      onFreeTextChange?.(text);
      return;
    }
    setQuery(text);
    setOpen(true);
    if (value && text !== selectedLabel) onChange("");
  }

  function pick(opt: ComboboxOption) {
    onChange(opt.value);
    setQuery("");
    setOpen(false);
  }

  const fieldClass = inputClass.replace(/\bmt-1\b/g, "").trim();

  const list = showList ? (
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      style={
        menuPos
          ? {
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
              zIndex: 90,
            }
          : { display: "none" }
      }
      className="overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.18)]"
    >
      {filtered.length === 0 ? (
        <li className="px-3 py-2.5 text-xs text-rlx-ink-muted">No matches</li>
      ) : (
        filtered.map((o) => (
          <li key={o.value}>
            <button
              type="button"
              role="option"
              aria-selected={value === o.value}
              className={`w-full px-3 py-2.5 text-left text-sm hover:bg-rlx-green-light ${
                value === o.value ? "bg-rlx-green-light/80 font-semibold text-rlx-green" : "text-rlx-ink"
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
            >
              <span className="block truncate">{o.label}</span>
              {o.hint ? (
                <span className="mt-0.5 block truncate text-[11px] font-normal text-stone-400">{o.hint}</span>
              ) : null}
            </button>
          </li>
        ))
      )}
      {actionOption ? (
        <li className="border-t border-rlx-rule">
          <button
            type="button"
            className="w-full px-3 py-2.5 text-left text-sm font-semibold text-rlx-green hover:bg-rlx-bg"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onActionSelect?.();
              onChange(actionOption.value);
              setQuery("");
              setOpen(false);
            }}
          >
            {actionOption.label}
          </button>
        </li>
      ) : null}
    </ul>
  ) : null;

  return (
    <div ref={rootRef} className="relative min-w-0">
      {label ? (
        <label htmlFor={id} className="text-xs font-medium text-stone-600">
          {label}
        </label>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete={freeText ? "none" : "list"}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        required={Boolean(required) && (freeText ? !freeTextValue?.trim() : !value)}
        value={inputDisplay}
        placeholder={placeholder}
        className={`${fieldClass} ${label ? "mt-1" : ""}`}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          if (!freeText) {
            setOpen(true);
            if (value && !query) setQuery(selectedLabel);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
          if (e.key === "Enter" && open && filtered.length === 1 && !freeText) {
            e.preventDefault();
            pick(filtered[0]!);
          }
        }}
      />
      {list && typeof document !== "undefined" ? createPortal(list, document.body) : null}
    </div>
  );
}
