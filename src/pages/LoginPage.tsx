import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SEED_USERS } from "../data/seed";
import { ROLE_CREATION_META } from "../lib/userCreationPolicy";
import type { UserRole } from "../types/user";

function displayEmployeeCode(seedIdOrCode: string): string {
  return String(seedIdOrCode).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

function roleLabel(role: string) {
  return ROLE_CREATION_META.find((r) => r.value === role)?.label ?? role;
}

type DemoRow = { employeeCode: string; password: string; role: string; note: string; canLogin: boolean };

const seedRows: DemoRow[] = SEED_USERS.filter((u) => u.isSeed).map((u) => ({
  employeeCode: displayEmployeeCode(u.employeeCode ?? u.id),
  password: u.password,
  role: roleLabel(u.role as UserRole),
  note: u.displayName,
  canLogin: u.canLogin ?? true,
}));

export function LoginPage() {
  const { user, login, authReady } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [employeeCode, setEmployeeCode] = useState("");
  const [password, setPassword] = useState("");
  const [storeId, setStoreId] = useState("");
  const [storeOptions, setStoreOptions] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [demoRows, setDemoRows] = useState<DemoRow[]>(seedRows);

  const showSeedSync = import.meta.env.DEV || import.meta.env.VITE_ENABLE_SEED_SYNC === "true";
  const [seedTarget, setSeedTarget] = useState("");
  const [seedSecret, setSeedSecret] = useState("");
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/demo-users")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { users: { employeeCode: string; password: string; displayName: string; role: string; canLogin: boolean }[] } | null) => {
        if (!data?.users?.length) return;
        setDemoRows(
          data.users.map((u) => ({
            employeeCode: u.employeeCode,
            password: u.password,
            role: roleLabel(u.role as UserRole),
            note: u.displayName,
            canLogin: u.canLogin,
          })),
        );
      })
      .catch(() => { /* fallback to seed */ });
  }, []);

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
    const result = await login(employeeCode, password, storeId || null);
    if (result.ok) {
      navigate(from === "/login" ? "/" : from, { replace: true });
    } else if ("code" in result && result.code === "STORE_SELECTION_REQUIRED") {
      setStoreOptions(result.stores);
      setStoreId("");
      setError(result.message);
    } else {
      setStoreOptions([]);
      setError(result.message);
    }
  }

  function fillDemo(row: (typeof demoRows)[number]) {
    if (!row.canLogin) return;
    setEmployeeCode(row.employeeCode);
    setPassword(row.password);
    setStoreOptions([]);
    setStoreId("");
    setError(null);
  }

  async function pushCoreSeedToServer() {
    setSeedMsg(null);
    if (!seedTarget.trim() || !seedSecret.trim()) {
      setSeedMsg("Enter remote API base URL and sync secret.");
      return;
    }
    setSeedBusy(true);
    try {
      const r = await fetch("/api/dev/push-core-seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          secret: seedSecret.trim(),
          targetBaseUrl: seedTarget.trim().replace(/\/$/, ""),
        }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string; remote?: { counts?: unknown }; exported?: unknown };
      if (!r.ok) {
        setSeedMsg(data.error ?? `HTTP ${r.status}`);
        return;
      }
      setSeedMsg(`Synced. Remote: ${JSON.stringify(data.remote ?? {})}`);
    } catch (e) {
      setSeedMsg(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSeedBusy(false);
    }
  }

  const fieldCls =
    "mt-1.5 w-full border border-rlx-rule bg-white px-3 py-2.5 text-sm text-rlx-ink placeholder-rlx-ink-muted/50 outline-none transition focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/20";

  return (
    <div className="flex min-h-dvh flex-col" style={{ background: "linear-gradient(160deg, #0D1B5E 0%, #1B3A8F 50%, #102570 100%)" }}>

      {/* top gold bar — thick and prominent */}
      <div className="h-[4px] w-full shrink-0" style={{ background: "linear-gradient(90deg, #A8850F, #C9A227, #F0DC90, #C9A227, #A8850F)" }} />

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">

        {/* ── Brand mark ──────────────────────────── */}
        <div className="mb-10 flex flex-col items-center gap-5 text-center">
          {/* actual Zimson logo on dark bg */}
          <div
            className="flex items-center justify-center px-6 py-4 shadow-[0_0_0_1px_rgba(201,162,39,0.35),0_12px_48px_rgba(0,0,0,0.6)]"
            style={{ background: "linear-gradient(135deg, #003320 0%, #005030 100%)" }}
          >
            <img
              src="/zimson-logo.png"
              alt="Zimson — The Watch Store Since 1948"
              className="h-14 w-auto object-contain"
              style={{ filter: "brightness(1.05) saturate(1.1)" }}
            />
          </div>
          {/* gold rule + subtitle */}
          <div>
            <div className="mx-auto h-[1.5px] w-24" style={{ background: "linear-gradient(90deg, transparent, #C9A227, transparent)" }} />
            <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.45em]" style={{ color: "#C9A227" }}>
              Service Management Suite
            </p>
          </div>
        </div>

        {/* ── Login card ──────────────────────────── */}
        <div
          className="w-full max-w-sm bg-white shadow-[0_32px_96px_-16px_rgba(0,0,0,0.6)]"
          style={{ borderTop: "3px solid #C9A227" }}
        >

          {/* card header — green band with gold text */}
          <div className="px-7 py-5" style={{ background: "#1B3A8F" }}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: "#C9A227" }}>
              Sign in
            </h2>
            <p className="mt-0.5 text-xs text-white/60">Enter your employee credentials to continue.</p>
          </div>

          {/* form */}
          <form onSubmit={handleSubmit} className="space-y-4 px-7 py-6">
            <div>
              <label htmlFor="login-emp" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rlx-ink-muted">
                Employee number
              </label>
              <input
                id="login-emp"
                type="text"
                autoComplete="username"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                className={fieldCls}
                placeholder="e.g. EMP001"
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
              <label htmlFor="login-password" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rlx-ink-muted">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldCls}
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <div className="border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
                {error}
              </div>
            ) : null}

            {/* Gold CTA button */}
            <button
              type="submit"
              disabled={storeOptions.length > 0 && !storeId}
              className="mt-1 w-full py-3 text-xs font-bold uppercase tracking-[0.25em] transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #A8850F, #C9A227)", color: "#003a22" }}
            >
              Sign in →
            </button>
          </form>

          {/* card footer */}
          <div className="border-t border-rlx-rule bg-rlx-bg px-7 py-3">
            <p className="text-[10px] text-rlx-ink-muted">
              Having trouble?{" "}
              <Link to="/" className="font-semibold text-rlx-green hover:underline">
                Go to home
              </Link>
            </p>
          </div>
        </div>

        {showSeedSync ? (
          <div className="mt-8 w-full max-w-sm border border-amber-200/60 bg-white/95 px-5 py-4 text-left shadow-lg">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Dev — push core seed to server</p>
            <p className="mt-1 text-[11px] text-stone-600">
              Reads <strong>regions</strong>, <strong>stores</strong>, <strong>app_users</strong>, and <strong>user_store_access</strong> from this machine&apos;s DB (via local API), then replaces the same tables on the remote API. Set the same <code className="text-[10px]">SEED_SYNC_SECRET</code> in local and server <code className="text-[10px]">.env</code>.
            </p>
            <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-stone-500">Remote API base URL</label>
            <input
              className={fieldCls}
              value={seedTarget}
              onChange={(e) => setSeedTarget(e.target.value)}
              placeholder="http://20.244.46.64:4000"
              autoComplete="off"
            />
            <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-stone-500">SEED_SYNC_SECRET</label>
            <input
              type="password"
              className={fieldCls}
              value={seedSecret}
              onChange={(e) => setSeedSecret(e.target.value)}
              placeholder="Matches server .env"
              autoComplete="off"
            />
            <button
              type="button"
              disabled={seedBusy}
              onClick={() => void pushCoreSeedToServer()}
              className="mt-3 w-full border border-amber-600 bg-amber-50 py-2 text-[11px] font-bold uppercase tracking-wide text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {seedBusy ? "Pushing…" : "Push local data → remote DB"}
            </button>
            {seedMsg ? <p className="mt-2 text-xs text-stone-700 whitespace-pre-wrap">{seedMsg}</p> : null}
          </div>
        ) : null}

        {/* ── Demo credentials table ──────────────── */}
        <div className="mt-12 w-full max-w-4xl">
          {/* divider with gold label */}
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.3))" }} />
            <p className="text-[9.5px] font-bold uppercase tracking-[0.35em]" style={{ color: "#C9A227" }}>
              Demo credentials
            </p>
            <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(212,175,55,0.3), transparent)" }} />
          </div>

          <div className="overflow-hidden bg-white shadow-[0_8px_32px_rgba(0,0,0,0.35)]" style={{ borderTop: "2px solid #C9A227" }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr style={{ background: "#102570" }}>
                    {["Employee No", "Password", "Role", "User", "Login"].map((h) => (
                      <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#C9A227" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                  <tr><td colSpan={5} className="p-0" style={{ height: "1px", background: "linear-gradient(90deg, #A8850F, #C9A227, #A8850F)" }} /></tr>
                </thead>
                <tbody>
                  {demoRows.map((row, idx) => (
                    <tr
                      key={row.employeeCode}
                      className={`border-b border-rlx-rule ${idx % 2 === 0 ? "bg-white" : "bg-rlx-bg"}`}
                    >
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => fillDemo(row)}
                          disabled={!row.canLogin}
                          className="font-mono text-xs font-bold transition disabled:no-underline disabled:opacity-40"
                          style={{ color: "#C9A227" }}
                        >
                          {row.employeeCode}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-rlx-ink-muted">{row.password}</td>
                      <td className="px-4 py-2.5 text-xs text-rlx-ink">{row.role}</td>
                      <td className="px-4 py-2.5 text-xs text-rlx-ink-muted">{row.note}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                          style={row.canLogin
                            ? { border: "1px solid #C9A227", background: "rgba(212,175,55,0.08)", color: "#A8850F" }
                            : { border: "1px solid #e0e0dc", color: "#9a9a90" }}
                        >
                          {row.canLogin ? "Yes" : "No"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-4 text-center text-[10px] text-white/30">
            Module visibility per role configured in{" "}
            <code className="rounded bg-white/8 px-1 py-0.5 font-mono text-[9px] text-white/50">
              src/config/moduleAccess.ts
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}
