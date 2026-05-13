import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type ToastKind = "success" | "error" | "info";

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
};

type ToastContextValue = {
  toasts: Toast[];
  toast: (kind: ToastKind, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  dismiss: (id: string) => void;
};

// ── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

let idCounter = 0;
const nextId = () => `toast-${++idCounter}`;

const AUTO_DISMISS_MS = 4000;

// ── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const toast = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = nextId();
      setToasts((prev) => [...prev, { id, kind, title, message }]);
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const success = useCallback((title: string, message?: string) => toast("success", title, message), [toast]);
  const error   = useCallback((title: string, message?: string) => toast("error",   title, message), [toast]);
  const info    = useCallback((title: string, message?: string) => toast("info",    title, message), [toast]);

  useEffect(() => {
    const map = timers.current;
    return () => { map.forEach((t) => clearTimeout(t)); map.clear(); };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast, success, error, info, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// ── Individual toast item ─────────────────────────────────────────────────────

const KIND_STYLES: Record<ToastKind, { bar: string; icon: string; iconColor: string; bg: string }> = {
  success: {
    bar: "bg-rlx-green",
    bg: "bg-white",
    icon: "✓",
    iconColor: "text-rlx-green",
  },
  error: {
    bar: "bg-red-600",
    bg: "bg-white",
    icon: "✕",
    iconColor: "text-red-600",
  },
  info: {
    bar: "bg-rlx-gold",
    bg: "bg-white",
    icon: "i",
    iconColor: "text-rlx-gold",
  },
};

function ToastItem({ t, dismiss }: { t: Toast; dismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  // mount animation
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function handleDismiss() {
    setExiting(true);
    setTimeout(() => dismiss(t.id), 250);
  }

  const s = KIND_STYLES[t.kind];

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        transition: "opacity 250ms ease, transform 250ms ease",
        opacity: visible && !exiting ? 1 : 0,
        transform: visible && !exiting ? "translateY(0)" : "translateY(12px)",
      }}
      className={`pointer-events-auto flex w-80 shadow-xl border border-stone-200 ${s.bg} overflow-hidden`}
    >
      {/* left colour bar */}
      <div className={`w-1 shrink-0 ${s.bar}`} />

      {/* icon */}
      <div className="flex items-start justify-center px-3 pt-3.5">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 border-current text-xs font-bold ${s.iconColor}`}>
          {s.icon}
        </span>
      </div>

      {/* text */}
      <div className="flex-1 px-2 py-3 pr-3 min-w-0">
        <p className="text-sm font-semibold text-stone-800 leading-snug">{t.title}</p>
        {t.message && (
          <p className="mt-0.5 text-xs text-stone-500 leading-snug">{t.message}</p>
        )}
      </div>

      {/* close */}
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 px-3 pt-2.5 text-stone-400 hover:text-stone-600 transition-colors text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ── Container (portal-like, fixed top-right) ──────────────────────────────────

function ToastContainer({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[9999] flex flex-col gap-2"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} dismiss={dismiss} />
      ))}
    </div>
  );
}
