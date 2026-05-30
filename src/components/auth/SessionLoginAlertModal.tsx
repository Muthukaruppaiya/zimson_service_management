import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiJson } from "../../lib/api";

export function SessionLoginAlertModal() {
  const { user, logout } = useAuth();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setMessage(null);
      return;
    }
    let cancelled = false;

    async function poll() {
      try {
        const data = await apiJson<{ alert: { message: string } | null }>("/api/auth/session-alert");
        if (!cancelled && data.alert?.message) {
          setMessage(data.alert.message);
        }
      } catch {
        /* ignore */
      }
    }

    void poll();
    const id = window.setInterval(() => void poll(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user?.id]);

  if (!message) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-alert-title"
    >
      <div className="w-full max-w-md rounded-xl border border-amber-300 bg-white p-6 shadow-xl">
        <h2 id="session-alert-title" className="text-base font-semibold text-amber-950">
          Sign-in attempt on your account
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-stone-700">{message}</p>
        <p className="mt-2 text-xs text-stone-500">
          Another person cannot sign in with your credentials until you sign out here.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              void logout();
            }}
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
          >
            Sign out now
          </button>
        </div>
      </div>
    </div>
  );
}
