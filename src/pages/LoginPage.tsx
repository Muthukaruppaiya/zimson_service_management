import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiJson } from "../lib/api";
import { sanitizeLoginIdInput, sanitizePasswordInput } from "../lib/inputSanitize";

export function LoginPage() {
  const { user, login, authReady } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [storeId, setStoreId] = useState("");
  const [storeOptions, setStoreOptions] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState(false);
  const [signOutAllBusy, setSignOutAllBusy] = useState(false);
  const [signOutAllNote, setSignOutAllNote] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  if (!authReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-rlx-bg text-sm text-rlx-ink-muted">
        Checking session…
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSignOutAllNote(null);
    const result = await login(loginId, password, storeId || null);
    if (result.ok) {
      setAlreadyLoggedIn(false);
      navigate(from === "/login" ? "/" : from, { replace: true });
    } else if ("code" in result && result.code === "STORE_SELECTION_REQUIRED" && result.stores) {
      setStoreOptions(result.stores);
      setStoreId("");
      setError(result.message);
      setAlreadyLoggedIn(false);
    } else {
      setStoreOptions([]);
      setError(result.message);
      setAlreadyLoggedIn("code" in result && result.code === "ALREADY_LOGGED_IN");
    }
  }

  async function handleSignOutAllDevices() {
    if (!loginId.trim() || !password) {
      setSignOutAllNote("Enter your employee ID and password first.");
      return;
    }
    setSignOutAllBusy(true);
    setSignOutAllNote(null);
    try {
      const data = await apiJson<{ ok: boolean; message: string }>("/api/auth/sign-out-all-devices", {
        method: "POST",
        json: {
          loginId: loginId.trim(),
          employeeCode: loginId.trim(),
          password: password.trim(),
        },
      });
      setAlreadyLoggedIn(false);
      setError(null);
      setSignOutAllNote(data.message || "All devices signed out. Click Sign in again.");
    } catch (e) {
      setSignOutAllNote(e instanceof ApiError ? e.message : "Could not sign out all devices.");
    } finally {
      setSignOutAllBusy(false);
    }
  }

  const fieldCls =
    "mt-1.5 w-full border border-rlx-rule bg-white px-3 py-2.5 text-sm text-rlx-ink placeholder-rlx-ink-muted/50 outline-none transition focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/20";

  return (
    <div className="flex min-h-dvh flex-col" style={{ background: "linear-gradient(160deg, #0D1B5E 0%, #1B3A8F 50%, #102570 100%)" }}>
      <div className="h-[4px] w-full shrink-0" style={{ background: "linear-gradient(90deg, #A8850F, #C9A227, #F0DC90, #C9A227, #A8850F)" }} />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="mb-10 flex flex-col items-center gap-5 text-center">
          <div
            className="flex items-center justify-center px-6 py-4 shadow-[0_0_0_1px_rgba(201,162,39,0.35),0_12px_48px_rgba(0,0,0,0.6)]"
            style={{ background: "linear-gradient(135deg, #0D1B5E 0%, #1B3A8F 50%, #102570 100%)" }}
          >
            <img src="/zimson-logo.png" alt="Zimson" className="h-14 w-auto object-contain" />
          </div>
          <div>
            <div className="mx-auto h-[1.5px] w-24" style={{ background: "linear-gradient(90deg, transparent, #C9A227, transparent)" }} />
            <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.45em]" style={{ color: "#C9A227" }}>
              Service Management Suite
            </p>
          </div>
        </div>

        <div className="w-full max-w-sm bg-white shadow-[0_32px_96px_-16px_rgba(0,0,0,0.6)]" style={{ borderTop: "3px solid #C9A227" }}>
          <div className="px-7 py-5" style={{ background: "#1B3A8F" }}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: "#C9A227" }}>
              Sign in
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-7 py-6">
            <div>
              <label htmlFor="login-emp" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rlx-ink-muted">
                Employee ID
              </label>
              <input
                id="login-emp"
                type="text"
                autoComplete="username"
                value={loginId}
                onChange={(e) => {
                  setLoginId(sanitizeLoginIdInput(e.target.value));
                  setAlreadyLoggedIn(false);
                }}
                className={fieldCls}
              />
            </div>

            {storeOptions.length > 0 ? (
              <div>
                <label htmlFor="login-store" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rlx-ink-muted">
                  Select store
                </label>
                <select
                  id="login-store"
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  className={fieldCls}
                >
                  <option value="">Choose a store…</option>
                  {storeOptions.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-rlx-ink-muted">
                  Multiple store access detected. Choose one store to proceed.
                </p>
              </div>
            ) : null}

            <div>
              <div className="flex items-end justify-between gap-2">
                <label htmlFor="login-password" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rlx-ink-muted">
                  Password
                </label>
                <Link
                  to="/login/forgot-password"
                  className="text-[10px] font-semibold text-rlx-green hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(sanitizePasswordInput(e.target.value));
                  setAlreadyLoggedIn(false);
                }}
                className={fieldCls}
                placeholder="••••••••"
              />
            </div>

            {alreadyLoggedIn ? (
              <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-950">
                <p className="font-semibold">Account already in use</p>
                <p className="leading-relaxed">
                  {error ??
                    "Someone is already signed in with this account. They must sign out, or you can end all sessions with your password below."}
                </p>
                <p className="text-[11px] text-amber-900/90">
                  The signed-in user will see a popup that another person tried to log in.
                </p>
                <button
                  type="button"
                  disabled={signOutAllBusy}
                  onClick={() => void handleSignOutAllDevices()}
                  className="w-full rounded-lg border border-amber-600 bg-white py-2.5 text-[11px] font-bold uppercase tracking-wide text-amber-950 hover:bg-amber-100 disabled:opacity-60"
                >
                  {signOutAllBusy ? "Signing out all devices…" : "Sign out all devices & try again"}
                </button>
              </div>
            ) : error ? (
              <div className="border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">{error}</div>
            ) : null}

            {signOutAllNote ? (
              <div className="border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900">
                {signOutAllNote}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={storeOptions.length > 0 && !storeId}
              className="mt-1 w-full py-3 text-xs font-bold uppercase tracking-[0.25em] transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #A8850F, #C9A227)", color: "#003a22" }}
            >
              Sign in →
            </button>
          </form>

          <div className="border-t border-rlx-rule bg-rlx-bg px-7 py-3">
            <p className="text-[10px] text-rlx-ink-muted">
              Having trouble?{" "}
              <Link to="/" className="font-semibold text-rlx-green hover:underline">
                Go to home
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
