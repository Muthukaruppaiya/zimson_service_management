import {
  defaultQuickLinkIdsForUser,
  type DashboardQuickLinkId,
  DASHBOARD_QUICK_LINK_CATALOG,
} from "./dashboardQuickLinks";
import type { SessionUser } from "../types/user";

const STORAGE_PREFIX = "zimson_dashboard_quick_links_v2";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

function isQuickLinkId(v: string): v is DashboardQuickLinkId {
  return DASHBOARD_QUICK_LINK_CATALOG.some((x) => x.id === v);
}

export function loadDashboardQuickLinkIds(user: SessionUser | null): DashboardQuickLinkId[] {
  if (!user?.id) return defaultQuickLinkIdsForUser(user);
  try {
    const raw = localStorage.getItem(storageKey(user.id));
    if (!raw) return defaultQuickLinkIdsForUser(user);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultQuickLinkIdsForUser(user);
    const ids = parsed.filter((x): x is DashboardQuickLinkId => typeof x === "string" && isQuickLinkId(x));
    return ids.length > 0 ? ids : defaultQuickLinkIdsForUser(user);
  } catch {
    return defaultQuickLinkIdsForUser(user);
  }
}

export function saveDashboardQuickLinkIds(userId: string, ids: DashboardQuickLinkId[]): void {
  localStorage.setItem(storageKey(userId), JSON.stringify(ids));
}
