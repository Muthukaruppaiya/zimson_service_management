import { useEffect, useId, useMemo, useRef, useState } from "react";

export type ComboboxOption = { value: string; label: string };

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? "",
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (freeText) {
      setOpen(false);
      setQuery("");
    }
  }, [freeText]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

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

  return (
    <div ref={rootRef} className="relative min-w-0">
      {label ? (
        <label htmlFor={id} className="text-xs font-medium text-stone-600">
          {label}
        </label>
      ) : null}
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open && !freeText}
        aria-controls={listId}
        aria-autocomplete={freeText ? "none" : "list"}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        required={required && !freeText ? !value : !freeTextValue?.trim()}
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
      {open && !freeText && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-0.5 max-h-48 w-full overflow-y-auto border border-rlx-rule bg-white shadow-md"
        >
          {filtered.length === 0 ? (
            <li className="px-2 py-2 text-[11px] text-rlx-ink-muted">No matches</li>
          ) : (
            filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === o.value}
                  className={`w-full px-2 py-1.5 text-left text-[11px] hover:bg-rlx-green-light ${
                    value === o.value ? "bg-rlx-green-light/80 font-semibold text-rlx-green" : "text-rlx-ink"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
          {actionOption ? (
            <li className="border-t border-rlx-rule">
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-[11px] font-semibold text-rlx-green hover:bg-rlx-bg"
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
      ) : null}
    </div>
  );
}
