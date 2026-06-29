import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../lib/api";
import type { AppNotification } from "../types/notification";

export function useAppNotifications(pollMs = 20000) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<{ notifications: AppNotification[] }>("/api/notifications");
      setNotifications(data.notifications);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await apiJson("/api/notifications/read-all", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return { notifications, unreadCount, loading, reload: load, markAllRead };
}
