import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LoginStorePickerModal } from "../components/auth/LoginStorePickerModal";
import { AppBootLoader } from "../components/ui/AppBootLoader";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiJson } from "../lib/api";
import { sanitizeLoginIdInput, sanitizePasswordInput } from "../lib/inputSanitize";
import "../styles/zimson-login.css";

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
    <div className="zimson-login">
      <div className="zimson-login__bg" aria-hidden="true">
        <div className="zimson-login__bg-texture" />
        <svg className="zimson-login__swoosh zimson-login__swoosh--bl" viewBox="0 0 400 80" fill="none">
          <defs>
            <linearGradient id="sw-bl" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#B8860B" stopOpacity="0" />
              <stop offset="40%" stopColor="#C5911B" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#D4A017" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 55 C80 20, 160 70, 240 40 S 360 10, 400 35"
            stroke="url(#sw-bl)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        <svg className="zimson-login__swoosh zimson-login__swoosh--br" viewBox="0 0 400 80" fill="none">
          <defs>
            <linearGradient id="sw-br" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#B8860B" stopOpacity="0" />
              <stop offset="40%" stopColor="#C5911B" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#D4A017" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 55 C80 20, 160 70, 240 40 S 360 10, 400 35"
            stroke="url(#sw-br)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        <div className="zimson-login__watermark">Z</div>
      </div>

      <main className="zimson-login__main">
        <header className="zimson-login__brand">
          <div className="zimson-login__logo-wrap">
            <img className="zimson-login__logo" src="/zimson-logo.png" alt="ZIMSON" />
          </div>
          <div className="zimson-login__tagline-row">
            <span className="zimson-login__tagline-line">
              <span className="zimson-login__tagline-dot" />
            </span>
            <span className="zimson-login__tagline-text">Service Management Suite</span>
            <span className="zimson-login__tagline-line">
              <span className="zimson-login__tagline-dot" />
            </span>
          </div>
        </header>

        <section className="zimson-login__card" aria-labelledby="login-title">
          <div className="zimson-login__ribbon">
            <p className="zimson-login__welcome">Welcome back</p>
            <div className="zimson-login__title-row">
              <span className="zimson-login__ornament" />
              <h1 className="zimson-login__title" id="login-title">
                Sign in
              </h1>
              <span className="zimson-login__ornament zimson-login__ornament--right" />
            </div>
          </div>

          <div className="zimson-login__body">
            <form onSubmit={handleSubmit} noValidate>
              <div className="zimson-login__field">
                <label className="zimson-login__label" htmlFor="login-emp">
                  Username
                </label>
                <div className="zimson-login__input-row">
                  <span className="zimson-login__input-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="3.5" />
                      <path d="M5 20c0-3.5 3.13-6 7-6s7 2.5 7 6" />
                    </svg>
                  </span>
                  <div className="zimson-login__input-box">
                    <input
                      className="zimson-login__input"
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
                    />
                  </div>
                </div>
              </div>

              <div className="zimson-login__field">
                <div className="zimson-login__field-row">
                  <label className="zimson-login__label" htmlFor="login-password">
                    Password
                  </label>
                  <Link className="zimson-login__forgot" to="/login/forgot-password">
                    Forgot password?
                  </Link>
                </div>
                <div className="zimson-login__input-row">
                  <span className="zimson-login__input-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="11" width="12" height="9" rx="1.5" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                  </span>
                  <div className="zimson-login__input-box">
                    <input
                      className="zimson-login__input"
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
                    />
                  </div>
                </div>
              </div>

              <label className="zimson-login__remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me</span>
              </label>

              {alreadyLoggedIn ? (
                <div className="zimson-login__alert zimson-login__alert--warn">
                  <p className="zimson-login__alert-title">Account already in use</p>
                  <p>
                    {error ??
                      "Someone is already signed in with this account. They must sign out, or you can end all sessions with your password below."}
                  </p>
                  <button
                    type="button"
                    className="zimson-login__alert-btn"
                    disabled={signOutAllBusy}
                    onClick={() => void handleSignOutAllDevices()}
                  >
                    {signOutAllBusy ? "Signing out all devices…" : "Sign out all devices & try again"}
                  </button>
                </div>
              ) : error ? (
                <div className="zimson-login__alert zimson-login__alert--error">{error}</div>
              ) : null}

              {signOutAllNote ? (
                <div className="zimson-login__alert zimson-login__alert--success">{signOutAllNote}</div>
              ) : null}

              <button className="zimson-login__submit" type="submit">
                Sign in
                <svg viewBox="0 0 24 24">
                  <path d="M13.5 5.5 19 11H5v2h14l-5.5 5.5 1.4 1.4L22.8 12l-7.9-7.9-1.4 1.4Z" />
                </svg>
              </button>

              <div className="zimson-login__or" aria-hidden="true">
                or
              </div>
            </form>
          </div>

          <div className="zimson-login__footer">
            <div className="zimson-login__support">
              <span className="zimson-login__support-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3a8 8 0 0 0-8 8v5a3 3 0 0 0 3 3h1v-7H5a6 6 0 1 1 12 0h-3v7h1a3 3 0 0 0 3-3v-5a8 8 0 0 0-8-8Zm-5 13h2a2 2 0 0 1-2 2v2a2 2 0 0 0 2 2h1v-6H7Zm11 0v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1Z" />
                </svg>
              </span>
              <span>
                Having trouble? <Link to="/">Go to home</Link>
              </span>
            </div>
          </div>
        </section>
      </main>

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
