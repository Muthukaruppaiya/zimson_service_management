import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { IconLock, IconUser } from "../components/auth/LoginIcons";
import { LoginRibbonBg } from "../components/auth/LoginRibbon";
import { LoginStorePickerModal } from "../components/auth/LoginStorePickerModal";
import { AppBootLoader } from "../components/ui/AppBootLoader";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiJson } from "../lib/api";
import { sanitizeLoginIdInput, sanitizePasswordInput } from "../lib/inputSanitize";

const LOGIN_BOOT_MIN_MS = 700;

export function LoginPage() {
  const { user, login, authReady } = useAuth();
  const [bootMinElapsed, setBootMinElapsed] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setBootMinElapsed(true), LOGIN_BOOT_MIN_MS);
    return () => window.clearTimeout(t);
  }, []);

  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [storeOptions, setStoreOptions] = useState<{ id: string; name: string }[]>([]);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [storePickerBusy, setStorePickerBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState(false);
  const [signOutAllBusy, setSignOutAllBusy] = useState(false);
  const [signOutAllNote, setSignOutAllNote] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  if (!authReady || !bootMinElapsed) {
    return <AppBootLoader message="Checking session…" />;
  }

  async function finishLogin(selectedStoreId: string | null) {
    const result = await login(loginId, password, selectedStoreId);
    if (result.ok) {
      setAlreadyLoggedIn(false);
      setStorePickerOpen(false);
      setStoreOptions([]);
      navigate(from === "/login" ? "/" : from, { replace: true });
      return true;
    }
    if ("code" in result && result.code === "STORE_SELECTION_REQUIRED" && result.stores) {
      setStoreOptions(result.stores);
      setStorePickerOpen(true);
      setError(null);
      setAlreadyLoggedIn(false);
      return false;
    }
    setStoreOptions([]);
    setStorePickerOpen(false);
    setError(result.message);
    setAlreadyLoggedIn("code" in result && result.code === "ALREADY_LOGGED_IN");
    return false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSignOutAllNote(null);
    await finishLogin(storeId || null);
  }

  async function handleStorePickFromModal(pickedStoreId: string) {
    setStoreId(pickedStoreId);
    setStorePickerBusy(true);
    setError(null);
    try {
      await finishLogin(pickedStoreId);
    } finally {
      setStorePickerBusy(false);
    }
  }

  async function handleSignOutAllDevices() {
    if (!loginId.trim() || !password) {
      setSignOutAllNote("Enter your username and password first.");
      return;
    }
    setSignOutAllBusy(true);
    setSignOutAllNote(null);
    try {
      const data = await apiJson<{ ok: boolean; message: string }>("/api/auth/sign-out-all-devices", {
        method: "POST",
        json: { loginId: loginId.trim(), password: password.trim() },
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

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 py-10 bg-[#071d49] bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url(/LOGIN_BG.png)" }}
    >
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex w-full flex-col items-center">
          <div className="relative h-14 w-full">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-10 sm:-translate-y-12">
              <div className="rounded-md border-4 border-[#d4af37] bg-white px-6 py-2.5 shadow-[0_0_18px_rgba(212,175,55,0.55)]">
                <img src="/zimson-logo.png" alt="ZIMSON" className="h-10 w-auto object-contain" />
              </div>
            </div>
          </div>
          <div className="flex w-full max-w-[320px] items-center justify-center gap-2.5">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#d4af37]" />
            <span className="shrink-0 text-[11px] font-semibold tracking-[0.28em] text-[#d4af37] uppercase whitespace-nowrap">
              Service Management Suite
            </span>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#d4af37]" />
          </div>
        </div>

        <div className="zimson-login-card rounded-[28px] bg-white shadow-xl overflow-hidden">
          <div className="zimson-login-ribbon-wrap">
            <LoginRibbonBg className="zimson-login-ribbon-bg" />
            <div className="zimson-login-ribbon-content relative z-10 text-white">
              <p className="zimson-login-ribbon-eyebrow">Welcome back</p>
              <div className="zimson-login-ribbon-title">
                <span className="zimson-login-ribbon-dot" aria-hidden="true" />
                <h1>Sign in</h1>
                <span className="zimson-login-ribbon-dot" aria-hidden="true" />
              </div>
            </div>
          </div>

          <div className="px-7 pt-6 pb-7">
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="login-emp" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <div className="flex items-center gap-3">
                <span className="rounded-full flex items-center justify-center w-10 h-10 flex-shrink-0 bg-amber-50 border border-amber-200 text-amber-600 [&_svg]:w-5 [&_svg]:h-5">
                  <IconUser />
                </span>
                <input
                  id="login-emp"
                  type="text"
                  autoComplete="username"
                  value={loginId}
                  onChange={(e) => {
                    setLoginId(sanitizeLoginIdInput(e.target.value));
                    setAlreadyLoggedIn(false);
                  }}
                  placeholder="e.g. jsmith"
                  required
                  className="zimson-login-input flex-1 min-w-0 border border-gray-300 rounded-full px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <Link to="/login/forgot-password" className="text-xs text-blue-600 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full flex items-center justify-center w-10 h-10 flex-shrink-0 bg-amber-50 border border-amber-200 text-amber-600 [&_svg]:w-5 [&_svg]:h-5">
                  <IconLock />
                </span>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(sanitizePasswordInput(e.target.value));
                    setAlreadyLoggedIn(false);
                  }}
                  placeholder="••••••••"
                  required
                  className="zimson-login-input flex-1 min-w-0 border border-gray-300 rounded-full px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              Remember me
            </label>

            {alreadyLoggedIn ? (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-medium">Account already in use</p>
                <p>
                  {error ??
                    "Someone is already signed in with this account. They must sign out, or you can end all sessions with your password below."}
                </p>
                <button
                  type="button"
                  disabled={signOutAllBusy}
                  onClick={() => void handleSignOutAllDevices()}
                  className="mt-2 text-sm font-medium text-amber-900 underline disabled:opacity-60"
                >
                  {signOutAllBusy ? "Signing out all devices…" : "Sign out all devices & try again"}
                </button>
              </div>
            ) : error ? (
              <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            ) : null}

            {signOutAllNote ? (
              <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-700">
                {signOutAllNote}
              </div>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-full py-2.5 text-sm font-bold tracking-wide uppercase text-[#132b63] shadow-[0_8px_18px_rgba(191,132,5,0.4)] transition hover:brightness-105"
              style={{ background: "linear-gradient(90deg, #bf8405, #ffd24d)" }}
            >
              Sign in
            </button>
            </form>

            <p className="mt-4 text-center text-sm text-gray-500">
              Having trouble? <Link to="/" className="text-blue-600 hover:underline">Go to home</Link>
            </p>
          </div>
        </div>
      </div>

      <LoginStorePickerModal
        open={storePickerOpen}
        stores={storeOptions}
        busy={storePickerBusy}
        onClose={() => {
          if (storePickerBusy) return;
          setStorePickerOpen(false);
        }}
        onConfirm={(id) => void handleStorePickFromModal(id)}
      />
    </div>
  );
}
