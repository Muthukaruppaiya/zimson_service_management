import { useCallback, useEffect, useMemo, useState } from "react";
import { SRF_ROUTE_LABEL_SEND_TO_SC } from "../../lib/srfRepairRoute";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { DemoOtpGate } from "../../components/service/DemoOtpGate";
import { Card } from "../../components/ui/Card";
import { OtpSendingIndicator } from "../../components/ui/OtpSendingIndicator";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson, ApiError } from "../../lib/api";
import { isValidOtpCode, otpLengthLabel } from "../../lib/otp";
import { formatOtpSentSubtitle, type OtpSentTarget } from "../../lib/otpSentMessage";
import { inputClass } from "../../lib/uiForm";
import { useOtpSentSuccess } from "../../hooks/useOtpSentSuccess";

type DeliveryBoy = {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
};

type PendingTd = {
  id: string;
  dcNumber: string;
  status: string;
  watchCount: number;
  deliveryBoyUserId?: string | null;
  deliveryBoyName?: string | null;
  watches: Array<{
    id: string;
    reference: string;
    customerName: string;
    watchBrand: string;
    watchModel: string;
    status: string;
  }>;
};

type QueueKey = "store_send" | "ho_receive" | "ho_send" | "store_receive";

type HandoffKind =
  | "store_to_ho_send"
  | "ho_receive_from_db"
  | "ho_to_store_send"
  | "store_receive_from_db";

const QUEUE_META: Record<
  QueueKey,
  { title: string; blurb: string; kind: HandoffKind; storeSide: boolean; receiveMode: boolean }
> = {
  store_send: {
    title: SRF_ROUTE_LABEL_SEND_TO_SC,
    blurb: "1) Choose delivery boy → 2) All pending transfers load → 3) Send OTP → confirm.",
    kind: "store_to_ho_send",
    storeSide: true,
    receiveMode: false,
  },
  ho_receive: {
    title: "Receive at HO",
    blurb: "1) Choose delivery boy → 2) All carried transfers load → 3) OTP → Waiting for inward.",
    kind: "ho_receive_from_db",
    storeSide: false,
    receiveMode: true,
  },
  ho_send: {
    title: "Send to Store",
    blurb: "1) Choose delivery boy → 2) All pending transfers load → 3) Send OTP → confirm.",
    kind: "ho_to_store_send",
    storeSide: false,
    receiveMode: false,
  },
  store_receive: {
    title: "Receive at Store",
    blurb: "1) Choose delivery boy → 2) All carried transfers load → 3) OTP → Waiting for inward.",
    kind: "store_receive_from_db",
    storeSide: true,
    receiveMode: true,
  },
};

type Props = {
  queues: QueueKey[];
  defaultQueue?: QueueKey;
};

