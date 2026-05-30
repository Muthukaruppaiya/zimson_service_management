import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { ListPageShell } from "../../components/layout/ListPageShell";
import { Card } from "../../components/ui/Card";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson } from "../../lib/api";

type ActiveSession = {
  sessionId: string;
  userId: string;
  displayName: string;
  email: string;
  employeeCode: string | null;
  role: string;
  createdAt: string;
  expiresAt: string;
  hasLoginAlert: boolean;
};

export function ActiveSessionsPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ sessions: ActiveSession[] }>("/api/auth/admin/sessions");
      setSessions(data.sessions ?? []);
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof ApiError ? e.message : "Could not load sessions.",
      });
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "super_admin") void load();
  }, [user?.role, load]);

  if (!user) return null;
  if (user.role !== "super_admin") {
    return <Navigate to="/" replace />;
  }

  async function revokeSession(sessionId: string) {
    setBusyId(sessionId);
    setMessage(null);
    try {
      await apiJson(`/api/auth/admin/sessions/${encodeURIComponent(sessionId)}/revoke`, {
        method: "POST",
      });
      setMessage({ type: "ok", text: "Session ended. That device will be signed out." });
      await load();
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof ApiError ? e.message : "Could not sign out session.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function revokeAllForUser(userId: string) {
    setBusyId(`user-${userId}`);
    setMessage(null);
    try {
      const data = await apiJson<{ message: string }>(
        `/api/auth/admin/users/${encodeURIComponent(userId)}/revoke-all-sessions`,
        { method: "POST" },
      );
      setMessage({ type: "ok", text: data.message });
      await load();
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof ApiError ? e.message : "Could not sign out all sessions.",
      });
    } finally {
      setBusyId(null);
    }
  }

  const byUser = sessions.reduce<Record<string, ActiveSession[]>>((acc, s) => {
    (acc[s.userId] ??= []).push(s);
    return acc;
  }, {});

  return (
    <ListPageShell
      eyebrow="Settings"
      title="Logged-in users"
      countLabel={`${sessions.length} active session${sessions.length === 1 ? "" : "s"}`}
      actions={
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="border border-rlx-rule bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-rlx-green hover:bg-rlx-green-light disabled:opacity-50"
        >
          Refresh
        </button>
      }
    >
      <Card
        title="Active sessions"
        subtitle="Super Admin only. Force sign-out frees the account so someone else can sign in on another device."
      >
        {message ? (
          <p
            className={`mb-4 rounded-lg px-3 py-2 text-sm ${
              message.type === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"
            }`}
          >
            {message.text}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-stone-600">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-stone-600">No users are signed in right now.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Signed in</th>
                  <th className="px-3 py-2">Expires</th>
                  <th className="px-3 py-2">Alert</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.sessionId} className="border-b border-stone-100">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-stone-900">{s.displayName}</p>
                      <p className="text-xs text-stone-500">
                        {s.employeeCode ? `${s.employeeCode} · ` : ""}
                        {s.email}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-stone-700">{s.role}</td>
                    <td className="px-3 py-2.5 text-stone-600">{new Date(s.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-stone-600">{new Date(s.expiresAt).toLocaleString()}</td>
                    <td className="px-3 py-2.5">
                      {s.hasLoginAlert ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                          Login attempt
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void revokeSession(s.sessionId)}
                        className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                      >
                        {busyId === s.sessionId ? "…" : "Sign out device"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Object.entries(byUser).some(([, list]) => list.length > 1) ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
                <p className="w-full text-xs text-stone-500">Users with multiple sessions:</p>
                {Object.entries(byUser)
                  .filter(([, list]) => list.length > 1)
                  .map(([userId, list]) => (
                    <button
                      key={userId}
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void revokeAllForUser(userId)}
                      className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                    >
                      Sign out all ({list[0]!.displayName}) — {list.length} sessions
                    </button>
                  ))}
              </div>
            ) : null}
          </div>
        )}
      </Card>
    </ListPageShell>
  );
}
