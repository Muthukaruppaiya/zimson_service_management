import { localDateInputValue } from "./analyticsApi";

export type DatePresetKey = "7d" | "30d" | "90d" | "mtd" | "ytd";

export const DATE_PRESETS: { key: DatePresetKey; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "mtd", label: "Month to date" },
  { key: "ytd", label: "Year to date" },
];

export function dateRangeForPreset(key: DatePresetKey): { from: string; to: string } {
  const to = localDateInputValue();
  const end = new Date();
  const start = new Date(end);
  if (key === "7d") start.setDate(end.getDate() - 6);
  else if (key === "30d") start.setDate(end.getDate() - 29);
  else if (key === "90d") start.setDate(end.getDate() - 89);
  else if (key === "mtd") start.setDate(1);
  else if (key === "ytd") start.setMonth(0, 1);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return { from: `${y}-${m}-${d}`, to };
}
