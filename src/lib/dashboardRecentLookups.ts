export type RecentLookup = {
  id: string;
  query: string;
  label: string;
  kind: string;
  to: string;
  at: string;
};

const STORAGE_KEY = "zimson_dashboard_recent_lookups";
const MAX = 8;

export function loadRecentLookups(): RecentLookup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentLookup[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushRecentLookup(entry: { query: string; label: string; kind: string; to: string }) {
  const query = entry.query.trim();
  if (!query) return;
  const next: RecentLookup = {
    id: `${entry.kind}:${query}:${Date.now()}`,
    query,
    label: entry.label,
    kind: entry.kind,
    to: entry.to,
    at: new Date().toISOString(),
  };
  const prev = loadRecentLookups().filter((r) => !(r.kind === next.kind && r.query.toLowerCase() === query.toLowerCase()));
  const merged = [next, ...prev].slice(0, MAX);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(new CustomEvent("dashboard-recent-lookups"));
}
