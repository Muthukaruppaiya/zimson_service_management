import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LoginOtpEntryPanel, LoginOtpSendingPopup } from "../components/auth/LoginOtpUi";
import { LoginStorePickerModal } from "../components/auth/LoginStorePickerModal";
import { AppBootLoader } from "../components/ui/AppBootLoader";
import { OtpSentSuccessModal } from "../components/ui/OtpSentSuccessModal";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiJson } from "../lib/api";
import { sanitizeLoginIdInput, sanitizePasswordInput } from "../lib/inputSanitize";
import { OTP_LENGTH } from "../lib/otp";
import { formatOtpSentSubtitle } from "../lib/otpSentMessage";
import "../styles/zimson-login.css";

const LOGIN_BOOT_MIN_MS = 700;
const OTP_SENT_MODAL_MS = 1800;

export function LoginPage() {
  const { user, login, verifyLoginOtp, authReady } = useAuth();
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
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [storeOptions, setStoreOptions] = useState<{ id: string; name: string }[]>([]);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [storePickerBusy, setStorePickerBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState(false);
  const [signOutAllBusy, setSignOutAllBusy] = useState(false);
  const [signOutAllNote, setSignOutAllNote] = useState<string | null>(null);
  const [otpChallengeToken, setOtpChallengeToken] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpSentModalOpen, setOtpSentModalOpen] = useState(false);

  useEffect(() => {
    if (!otpSentModalOpen) return;
    const t = window.setTimeout(() => setOtpSentModalOpen(false), OTP_SENT_MODAL_MS);
    return () => window.clearTimeout(t);
  }, [otpSentModalOpen]);

  if (user) return <Navigate to="/" replace />;

  if (!authReady || !bootMinElapsed) {
    return <AppBootLoader message="Checking session…" />;
  }

  function clearOtpStep() {
    setOtpChallengeToken("");
    setOtpCode("");
    setOtpHint(null);
    setDemoOtp(null);
    setOtpSentModalOpen(false);
  }

  async function finishLogin(selectedStoreId: string | null, opts?: { showSendingPopup?: boolean }) {
    const showSending = opts?.showSendingPopup !== false;
    if (showSending) setOtpSending(true);
    try {
      const result = await login(loginId, password, selectedStoreId);
      if (result.ok) {
        clearOtpStep();
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
        clearOtpStep();
        return false;
      }
      if ("code" in result && result.code === "LOGIN_OTP_REQUIRED" && result.challengeToken) {
        setOtpChallengeToken(result.challengeToken);
        setOtpCode("");
        setOtpHint(result.sentTo?.length ? formatOtpSentSubtitle(result.sentTo) : result.message);
        setDemoOtp(result.demoOtp ?? null);
        setStorePickerOpen(false);
        setError(null);
        setAlreadyLoggedIn(false);
        setOtpSentModalOpen(true);
        return false;
      }
      clearOtpStep();
      setStoreOptions([]);
      setStorePickerOpen(false);
      setError(result.message);
      setAlreadyLoggedIn("code" in result && result.code === "ALREADY_LOGGED_IN");
      return false;
    } finally {
      if (showSending) setOtpSending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSignOutAllNote(null);
    if (otpChallengeToken) {
      if (otpCode.trim().length !== OTP_LENGTH) {
        setError(`Enter the ${OTP_LENGTH}-digit OTP.`);
        return;
      }
      setOtpBusy(true);
      try {
        const result = await verifyLoginOtp(otpChallengeToken, otpCode, rememberMe);
        if (result.ok) {
          navigate(from === "/login" ? "/" : from, { replace: true });
          return;
        }
        setError(result.message);
        if ("code" in result && result.code === "ALREADY_LOGGED_IN") setAlreadyLoggedIn(true);
      } finally {
        setOtpBusy(false);
      }
      return;
    }
    await finishLogin(storeId || null);
  }

  async function handleResendOtp() {
    setError(null);
    setOtpBusy(true);
    try {
      await finishLogin(storeId || null, { showSendingPopup: true });
    } finally {
      setOtpBusy(false);
    }
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
      clearOtpStep();
      setSignOutAllNote(data.message || "All devices signed out. Click Sign in again.");
    } catch (e) {
      setSignOutAllNote(e instanceof ApiError ? e.message : "Could not sign out all devices.");
    } finally {
      setSignOutAllBusy(false);
    }
  }

  const onOtpStep = Boolean(otpChallengeToken);

  return (
    <div className="zimson-login">
      <div className="zimson-login__bg" aria-hidden="true">
        <div className="zimson-login__watermark">Z</div>
        <div className="zimson-login__wave" />
      </div>

      <div className="zimson-login__stage">
        <header className="zimson-login__hero">
          <div className="zimson-login__logo-wrap">
            <img className="zimson-login__logo" src="/zimson-logo.png" alt="ZIMSON" />
          </div>
          <span className="zimson-login__hero-rule" aria-hidden="true" />
          <h2 className="zimson-login__hero-title">
            <span>Manage Today.</span>
            <span>
              A <strong>Smarter</strong> Tomorrow.
            </span>
          </h2>
          <p className="zimson-login__hero-kicker">People &nbsp;|&nbsp; Process &nbsp;|&nbsp; Progress</p>
        </header>

        <section className="zimson-login__card" aria-labelledby="login-title">
          <div className="zimson-login__body">
            <h1 className="zimson-login__heading" id="login-title">
              {onOtpStep ? "Verify OTP" : "Sign in"}
            </h1>
            {!onOtpStep ? (
              <p className="zimson-login__welcome">Welcome back! Please sign in to continue.</p>
            ) : null}

            <form onSubmit={handleSubmit} noValidate>
              {!onOtpStep ? (
                <>
                  <div className="zimson-login__field">
                    <label className="zimson-login__label" htmlFor="login-emp">
                      Username
                    </label>
                    <div className="zimson-login__control">
                      <span className="zimson-login__control-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <circle cx="12" cy="8" r="3.4" />
                          <path d="M5.2 19.2c.7-3.1 3.6-5.2 6.8-5.2s6.1 2.1 6.8 5.2" strokeLinecap="round" />
                        </svg>
                      </span>
                      <input
                        className="zimson-login__field-input"
                        id="login-emp"
                        type="text"
                        autoComplete="username"
                        value={loginId}
                        onChange={(e) => {
                          setLoginId(sanitizeLoginIdInput(e.target.value));
                          setAlreadyLoggedIn(false);
                        }}
                        placeholder="Enter your username"
                        required
                      />
                    </div>
                  </div>

                  <div className="zimson-login__field">
                    <label className="zimson-login__label" htmlFor="login-password">
                      Password
                    </label>
                    <div className="zimson-login__control">
                      <span className="zimson-login__control-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <rect x="6" y="11" width="12" height="9" rx="1.6" />
                          <path d="M8.5 11V8.2a3.5 3.5 0 0 1 7 0V11" strokeLinecap="round" />
                        </svg>
                      </span>
                      <input
                        className="zimson-login__field-input"
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => {
                          setPassword(sanitizePasswordInput(e.target.value));
                          setAlreadyLoggedIn(false);
                        }}
                        placeholder="Enter your password"
                        required
                      />
                      <button
                        type="button"
                        className="zimson-login__eye"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                            <path d="M3 3l18 18" strokeLinecap="round" />
                            <path d="M10.6 10.7a2.2 2.2 0 0 0 2.7 2.7" />
                            <path d="M9.9 5.5A10.4 10.4 0 0 1 12 5.2c5 0 8.8 3.8 10.2 6.8a11.4 11.4 0 0 1-4.1 4.6" />
                            <path d="M6.1 6.7A11.5 11.5 0 0 0 1.8 12c1.4 3 5.2 6.8 10.2 6.8 1.2 0 2.3-.2 3.4-.6" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="zimson-login__meta">
                    <label className="zimson-login__remember">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <span>Remember this device</span>
                    </label>
                    <Link className="zimson-login__forgot" to="/login/forgot-password">
                      Forgot password?
                    </Link>
                  </div>

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

                  <button className="zimson-login__submit" type="submit" disabled={otpSending}>
                    {otpSending ? "Sending OTP…" : "Sign in"}
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 12h12M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <LoginOtpEntryPanel
                    otpCode={otpCode}
                    onOtpChange={setOtpCode}
                    otpHint={otpHint}
                    demoOtp={demoOtp}
                    rememberMe={rememberMe}
                    onRememberMeChange={setRememberMe}
                    error={error}
                    alreadyLoggedIn={alreadyLoggedIn}
                    alreadyLoggedInBody={error}
                    signOutAllBusy={signOutAllBusy}
                    onSignOutAll={() => void handleSignOutAllDevices()}
                    otpBusy={otpBusy || otpSending}
                    onResend={() => void handleResendOtp()}
                    onBack={() => {
                      clearOtpStep();
                      setError(null);
                    }}
                  />
                  {signOutAllNote ? (
                    <div className="zimson-login__alert zimson-login__alert--success" style={{ marginTop: "0.75rem" }}>
                      {signOutAllNote}
                    </div>
                  ) : null}
                </>
              )}
            </form>

            {!onOtpStep ? (
              <p className="zimson-login__help">
                <span>Need help?</span>
              </p>
            ) : null}
          </div>
        </section>
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

      <LoginOtpSendingPopup open={otpSending} />
      <OtpSentSuccessModal
        open={otpSentModalOpen && !otpSending}
        subtitle={otpHint ?? undefined}
        onClose={() => setOtpSentModalOpen(false)}
      />
    </div>
  );
}
