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

type MfaUser = {
  id: string;
  displayName: string;
  email: string;
  employeeCode: string | null;
  role: string;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
};

export function ActiveSessionsPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mfaUsers, setMfaUsers] = useState<MfaUser[]>([]);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [resetTarget, setResetTarget] = useState<MfaUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const loadMfaUsers = useCallback(async () => {
    setMfaLoading(true);
    try {
      const data = await apiJson<{ users: MfaUser[] }>("/api/auth/admin/mfa-users");
      setMfaUsers(data.users ?? []);
    } catch {
      setMfaUsers([]);
    } finally {
      setMfaLoading(false);
    }
  }, []);

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
    if (user?.role === "super_admin") {
      void load();
      void loadMfaUsers();
    }
  }, [user?.role, load, loadMfaUsers]);

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

  async function submitMfaReset() {
    if (!resetTarget) return;
    if (!resetPassword.trim()) {
      setResetError("Enter your own password to confirm.");
      return;
    }
    setResetBusy(true);
    setResetError(null);
    try {
      const data = await apiJson<{ message: string }>(
        `/api/auth/admin/users/${encodeURIComponent(resetTarget.id)}/mfa-reset`,
        { method: "POST", json: { password: resetPassword } },
      );
      setResetTarget(null);
      setResetPassword("");
      setMessage({ type: "ok", text: data.message });
      await Promise.all([load(), loadMfaUsers()]);
    } catch (e) {
      setResetError(e instanceof ApiError ? e.message : "Could not reset MFA.");
    } finally {
      setResetBusy(false);
    }
  }

  const byUser = sessions.reduce<Record<string, ActiveSession[]>>((acc, s) => {
    (acc[s.userId] ??= []).push(s);
    return acc;
  }, {});

  return (
    <ListPageShell
      breadcrumb="Logged-in users"
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

      <Card
        title="Two-factor authentication (MFA)"
        subtitle="Lockout recovery. Reset only when a user has lost both their authenticator app and all recovery codes — this removes 2FA until they re-enrol."
      >
        {mfaLoading ? (
          <p className="text-sm text-stone-600">Loading…</p>
        ) : mfaUsers.length === 0 ? (
          <p className="text-sm text-stone-600">No users have enabled MFA yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">MFA since</th>
                  <th className="px-3 py-2">Recovery codes left</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mfaUsers.map((m) => (
                  <tr key={m.id} className="border-b border-stone-100">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-stone-900">{m.displayName}</p>
                      <p className="text-xs text-stone-500">
                        {m.employeeCode ? `${m.employeeCode} · ` : ""}
                        {m.email}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-stone-700">{m.role}</td>
                    <td className="px-3 py-2.5 text-stone-600">
                      {m.enabledAt ? new Date(m.enabledAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          m.recoveryCodesRemaining === 0
                            ? "bg-red-100 text-red-900"
                            : m.recoveryCodesRemaining <= 2
                              ? "bg-amber-100 text-amber-900"
                              : "bg-emerald-100 text-emerald-900"
                        }`}
                      >
                        {m.recoveryCodesRemaining}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setResetTarget(m);
                          setResetPassword("");
                          setResetError(null);
                        }}
                        className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-50"
                      >
                        Reset MFA
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {resetTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-stone-900">
              Reset MFA for {resetTarget.displayName}?
            </h3>
            <p className="mt-2 text-sm text-stone-600">
              This turns off two-factor authentication and signs the user out everywhere. They will be
              able to sign in with only their password until they enrol again. Confirm with your own
              password.
            </p>
            <input
              type="password"
              autoFocus
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Your password"
              className="mt-3 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            {resetError ? <p className="mt-2 text-sm text-red-700">{resetError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                disabled={resetBusy}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitMfaReset()}
                disabled={resetBusy}
                className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {resetBusy ? "Resetting…" : "Reset MFA"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ListPageShell>
  );
}
