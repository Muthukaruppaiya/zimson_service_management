import { useCallback, useEffect, useState } from "react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { apiJson } from "../../lib/api";

type MfaStatus = {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
};

type SetupData = {
  secret: string;
  otpAuthUri: string;
  qrDataUrl: string;
};

export function MfaSettingsPage() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await apiJson<MfaStatus>("/api/auth/mfa/status"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load MFA status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function beginSetup() {
    if (!password) {
      setError("Enter your current password.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setSetup(
        await apiJson<SetupData>("/api/auth/mfa/setup", {
          method: "POST",
          json: { password },
        }),
      );
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start MFA setup.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiJson<{ ok: true; recoveryCodes: string[] }>("/api/auth/mfa/confirm", {
        method: "POST",
        json: { code },
      });
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null);
      setPassword("");
      setCode("");
      setMessage("MFA is now enabled. Save the recovery codes before leaving this page.");
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not confirm MFA.");
    } finally {
      setBusy(false);
    }
  }

  async function regenerateRecoveryCodes() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiJson<{ ok: true; recoveryCodes: string[] }>("/api/auth/mfa/recovery-codes", {
        method: "POST",
        json: { code },
      });
      setRecoveryCodes(result.recoveryCodes);
      setCode("");
      setMessage("New recovery codes generated. Previous codes no longer work.");
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not regenerate recovery codes.");
    } finally {
      setBusy(false);
    }
  }

  async function disableMfa() {
    if (!window.confirm("Disable MFA for your account?")) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson("/api/auth/mfa/disable", {
        method: "POST",
        json: { password, code },
      });
      setPassword("");
      setCode("");
      setRecoveryCodes([]);
      setMessage("MFA has been disabled.");
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disable MFA.");
    } finally {
      setBusy(false);
    }
  }

  async function copyRecoveryCodes() {
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setMessage("Recovery codes copied.");
  }

  return (
    <div>
      <PageHeader
        title="Multi-factor authentication"
        description="Protect your account with a time-based code from Google Authenticator, Microsoft Authenticator, Authy, or another TOTP app."
      />

      {error ? <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
      {message ? <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}

      {loading ? (
        <p className="text-sm text-stone-600">Loading security settings…</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title={status?.enabled ? "MFA enabled" : "Enable MFA"}>
            {status?.enabled ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p className="font-semibold">Your account requires a second factor at sign-in.</p>
                  <p className="mt-1 text-xs">
                    Enabled {status.enabledAt ? new Date(status.enabledAt).toLocaleString() : "recently"} ·{" "}
                    {status.recoveryCodesRemaining} recovery code(s) remaining
                  </p>
                </div>
                <label className="block text-sm">
                  Authenticator code
                  <input
                    className="mt-1 w-full rounded-xl border border-zimson-300 px-3 py-2"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9))}
                    placeholder="6-digit code"
                    autoComplete="one-time-code"
                  />
                </label>
                <button type="button" className="ui-btn-secondary" disabled={busy || !code} onClick={() => void regenerateRecoveryCodes()}>
                  Generate new recovery codes
                </button>
                <div className="border-t border-zimson-200 pt-4">
                  <label className="block text-sm">
                    Current password
                    <input
                      type="password"
                      className="mt-1 w-full rounded-xl border border-zimson-300 px-3 py-2"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </label>
                  <button
                    type="button"
                    className="mt-3 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={busy || !password || !code}
                    onClick={() => void disableMfa()}
                  >
                    Disable MFA
                  </button>
                </div>
              </div>
            ) : setup ? (
              <div className="space-y-4">
                <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
                  <li>Scan this QR code with your authenticator app.</li>
                  <li>Enter the generated 6-digit code below.</li>
                </ol>
                <img src={setup.qrDataUrl} alt="Authenticator setup QR code" className="mx-auto h-64 w-64 rounded-xl border border-zimson-200 bg-white p-2" />
                <div className="rounded-xl bg-zimson-50 p-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Manual setup key</p>
                  <code className="mt-1 block break-all text-sm font-semibold text-zimson-900">{setup.secret}</code>
                </div>
                <label className="block text-sm">
                  6-digit authenticator code
                  <input
                    className="mt-1 w-full rounded-xl border border-zimson-300 px-3 py-2"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </label>
                <div className="flex gap-2">
                  <button type="button" className="rounded-xl bg-zimson-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || code.length !== 6} onClick={() => void confirmSetup()}>
                    Verify and enable
                  </button>
                  <button type="button" className="ui-btn-secondary" disabled={busy} onClick={() => setSetup(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-stone-700">
                  After setup, your password alone will no longer be enough to access this account.
                </p>
                <label className="block text-sm">
                  Confirm current password
                  <input
                    type="password"
                    className="mt-1 w-full rounded-xl border border-zimson-300 px-3 py-2"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </label>
                <button type="button" className="rounded-xl bg-zimson-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !password} onClick={() => void beginSetup()}>
                  Set up authenticator
                </button>
              </div>
            )}
          </Card>

          <Card title="Recovery codes">
            {recoveryCodes.length ? (
              <div>
                <p className="mb-3 text-sm text-rose-700">
                  Each code works once. Store them securely; they will not be shown again.
                </p>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-zimson-200 bg-zimson-50 p-4 font-mono text-sm font-semibold">
                  {recoveryCodes.map((recoveryCode) => (
                    <span key={recoveryCode}>{recoveryCode}</span>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="ui-btn-secondary" onClick={() => void copyRecoveryCodes()}>
                    Copy codes
                  </button>
                  <button type="button" className="ui-btn-secondary" onClick={() => window.print()}>
                    Print
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-stone-600">
                Recovery codes appear once when MFA is enabled or regenerated. One can be used instead of an authenticator code if your phone is unavailable.
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
