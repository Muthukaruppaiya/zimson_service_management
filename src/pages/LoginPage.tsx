import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SEED_USERS } from "../data/seed";

function displayEmployeeCode(seedIdOrCode: string): string {
  return String(seedIdOrCode).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

const demoRows = SEED_USERS.filter((u) => u.isSeed).map((u) => ({
  employeeCode: displayEmployeeCode(u.employeeCode ?? u.id),
  password: u.password,
  role: u.role,
  note: u.displayName,
  canLogin: u.canLogin,
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

  if (user) {
    return <Navigate to="/" replace />;
  }

  if (!authReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zimson-100 text-sm text-stone-600">
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

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-zimson-100 to-zimson-200">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zimson-600 text-lg font-bold text-white shadow-md">
            Z
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-stone-900">Zimson</h1>
            <p className="text-sm text-stone-600">Service management</p>
          </div>
        </div>

        <div className="w-full max-w-md rounded-2xl border border-zimson-300/80 bg-white/95 p-6 shadow-lg backdrop-blur-sm md:p-8">
          <h2 className="text-lg font-semibold text-stone-900">Sign in</h2>
          <p className="mt-1 text-sm text-stone-600">Use available credentials or your own account.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-emp" className="text-xs font-medium text-stone-600">
                Employee number
              </label>
              <input
                id="login-emp"
                type="text"
                autoComplete="username"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/40 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2"
                placeholder="Employee number"
              />
            </div>
            {storeOptions.length > 0 ? (
              <div>
                <label htmlFor="login-store" className="text-xs font-medium text-stone-600">
                  Which store do you want to login?
                </label>
                <select
                  id="login-store"
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/40 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2"
                >
                  <option value="">Select store</option>
                  {storeOptions.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-stone-500">
                  This user has multiple store access. Choose one store, then click Sign in.
                </p>
              </div>
            ) : null}
            <div>
              <label htmlFor="login-password" className="text-xs font-medium text-stone-600">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/40 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2"
                placeholder="••••••••"
              />
            </div>
            {error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={storeOptions.length > 0 && !storeId}
              className="w-full rounded-xl bg-zimson-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Sign in
            </button>
          </form>
        </div>

        <div className="mt-8 w-full max-w-4xl rounded-2xl border border-zimson-300/70 bg-white/80 p-4 shadow-sm backdrop-blur-sm md:p-6">
          <h3 className="text-sm font-semibold text-stone-900">Available logins</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zimson-200 text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-3 font-medium">Employee No</th>
                  <th className="py-2 pr-3 font-medium">Password</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">User</th>
                  <th className="py-2 font-medium">Login</th>
                </tr>
              </thead>
              <tbody>
                {demoRows.map((row) => (
                  <tr key={row.employeeCode} className="border-b border-zimson-100 last:border-0">
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => fillDemo(row)}
                        disabled={!row.canLogin}
                        className="text-left font-mono text-xs text-zimson-800 underline decoration-zimson-300 underline-offset-2 hover:text-zimson-950 disabled:no-underline disabled:opacity-60"
                      >
                        {row.employeeCode}
                      </button>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-stone-600">{row.password}</td>
                    <td className="py-2 pr-3 text-stone-800">{row.role}</td>
                    <td className="py-2 pr-3 text-stone-600">{row.note}</td>
                    <td className="py-2 text-stone-600">{row.canLogin ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-stone-500">
          Module visibility per role is configured in{" "}
          <code className="rounded bg-zimson-100 px-1 py-0.5 text-[10px] text-stone-700">src/config/moduleAccess.ts</code>
          .{" "}
          <Link to="/" className="text-zimson-800 underline">
            Home
          </Link>{" "}
          requires sign-in.
        </p>
      </div>
    </div>
  );
}
