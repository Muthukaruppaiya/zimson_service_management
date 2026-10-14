import { FilterField } from "../ui/FilterField";
import {
  REPORT_DATE_PRESETS,
  presetForRange,
  rangeForPreset,
  type ReportDatePreset,
  type ReportDateRange,
} from "../../lib/reportDateRange";

type Props = {
  value: ReportDateRange;
  onChange: (next: ReportDateRange) => void;
  /** Field label prefix, e.g. "Created" → "Created from" / "Created to". */
  label?: string;
  idPrefix: string;
  fieldClassName?: string;
  className?: string;
  /** Hide the "All dates" period option (for reports that always need a range). */
  requireRange?: boolean;
};

export function ReportDateFilter({
  value,
  onChange,
  label = "Date",
  idPrefix,
  fieldClassName = "ui-field",
  className = "min-w-0",
  requireRange = false,
}: Props) {
  const preset = presetForRange(value);
  const presets = requireRange ? REPORT_DATE_PRESETS.filter((p) => p.value !== "all") : REPORT_DATE_PRESETS;

  function pickPreset(next: ReportDatePreset) {
    const r = rangeForPreset(next);
    if (r) onChange(r);
  }

  return (
    <>
      <FilterField label={`${label} period`} htmlFor={`${idPrefix}-period`} className={className}>
        <select
          id={`${idPrefix}-period`}
          className={fieldClassName}
          value={preset}
          onChange={(e) => pickPreset(e.target.value as ReportDatePreset)}
        >
          {presets.map((p) => (
            <option key={p.value} value={p.value} disabled={p.value === "custom"}>
              {p.label}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label={`${label} from`} htmlFor={`${idPrefix}-from`} className={className}>
        <input
          id={`${idPrefix}-from`}
          type="date"
          className={fieldClassName}
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
      </FilterField>
      <FilterField label={`${label} to`} htmlFor={`${idPrefix}-to`} className={className}>
        <input
          id={`${idPrefix}-to`}
          type="date"
          className={fieldClassName}
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </FilterField>
    </>
  );
}
