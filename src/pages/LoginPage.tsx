import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const demoRows = [
  { email: "superadmin@zimson.demo", password: "super123", role: "Super Admin", note: "All modules" },
  { email: "west.admin@zimson.demo", password: "admin123", role: "Regional Admin", note: "Office 1" },
  { email: "east.admin@zimson.demo", password: "admin123", role: "Regional Admin", note: "Office 2" },
  { email: "west.store1@zimson.demo", password: "store123", role: "Store user", note: "Office 1 / Store 1" },
  { email: "east.store1@zimson.demo", password: "store123", role: "Store user", note: "Office 2 / Store 1" },
  { email: "sc.inward@zimson.demo", password: "sc123", role: "SC inward", note: "Office 1 HO" },
  { email: "sc.supervisor@zimson.demo", password: "sc123", role: "SC supervisor", note: "Office 1" },
  { email: "ho.tech@zimson.demo", password: "tech123", role: "Technician", note: "Grade A / tech-1" },
] as const;

export function LoginPage() {
  const { user, login, authReady } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    const result = await login(email, password);
    if (result.ok) {
      navigate(from === "/login" ? "/" : from, { replace: true });
    } else {
      setError(result.message);
    }
  }

  function fillDemo(row: (typeof demoRows)[number]) {
    setEmail(row.email);
    setPassword(row.password);
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
            <p className="text-sm text-stone-600">Service management - demo login</p>
          </div>
        </div>

        <div className="w-full max-w-md rounded-2xl border border-zimson-300/80 bg-white/95 p-6 shadow-lg backdrop-blur-sm md:p-8">
          <h2 className="text-lg font-semibold text-stone-900">Sign in</h2>
          <p className="mt-1 text-sm text-stone-600">Use a demo account below or your own credentials.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-email" className="text-xs font-medium text-stone-600">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/40 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2"
                placeholder="you@company.com"
              />
            </div>
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
              className="w-full rounded-xl bg-zimson-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Sign in
            </button>
          </form>
        </div>

        <div className="mt-8 w-full max-w-3xl rounded-2xl border border-zimson-300/70 bg-white/80 p-4 shadow-sm backdrop-blur-sm md:p-6">
          <h3 className="text-sm font-semibold text-stone-900">Demo accounts (click to autofill)</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zimson-200 text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Password</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 font-medium">Scope</th>
                </tr>
              </thead>
              <tbody>
                {demoRows.map((row) => (
                  <tr key={row.email} className="border-b border-zimson-100 last:border-0">
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => fillDemo(row)}
                        className="text-left font-mono text-xs text-zimson-800 underline decoration-zimson-300 underline-offset-2 hover:text-zimson-950"
                      >
                        {row.email}
                      </button>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-stone-600">{row.password}</td>
                    <td className="py-2 pr-3 text-stone-800">{row.role}</td>
                    <td className="py-2 text-stone-600">{row.note}</td>
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
