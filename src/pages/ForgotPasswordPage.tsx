import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiJson } from "../lib/api";
import { sanitizeLoginIdInput } from "../lib/inputSanitize";

const fieldCls =
  "mt-1.5 w-full border border-rlx-rule bg-white px-3 py-2.5 text-sm text-rlx-ink placeholder-rlx-ink-muted/50 outline-none transition focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/20";

export function ForgotPasswordPage() {
  const [loginId, setLoginId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await apiJson<{ ok: boolean; message: string }>("/api/auth/forgot-password", {
        method: "POST",
        json: { loginId: loginId.trim() },
      });
      setSuccess(data.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send reset email. Try again.");
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
          <p className="text-[9px] font-bold uppercase tracking-[0.45em]" style={{ color: "#C9A227" }}>
            Reset password
          </p>
        </div>

        <div className="w-full max-w-sm bg-white shadow-[0_32px_96px_-16px_rgba(0,0,0,0.6)]" style={{ borderTop: "3px solid #C9A227" }}>
          <div className="px-7 py-5" style={{ background: "#1B3A8F" }}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: "#C9A227" }}>
              Forgot password
            </h2>
            <p className="mt-1 text-xs text-white/70">
              Enter the email or employee ID on your account. We will email reset instructions if the account exists.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-7 py-6">
            <div>
              <label htmlFor="forgot-login" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rlx-ink-muted">
                Employee ID or email
              </label>
              <input
                id="forgot-login"
                type="text"
                autoComplete="username"
                value={loginId}
                onChange={(e) => setLoginId(sanitizeLoginIdInput(e.target.value))}
                className={fieldCls}
                required
              />
            </div>

            {error ? (
              <div className="border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">{error}</div>
            ) : null}
            {success ? (
              <div className="border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900">{success}</div>
            ) : null}

            <button
              type="submit"
              disabled={busy || !loginId.trim()}
              className="w-full py-3 text-xs font-bold uppercase tracking-[0.25em] transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #A8850F, #C9A227)", color: "#003a22" }}
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>

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
