import { useMemo, useState } from "react";

export type SearchableSelectOption = { value: string; label: string };

type SearchableSelectProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  inputClass: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  emptyOption?: { value: string; label: string };
  extraOptions?: SearchableSelectOption[];
};

export function SearchableSelect({
  id,
  label,
  value,
  onChange,
  options,
  inputClass,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  disabled,
  required,
  emptyOption,
  extraOptions = [],
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...options, ...extraOptions];
    if (!q) return all;
    return all.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, extraOptions, query]);

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-xs font-medium text-stone-600">
        {label}
      </label>
      <input
        type="search"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        className={`${inputClass} mt-1`}
        aria-label={`${label} search`}
      />
      <select
        id={id}
        value={value}
        disabled={disabled}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} mt-1`}
      >
        {emptyOption ? <option value={emptyOption.value}>{emptyOption.label}</option> : null}
        {!emptyOption && !value ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {filtered.map((o) => (
          <option key={`${o.value}-${o.label}`} value={o.value}>
            {o.label}
          </option>
        ))}
        {filtered.length === 0 ? (
          <option value="" disabled>
            No matches
          </option>
        ) : null}
      </select>
    </div>
  );
}
