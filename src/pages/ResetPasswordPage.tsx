import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, apiJson } from "../lib/api";
import { sanitizePasswordInput } from "../lib/inputSanitize";

const fieldCls =
  "mt-1.5 w-full border border-rlx-rule bg-white px-3 py-2.5 text-sm text-rlx-ink outline-none transition focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/20";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get("token") ?? "").trim();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      const data = await apiJson<{ ok: boolean; message: string }>("/api/auth/reset-password", {
        method: "POST",
        json: { token, password },
      });
      setSuccess(
        data.message ||
          "Your password has been reset successfully. Sign in on your usual device with your new password.",
      );
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col" style={{ background: "linear-gradient(160deg, #0D1B5E 0%, #1B3A8F 50%, #102570 100%)" }}>
      <div className="h-[4px] w-full shrink-0" style={{ background: "linear-gradient(90deg, #1D4ED8, #3B82F6, #93C5FD, #3B82F6, #1D4ED8)" }} />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <img src="/zimson-logo.png" alt="Zimson" className="h-12 w-auto object-contain" />
        </div>

        <div className="w-full max-w-sm bg-white shadow-[0_32px_96px_-16px_rgba(0,0,0,0.6)]" style={{ borderTop: "3px solid #3B82F6" }}>
          <div className="px-7 py-5" style={{ background: "#1B3A8F" }}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: "#3B82F6" }}>
              {success ? "Password updated" : "Choose new password"}
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
            ) : success ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <p className="font-semibold">Password reset complete</p>
                  <p className="mt-2 leading-relaxed">{success}</p>
                </div>
                <p className="text-xs text-stone-600">
                  This page will not sign you in automatically. Open the app on your computer or phone and use{" "}
                  <strong>Sign in</strong> with your new password.
                </p>
                <Link
                  to="/login"
                  className="inline-block w-full py-3 text-center text-xs font-bold uppercase tracking-[0.25em] no-underline"
                  style={{ background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "#003a22" }}
                >
                  Go to sign in
                </Link>
              </div>
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
                  style={{ background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "#003a22" }}
                >
                  {busy ? "Saving…" : "Update password"}
                </button>
              </form>
            )}
          </div>

          {!success ? (
            <div className="border-t border-rlx-rule bg-rlx-bg px-7 py-3">
              <Link to="/login" className="text-xs font-semibold text-rlx-green hover:underline">
                ← Back to sign in
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
