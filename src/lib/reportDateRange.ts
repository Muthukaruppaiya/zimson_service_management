export type ReportDateRange = { from: string; to: string };

export type ReportDatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "custom";

export const REPORT_DATE_PRESETS: Array<{ value: ReportDatePreset; label: string }> = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "custom", label: "Custom range" },
];

export const EMPTY_REPORT_DATE_RANGE: ReportDateRange = { from: "", to: "" };

export function localDayString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function rangeForPreset(preset: ReportDatePreset, now = new Date()): ReportDateRange | null {
  const today = localDayString(now);
  switch (preset) {
    case "all":
      return { from: "", to: "" };
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = localDayString(addDays(now, -1));
      return { from: y, to: y };
    }
    case "last7":
      return { from: localDayString(addDays(now, -6)), to: today };
    case "last30":
      return { from: localDayString(addDays(now, -29)), to: today };
    case "thisMonth":
      return { from: localDayString(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case "lastMonth":
      return {
        from: localDayString(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: localDayString(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    default:
      return null;
  }
}

export function presetForRange(range: ReportDateRange): ReportDatePreset {
  if (!range.from && !range.to) return "all";
  for (const p of REPORT_DATE_PRESETS) {
    if (p.value === "all" || p.value === "custom") continue;
    const r = rangeForPreset(p.value);
    if (r && r.from === range.from && r.to === range.to) return p.value;
  }
  return "custom";
}

/** True when the ISO timestamp falls inside the (inclusive, local-day) range. Empty range matches everything. */
export function isInReportDateRange(iso: string | null | undefined, range: ReportDateRange): boolean {
  if (!range.from && !range.to) return true;
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const day = localDayString(d);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

function displayDay(day: string): string {
  const [y, m, d] = day.split("-");
  return y && m && d ? `${d}-${m}-${y}` : day;
}

export function describeReportDateRange(range: ReportDateRange, label = "Date"): string {
  if (!range.from && !range.to) return `${label}: All dates`;
  if (range.from && range.to) return `${label}: ${displayDay(range.from)} to ${displayDay(range.to)}`;
  if (range.from) return `${label}: from ${displayDay(range.from)}`;
  return `${label}: up to ${displayDay(range.to)}`;
}