export function DeliveryHandoffPage({ queues, defaultQueue }: Props) {
  const { user } = useAuth();
  const { refreshJobs } = useSrfJobs();
  const { showOtpSent, otpSentModal } = useOtpSentSuccess();
  const initial = defaultQueue && queues.includes(defaultQueue) ? defaultQueue : queues[0]!;
  const [queue, setQueue] = useState<QueueKey>(initial);
  const meta = QUEUE_META[queue];

  const [boys, setBoys] = useState<DeliveryBoy[]>([]);
  const [rows, setRows] = useState<PendingTd[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [boyId, setBoyId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpSending, setOtpSending] = useState(false);

  const selectedBoy = useMemo(() => boys.find((b) => b.id === boyId) ?? null, [boys, boyId]);

  /**
   * Receive queues: only boys who still have pending in-transit TDs.
   * Send queues: all delivery boys (TDs are not assigned yet).
   */
  const selectableBoys = useMemo(() => {
    if (!meta.receiveMode) return boys;
    const pendingBoyIds = new Set(
      rows.map((r) => r.deliveryBoyUserId).filter((id): id is string => !!id),
    );
    return boys.filter((b) => pendingBoyIds.has(b.id));
  }, [boys, meta.receiveMode, rows]);

  /** TDs for the chosen delivery boy (receive) or all pending TDs after boy chosen (send). */
  const visibleRows = useMemo(() => {
    if (!boyId) return [];
    if (meta.receiveMode) {
      return rows.filter((r) => r.deliveryBoyUserId === boyId);
    }
    return rows;
  }, [boyId, meta.receiveMode, rows]);

  /** All visible transfers are included — no per-row selection. */
  const allDcNumbers = useMemo(() => visibleRows.map((r) => r.dcNumber), [visibleRows]);

  const load = useCallback(
    async (keepBoyId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const [boysRes, pendingRes] = await Promise.all([
          apiJson<{ rows: DeliveryBoy[] }>("/api/service/delivery-boys"),
          apiJson<{ rows: PendingTd[] }>(`/api/service/delivery-handoff/pending?queue=${queue}`),
        ]);
        const nextBoys = boysRes.rows ?? [];
        const nextRows = pendingRes.rows ?? [];
        setBoys(nextBoys);
        setRows(nextRows);
        setSessionId(null);
        setDemoOtp(null);
        setOtpInput("");

        const isReceive = queue === "ho_receive" || queue === "store_receive";
        const pendingBoyIds = new Set(
          nextRows.map((r) => r.deliveryBoyUserId).filter((id): id is string => !!id),
        );
        const stillPending =
          keepBoyId &&
          nextBoys.some((b) => b.id === keepBoyId) &&
          (!isReceive || pendingBoyIds.has(keepBoyId));
        setBoyId(stillPending ? keepBoyId! : "");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load handoff queue.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [queue],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Drop selection if that boy no longer has pending transfers (e.g. after inward).
  useEffect(() => {
    if (!boyId) return;
    if (!selectableBoys.some((b) => b.id === boyId)) {
      setBoyId("");
      setSessionId(null);
      setDemoOtp(null);
      setOtpInput("");
    }
  }, [boyId, selectableBoys]);

  function onBoyChange(nextId: string) {
    setBoyId(nextId);
    setSessionId(null);
    setDemoOtp(null);
    setOtpInput("");
    setError(null);
    setOk(null);
  }

  async function sendOtp() {
    setError(null);
    setOk(null);
    if (!boyId) {
      setError("Select a delivery boy first.");
      return;
    }
    if (allDcNumbers.length === 0) {
      setError("No transfer documents for this delivery boy.");
      return;
    }
    setBusy(true);
    setOtpSending(true);
    try {
      const data = await apiJson<{
        sessionId: string;
        demoOtp?: string;
        deliveryBoyName?: string;
        sentTo: OtpSentTarget[];
      }>("/api/service/delivery-handoff/otp/start", {
        method: "POST",
        json: { kind: meta.kind, deliveryBoyUserId: boyId, dcNumbers: allDcNumbers },
      });
      setSessionId(data.sessionId);
      setDemoOtp(data.demoOtp ?? null);
      setOk(
        `OTP sent to ${data.deliveryBoyName ?? "delivery boy"} via SMS/email. Enter the code to confirm.`,
      );
      showOtpSent(formatOtpSentSubtitle(data.sentTo ?? []));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send OTP.");
    } finally {
      setOtpSending(false);
      setBusy(false);
    }
  }

  async function confirmOtp() {
    setError(null);
    setOk(null);
    if (!sessionId || !isValidOtpCode(otpInput)) {
      setError(`Enter the ${otpLengthLabel()} OTP.`);
      return;
    }
    setBusy(true);
    try {
      const data = await apiJson<{
        updatedDocs: number;
        updatedWatches: number;
        deliveryTripNumber?: string | null;
      }>(
        "/api/service/delivery-handoff/otp/confirm",
        { method: "POST", json: { sessionId, otp: otpInput.trim() } },
      );
      setOk(
        `Handoff confirmed${data.deliveryTripNumber ? ` · Trip ${data.deliveryTripNumber}` : ""} — ${data.updatedDocs} transfer(s), ${data.updatedWatches} watch(es) updated.`,
      );
      setSessionId(null);
      setDemoOtp(null);
      setOtpInput("");
      await refreshJobs?.();
      await load(boyId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not confirm OTP.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <ServiceBreadcrumb
        items={[
          { label: "Service", to: meta.storeSide ? "/service" : "/service-centre" },
          { label: "Delivery handoff" },
        ]}
      />
      <PageHeader
        title="Delivery boy handoff"
        subtitle="Choose delivery boy first, then transfers and OTP. Store ↔ HO only."
      />

      {queues.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {queues.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQueue(q)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                queue === q
                  ? "bg-rlx-green text-white"
                  : "border border-rlx-rule bg-white text-stone-700 hover:bg-stone-50"
              }`}
            >
              {QUEUE_META[q].title}
            </button>
          ))}
        </div>
      ) : null}

      <Card title={meta.title} subtitle={meta.blurb}>
        {error ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        {ok ? (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {ok}
          </div>
        ) : null}

        <div className="mb-4 max-w-md">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-stone-700">
              Step 1 — Delivery boy (name / mobile)
            </span>
            <select
              className={inputClass}
              value={boyId}
              onChange={(e) => onBoyChange(e.target.value)}
              disabled={busy || loading}
            >
              <option value="">Select delivery boy…</option>
              {selectableBoys.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.displayName}
                  {b.phone ? ` · ${b.phone}` : ""}
                </option>
              ))}
            </select>
            {!loading && selectableBoys.length === 0 ? (
              <span className="mt-1 block text-xs text-amber-700">
                {meta.receiveMode
                  ? "No delivery boy has pending in-transit transfers right now."
                  : boys.length === 0
                    ? "No delivery boys in this region. Create one under Users (role: Delivery Boy) with mobile + email."
                    : "No pending transfers in this queue."}
              </span>
            ) : null}
          </label>
        </div>

        {!boyId ? (
          <p className="rounded-xl border border-dashed border-rlx-rule bg-stone-50 px-4 py-6 text-center text-sm text-stone-600">
            Select a delivery boy above to see the transfers they {meta.receiveMode ? "are carrying" : "will take"}.
          </p>
        ) : loading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : (
          <>
            <p className="mb-2 text-sm font-semibold text-stone-700">
              Step 2 — Transfers{" "}
              {meta.receiveMode && selectedBoy
                ? `carried by ${selectedBoy.displayName}`
                : `to assign to ${selectedBoy?.displayName ?? "delivery boy"}`}
            </p>
            {visibleRows.length === 0 ? (
              <p className="rounded-xl border border-zimson-100 bg-white px-4 py-5 text-sm text-stone-500">
                {meta.receiveMode
                  ? "No in-transit transfers for this delivery boy."
                  : "No pending transfers in this queue."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zimson-100">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zimson-50/80 text-xs uppercase tracking-wide text-stone-600">
                    <tr>
                      <th className="px-3 py-2">TD No.</th>
                      <th className="px-3 py-2">Watches</th>
                      <th className="px-3 py-2">Lines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <tr key={r.id} className="border-t border-zimson-100">
                        <td className="px-3 py-2 font-semibold text-zimson-900">{r.dcNumber}</td>
                        <td className="px-3 py-2">{r.watchCount}</td>
                        <td className="px-3 py-2 text-xs text-stone-600">
                          {(r.watches ?? []).map((w) => w.reference).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t border-zimson-100 bg-stone-50 px-3 py-2 text-xs text-stone-600">
                  All {visibleRows.length} transfer{visibleRows.length === 1 ? "" : "s"} above will be
                  included in OTP — no separate selection needed.
                </p>
              </div>
            )}

            {visibleRows.length > 0 ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-semibold text-stone-700">Step 3 — OTP</p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={busy || allDcNumbers.length === 0}
                    onClick={() => void sendOtp()}
                    className="rounded-xl bg-rlx-green px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Send OTP
                  </button>
                  <button
                    type="button"
                    onClick={() => void load(boyId)}
                    className="rounded-xl border border-rlx-rule bg-white px-3 py-2 text-sm font-semibold text-stone-700"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void load(boyId)}
                  className="rounded-xl border border-rlx-rule bg-white px-3 py-2 text-sm font-semibold text-stone-700"
                >
                  Refresh
                </button>
              </div>
            )}
          </>
        )}
      </Card>
      {otpSending || sessionId ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={otpSending ? "Sending delivery boy OTP" : "Enter delivery boy OTP"}
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-white/20 bg-white p-4 shadow-2xl sm:p-5">
            {sessionId && !busy ? (
              <button
                type="button"
                onClick={() => {
                  setSessionId(null);
                  setDemoOtp(null);
                  setOtpInput("");
                }}
                className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white text-lg text-stone-600 shadow-sm hover:bg-stone-50"
                title="Close OTP window"
                aria-label="Close OTP window"
              >
                ×
              </button>
            ) : null}
            {otpSending ? (
              <OtpSendingIndicator
                label={`Sending OTP to ${selectedBoy?.displayName ?? "delivery boy"}…`}
                description="Delivering to the delivery boy’s registered mobile and email…"
              />
            ) : (
              <DemoOtpGate
                title="Enter delivery boy OTP"
                issuedCode={demoOtp ?? undefined}
                value={otpInput}
                onChange={setOtpInput}
                onVerify={() => void confirmOtp()}
                onRegenerate={() => void sendOtp()}
                verifyBusy={busy}
              />
            )}
          </div>
        </div>
      ) : null}
      {otpSentModal}
    </div>
  );
}

export function StoreDeliveryHandoffPage() {
  return <DeliveryHandoffPage queues={["store_send", "store_receive"]} defaultQueue="store_send" />;
}

export function ScDeliveryHandoffPage() {
  return <DeliveryHandoffPage queues={["ho_receive", "ho_send"]} defaultQueue="ho_receive" />;
}
