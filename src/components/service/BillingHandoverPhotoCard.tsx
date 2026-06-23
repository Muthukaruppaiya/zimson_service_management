import { useCallback, useEffect, useMemo, useState } from "react";
import { CustomerLinkQr } from "./CustomerLinkQr";
import { ApiError, apiJson } from "../../lib/api";

export type BillingHandoverSession = {
  sessionId: string;
  token?: string;
  captureUrl?: string;
  photoPath: string | null;
  customerName: string;
  watch: string;
  reference: string;
};

type Props = {
  srfId: string;
  enabled?: boolean;
  onSessionChange?: (sessionId: string | null) => void;
};

export function BillingHandoverPhotoCard({ srfId, enabled = true, onSessionChange }: Props) {
  const [session, setSession] = useState<BillingHandoverSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const captureUrl = useMemo(() => {
    if (!session?.captureUrl) return "";
    return new URL(session.captureUrl, window.location.origin).toString();
  }, [session?.captureUrl]);

  const applySession = useCallback(
    (data: BillingHandoverSession) => {
      setSession(data);
      setError(null);
      onSessionChange?.(data.sessionId ?? null);
    },
    [onSessionChange],
  );

  const refreshSession = useCallback(async () => {
    if (!session?.sessionId) return;
    try {
      const data = await apiJson<BillingHandoverSession>(
        `/api/service/srf-jobs/billing-handover-session/${encodeURIComponent(session.sessionId)}`,
      );
      applySession({ ...data, token: session.token, captureUrl: session.captureUrl });
    } catch {
      /* ignore poll errors */
    }
  }, [session?.sessionId, session?.token, session?.captureUrl, applySession]);

  useEffect(() => {
    if (!enabled || !srfId) {
      setSession(null);
      onSessionChange?.(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const out = await apiJson<{ session: BillingHandoverSession | null }>(
          `/api/service/srf-jobs/${encodeURIComponent(srfId)}/billing-handover-session`,
        );
        if (cancelled) return;
        if (out.session) applySession(out.session);
        else {
          setSession(null);
          onSessionChange?.(null);
        }
      } catch {
        if (!cancelled) setSession(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [srfId, enabled, applySession, onSessionChange]);

  useEffect(() => {
    if (!session?.sessionId || !enabled) return;
    void refreshSession();
    const t = window.setInterval(() => void refreshSession(), 6000);
    return () => window.clearInterval(t);
  }, [session?.sessionId, enabled, refreshSession]);

  async function createLink() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const data = await apiJson<BillingHandoverSession>(
        `/api/service/srf-jobs/${encodeURIComponent(srfId)}/billing-handover-session`,
        { method: "POST" },
      );
      applySession(data);
      setMsg("Share the QR or link with the customer to photograph the watch at handover.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create upload link.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshLink() {
    if (!session?.sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiJson<BillingHandoverSession>(
        `/api/service/srf-jobs/billing-handover-session/${encodeURIComponent(session.sessionId)}/refresh`,
        { method: "POST" },
      );
      applySession(data);
      setMsg("New upload link generated.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not refresh link.");
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (!session?.sessionId) return;
    setBusy(true);
    try {
      const data = await apiJson<BillingHandoverSession>(
        `/api/service/srf-jobs/billing-handover-session/${encodeURIComponent(session.sessionId)}/photo`,
        { method: "DELETE" },
      );
      applySession({ ...data, token: session.token, captureUrl: session.captureUrl });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove photo.");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;

  return (
    <div className="rounded-xl border border-zimson-200 bg-zimson-50/50 p-4">
      <p className="text-sm font-semibold text-zimson-900">Handover watch photo (customer link)</p>
      <p className="mt-1 text-xs text-stone-600">
        One photo of the watch when handing over to the customer. Generate a QR/link — customer uploads from
        their phone (same as SRF booking capture).
      </p>
      {error ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>
      ) : null}
      {msg ? (
        <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {msg}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="mx-auto w-full max-w-[200px] shrink-0 lg:mx-0">
          {captureUrl ? (
            <CustomerLinkQr url={captureUrl} size={180} mode="qr" caption="Scan to upload" className="text-center" />
          ) : (
            <div className="flex min-h-[140px] items-center justify-center rounded-lg border border-dashed border-zimson-300 bg-white p-4 text-center text-xs text-stone-500">
              QR appears after you generate a link
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {captureUrl ? <p className="break-all text-xs text-stone-500">{captureUrl}</p> : null}
          <div className="flex flex-wrap gap-2">
            {!session?.token ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void (session?.sessionId ? refreshLink() : createLink())}
                className="rounded-lg bg-zimson-700 px-4 py-2 text-xs font-semibold text-white hover:bg-zimson-800 disabled:opacity-50"
              >
                {busy
                  ? "Generating…"
                  : session?.sessionId
                    ? "Show QR / link again"
                    : "Generate upload link"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void refreshSession()}
                  className="rounded-lg border border-zimson-300 bg-white px-4 py-2 text-xs font-semibold text-zimson-900"
                >
                  Refresh uploads
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void refreshLink()}
                  className="rounded-lg border border-zimson-300 bg-white px-4 py-2 text-xs font-semibold text-zimson-900"
                >
                  New link
                </button>
                {captureUrl ? (
                  <a
                    href={captureUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-zimson-700 px-4 py-2 text-xs font-semibold text-white"
                  >
                    Open capture page
                  </a>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
      {session?.photoPath ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Handover photo received</p>
          <img
            src={session.photoPath}
            alt="Handover watch"
            className="mt-2 max-h-48 w-full rounded-md border border-stone-200 object-contain bg-stone-50"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void removePhoto()}
            className="mt-2 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            Remove photo
          </button>
        </div>
      ) : session?.sessionId ? (
        <p className="mt-3 text-xs text-stone-500">Waiting for customer to upload handover photo…</p>
      ) : null}
    </div>
  );
}
