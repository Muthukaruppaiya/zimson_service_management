import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiJson } from "../lib/api";
import { sanitizePasswordInput } from "../lib/inputSanitize";
import type { SessionUser } from "../types/user";

const fieldCls =
  "mt-1.5 w-full border border-rlx-rule bg-white px-3 py-2.5 text-sm text-rlx-ink outline-none transition focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/20";

type ResetPasswordResponse = {
  ok: boolean;
  message: string;
  signedIn?: boolean;
  user?: SessionUser;
  code?: string;
  stores?: { id: string; name: string }[];
  loginId?: string;
};

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { adoptSession, login } = useAuth();
  const token = String(searchParams.get("token") ?? "").trim();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [storeOptions, setStoreOptions] = useState<{ id: string; name: string }[]>([]);
  const [storeId, setStoreId] = useState("");
  const [pendingLoginId, setPendingLoginId] = useState("");

  useEffect(() => {
    if (!token) {
      setValidating(false);
      setTokenValid(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<{ valid: boolean }>(
          `/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
        );
        if (!cancelled) setTokenValid(Boolean(data.valid));
      } catch {
        if (!cancelled) setTokenValid(false);
      } finally {
        if (!cancelled) setValidating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function finishSignIn(sessionUser: SessionUser) {
    await adoptSession(sessionUser);
    navigate("/", { replace: true });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiJson<ResetPasswordResponse>("/api/auth/reset-password", {
        method: "POST",
        json: { token, password, storeId: storeId || null },
      });
      if (data.signedIn && data.user) {
        setSuccess(data.message);
        await finishSignIn(data.user);
        return;
      }
      if (data.code === "STORE_SELECTION_REQUIRED" && Array.isArray(data.stores) && data.stores.length > 0) {
        setStoreOptions(data.stores);
        setPendingLoginId(String(data.loginId ?? "").trim());
        setSuccess(data.message);
        return;
      }
      setSuccess(data.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStoreContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) {
      setError("Select a store to continue.");
      return;
    }
    if (!pendingLoginId) {
      setError("Could not complete sign-in. Use the sign-in page with your new password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await login(pendingLoginId, password, storeId);
      if (result.ok) {
        navigate("/", { replace: true });
        return;
      }
      setError(result.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col" style={{ background: "linear-gradient(160deg, #0D1B5E 0%, #1B3A8F 50%, #102570 100%)" }}>
      <div className="h-[4px] w-full shrink-0" style={{ background: "linear-gradient(90deg, #A8850F, #C9A227, #F0DC90, #C9A227, #A8850F)" }} />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <img src="/zimson-logo.png" alt="Zimson" className="h-12 w-auto object-contain" />
        </div>

        <div className="w-full max-w-sm bg-white shadow-[0_32px_96px_-16px_rgba(0,0,0,0.6)]" style={{ borderTop: "3px solid #C9A227" }}>
          <div className="px-7 py-5" style={{ background: "#1B3A8F" }}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: "#C9A227" }}>
              Choose new password
            </h2>
          </div>

          <div className="px-7 py-6">
            {validating ? (
              <p className="text-sm text-stone-600">Checking reset link…</p>
            ) : !token || !tokenValid ? (
              <div className="space-y-3">
                <p className="text-sm text-red-800">
                  This reset link is invalid or has expired. Request a new one from the sign-in page.
                </p>
                <Link to="/login/forgot-password" className="text-xs font-semibold text-rlx-green hover:underline">
                  Request new link
                </Link>
              </div>
            ) : storeOptions.length > 0 ? (
              <form onSubmit={handleStoreContinue} className="space-y-4">
                <p className="text-sm text-emerald-900">{success}</p>
                <div>
                  <label htmlFor="reset-store" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rlx-ink-muted">
                    Select store
                  </label>
                  <select
                    id="reset-store"
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    className={fieldCls}
                    required
                  >
                    <option value="">Choose a store…</option>
                    {storeOptions.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </div>
                {error ? (
                  <div className="border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">{error}</div>
                ) : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3 text-xs font-bold uppercase tracking-[0.25em] transition disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #A8850F, #C9A227)", color: "#003a22" }}
                >
                  {busy ? "Signing in…" : "Continue to app"}
                </button>
              </form>
            ) : success ? (
              <p className="text-sm text-emerald-900">{success}</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="reset-password" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rlx-ink-muted">
                    New password
                  </label>
                  <input
                    id="reset-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(sanitizePasswordInput(e.target.value))}
                    className={fieldCls}
                    required
                    minLength={4}
                  />
                </div>
                <div>
                  <label htmlFor="reset-confirm" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rlx-ink-muted">
                    Confirm password
                  </label>
                  <input
                    id="reset-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(sanitizePasswordInput(e.target.value))}
                    className={fieldCls}
                    required
                    minLength={4}
                  />
                </div>
                {error ? (
                  <div className="border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">{error}</div>
                ) : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3 text-xs font-bold uppercase tracking-[0.25em] transition disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #A8850F, #C9A227)", color: "#003a22" }}
                >
                  {busy ? "Saving…" : "Update password"}
                </button>
              </form>
            )}
          </div>

          <div className="border-t border-rlx-rule bg-rlx-bg px-7 py-3">
            <Link to="/login" className="text-xs font-semibold text-rlx-green hover:underline">
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
