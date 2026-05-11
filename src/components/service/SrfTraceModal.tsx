import { useEffect, useMemo, useState } from "react";
import { useSrfJobs, type SrfTrace, type SrfTraceActionRow, type SrfTraceReestimateAttempt, type SrfTraceStatusRow } from "../../context/SrfJobsContext";
import { openPrintDocument } from "../../lib/inventoryDocuments";

type Props = {
  srfId: string;
  onClose: () => void;
};

const ACTION_LABELS: Record<string, string> = {
  srf_draft_created: "SRF draft created",
  srf_finalized: "SRF finalized",
  srf_cancelled: "SRF cancelled",
  store_dc_dispatch: "Store dispatched (internal transfer)",
  sc_inward_dc: "Service centre inward (internal transfer)",
  sender_ho_inward_return_dc: "Sender HO inward (return transfer)",
  supervisor_assign_technician: "Technician assigned",
  technician_estimate_ok: "Technician confirmed estimate",
  technician_request_reestimate: "Technician raised re-estimate",
  spares_slip_submitted: "Used spares slip submitted",
  technician_repair_complete: "Technician marked repair complete",
  supervisor_repair_complete: "Supervisor marked repair complete",
  supervisor_request_reestimate: "Supervisor sent re-estimate to customer",
  supervisor_negotiate_after_rejection: "Supervisor negotiated after rejection",
  supervisor_move_to_odc: "Supervisor moved to ODC (no repair)",
  supervisor_transfer_other_ho: "Queued transfer to other HO",
  inter_ho_dispatch_to_repair: "Dispatched to repair HO",
  inter_ho_return_to_sender: "Returned to sender HO",
  ho_dispatch_to_store: "HO dispatched to store",
  store_inward_odc: "Store inward (internal outward transfer)",
  store_close_with_invoice: "Customer billed & SRF closed",
  store_no_billing_handover: "Customer handover (no billing)",
  customer_accept_reestimate: "Customer accepted re-estimate",
  customer_reject_reestimate: "Customer rejected re-estimate",
  convert_to_local_create: "Local SRF created from inter-HO",
  convert_to_local_close_source: "Source SRF closed (converted)",
};

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function fmtINR(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { style: "currency", currency: "INR" });
}

type TimelineItem =
  | { kind: "action"; at: string; row: SrfTraceActionRow }
  | { kind: "status"; at: string; row: SrfTraceStatusRow };

function buildTimeline(trace: SrfTrace): TimelineItem[] {
  const items: TimelineItem[] = [
    ...trace.actions.map((row) => ({ kind: "action" as const, at: row.createdAt, row })),
    ...trace.statusHistory.map((row) => ({ kind: "status" as const, at: row.changedAt, row })),
  ];
  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return items;
}

export function SrfTraceModal({ srfId, onClose }: Props) {
  const { getSrfTrace } = useSrfJobs();
  const [trace, setTrace] = useState<SrfTrace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSrfTrace(srfId)
      .then((data) => {
        if (!cancelled) {
          setTrace(data);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load SRF trace.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [srfId, getSrfTrace]);

  const timeline = useMemo(() => (trace ? buildTimeline(trace) : []), [trace]);

  function printTrace() {
    if (!trace) return;
    const rowsHtml = timeline
      .map((it) => {
        if (it.kind === "action") {
          const r = it.row;
          return `<tr>
            <td>${fmtDateTime(it.at)}</td>
            <td>Action</td>
            <td>${ACTION_LABELS[r.action] ?? r.action}</td>
            <td>${(r.actorName ?? "-")}${r.actorRole ? ` (${r.actorRole.replace(/_/g, " ")})` : ""}</td>
            <td>${r.referenceDoc ?? ""}</td>
            <td>${r.amountInr != null ? fmtINR(r.amountInr) : ""}</td>
            <td>${r.description ?? ""}</td>
          </tr>`;
        }
        const s = it.row;
        return `<tr>
          <td>${fmtDateTime(it.at)}</td>
          <td>Status</td>
          <td>${s.status.replace(/_/g, " ")}</td>
          <td>${(s.changedByName ?? "system")}${s.changedByRole ? ` (${s.changedByRole.replace(/_/g, " ")})` : ""}</td>
          <td></td>
          <td></td>
          <td>${s.note ?? ""}</td>
        </tr>`;
      })
      .join("");
    const reestimateHtml = trace.reestimates
      .map(
        (r) => `<tr>
          <td>#${r.attemptNo}</td>
          <td>${fmtINR(r.amountInr)}</td>
          <td>${r.remark ?? ""}</td>
          <td>${(r.raisedByName ?? "-")}${r.raisedByRole ? ` (${r.raisedByRole.replace(/_/g, " ")})` : ""}<br/><small>${fmtDateTime(r.raisedAt)}</small></td>
          <td>${r.customerResponse ? `${r.customerResponse}${r.customerResponseAt ? ` · ${fmtDateTime(r.customerResponseAt)}` : ""}${r.customerResponseNote ? `<br/><em>${r.customerResponseNote}</em>` : ""}` : "-"}</td>
          <td>${r.supervisorFollowup ? `${r.supervisorFollowup.replace(/_/g, " ")}${r.supervisorFollowupAt ? ` · ${fmtDateTime(r.supervisorFollowupAt)}` : ""}${r.supervisorFollowupNote ? `<br/><em>${r.supervisorFollowupNote}</em>` : ""}` : "-"}</td>
        </tr>`,
      )
      .join("");
    openPrintDocument(
      `SRF trace ${trace.job.reference}`,
      `<div style="font-family:Arial,sans-serif;padding:20px;color:#111">
        <h2 style="margin:0 0 12px">SRF traceability — ${trace.job.reference}</h2>
        <p>${trace.job.customerName} · ${trace.job.phone}</p>
        <p>${trace.job.watchBrand} ${trace.job.watchModel} · ${trace.job.serial}</p>
        <h3 style="margin-top:18px">Re-estimate cycles</h3>
        <table border="1" cellspacing="0" cellpadding="6" style="width:100%;border-collapse:collapse">
          <thead><tr><th>#</th><th>Amount</th><th>Remark</th><th>Raised by</th><th>Customer response</th><th>Supervisor follow-up</th></tr></thead>
          <tbody>${reestimateHtml || `<tr><td colspan="6">No re-estimate cycles.</td></tr>`}</tbody>
        </table>
        <h3 style="margin-top:18px">Full timeline</h3>
        <table border="1" cellspacing="0" cellpadding="6" style="width:100%;border-collapse:collapse">
          <thead><tr><th>Date time</th><th>Type</th><th>Action / status</th><th>By</th><th>Doc</th><th>Amount</th><th>Description</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4">
      <div className="mt-8 w-full max-w-5xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <div>
            <h3 className="text-lg font-semibold text-zimson-900">SRF traceability</h3>
            {trace ? (
              <p className="text-xs text-stone-600">
                {trace.job.reference} · {trace.job.customerName} · {trace.job.watchBrand} {trace.job.watchModel}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {trace ? (
              <button
                type="button"
                onClick={printTrace}
                className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
              >
                Print full trace
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              Close
            </button>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto px-5 pb-5 pt-4">
          {loading ? (
            <p className="text-sm text-stone-600">Loading trace…</p>
          ) : error ? (
            <p className="text-sm text-rose-700">{error}</p>
          ) : trace ? (
            <div className="space-y-6">
              <SrfHeader trace={trace} />
              <ReestimateCard reestimates={trace.reestimates} />
              <TimelineCard timeline={timeline} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SrfHeader({ trace }: { trace: SrfTrace }) {
  const j = trace.job;
  return (
    <div className="grid gap-2 rounded-2xl border border-zimson-200 bg-zimson-50/40 p-4 text-xs text-stone-700 sm:grid-cols-2">
      <div>
        <p>
          <span className="font-semibold text-stone-900">Reference:</span>{" "}
          <span className="font-mono">{j.reference}</span>
        </p>
        <p>
          <span className="font-semibold text-stone-900">Status:</span> {j.status.replace(/_/g, " ")}
        </p>
        <p>
          <span className="font-semibold text-stone-900">Approved estimate:</span> {fmtINR(j.estimateTotalInr)}
        </p>
        <p>
          <span className="font-semibold text-stone-900">Created:</span> {fmtDateTime(j.createdAt)}
        </p>
      </div>
      <div>
        <p>
          <span className="font-semibold text-stone-900">Customer:</span> {j.customerName} · {j.phone}
        </p>
        <p>
          <span className="font-semibold text-stone-900">Watch:</span> {j.watchBrand} {j.watchModel} · {j.serial}
        </p>
        {j.dcNumber ? (
          <p>
            <span className="font-semibold text-stone-900">Inward DC:</span> {j.dcNumber}
          </p>
        ) : null}
        {j.outwardDcNumber ? (
          <p>
            <span className="font-semibold text-stone-900">Outward ODC:</span> {j.outwardDcNumber}
          </p>
        ) : null}
        {j.hoSparesBillRef ? (
          <p>
            <span className="font-semibold text-stone-900">HO bill:</span> {j.hoSparesBillRef}
          </p>
        ) : null}
        {j.storeBillRef ? (
          <p>
            <span className="font-semibold text-stone-900">Store bill:</span> {j.storeBillRef}
          </p>
        ) : null}
        {j.transferSourceReference ? (
          <p>
            <span className="font-semibold text-stone-900">Source SRF:</span> {j.transferSourceReference}
          </p>
        ) : null}
      </div>
      <div className="sm:col-span-2 mt-2 border-t border-zimson-200 pt-2 text-[10px] text-stone-500 uppercase tracking-wider font-semibold">
        Mapping &amp; Logistics
      </div>
      <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <p>
          <span className="font-semibold text-stone-900">Booked at:</span> {j.storeName ?? j.storeId} ({j.regionName ?? j.regionId})
        </p>
        <p>
          <span className="font-semibold text-stone-900">Customer destination:</span> {j.destinationStoreId}
        </p>
        {j.transferTargetRegionId && (
          <p className="text-amber-700">
            <span className="font-semibold">Transferred to HO:</span> {j.transferTargetRegionId}
          </p>
        )}
      </div>
    </div>
  );
}

function ReestimateCard({ reestimates }: { reestimates: SrfTraceReestimateAttempt[] }) {
  if (reestimates.length === 0) {
    return (
      <div>
        <h4 className="mb-2 text-sm font-semibold text-zimson-900">Re-estimate cycles</h4>
        <p className="text-xs text-stone-600">No re-estimate raised on this SRF.</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-zimson-900">
        Re-estimate cycles · {reestimates.length} attempt{reestimates.length === 1 ? "" : "s"}
      </h4>
      <div className="space-y-2">
        {reestimates.map((r) => (
          <div key={r.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-stone-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-amber-900">
                Attempt #{r.attemptNo} — {fmtINR(r.amountInr)}
              </p>
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                Raised {fmtDateTime(r.raisedAt)}
              </span>
            </div>
            {r.remark ? <p className="mt-1 italic text-stone-700">“{r.remark}”</p> : null}
            <p className="mt-1">
              <span className="font-semibold">Raised by:</span>{" "}
              {r.raisedByName ?? "system"}
              {r.raisedByRole ? ` · ${r.raisedByRole.replace(/_/g, " ")}` : ""}
            </p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              <div className="rounded-lg bg-white/80 p-2">
                <p className="font-semibold text-stone-900">Customer response</p>
                {r.customerResponse ? (
                  <>
                    <p
                      className={`mt-0.5 ${
                        r.customerResponse === "accepted" ? "text-emerald-700" : "text-rose-700"
                      } font-semibold`}
                    >
                      {r.customerResponse.toUpperCase()}{" "}
                      {r.customerResponseAt ? `· ${fmtDateTime(r.customerResponseAt)}` : ""}
                    </p>
                    {r.customerResponseNote ? (
                      <p className="mt-0.5 text-stone-700">{r.customerResponseNote}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-0.5 text-stone-600">Awaiting response</p>
                )}
              </div>
              <div className="rounded-lg bg-white/80 p-2">
                <p className="font-semibold text-stone-900">Supervisor follow-up</p>
                {r.supervisorFollowup ? (
                  <>
                    <p className="mt-0.5 font-semibold text-indigo-800">
                      {r.supervisorFollowup === "negotiate"
                        ? "Negotiated → new re-estimate sent"
                        : "Moved to ODC (no repair)"}
                      {r.supervisorFollowupAt ? ` · ${fmtDateTime(r.supervisorFollowupAt)}` : ""}
                    </p>
                    {r.supervisorFollowupByName ? (
                      <p className="mt-0.5 text-stone-700">By {r.supervisorFollowupByName}</p>
                    ) : null}
                    {r.supervisorFollowupNote ? (
                      <p className="mt-0.5 text-stone-700">{r.supervisorFollowupNote}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-0.5 text-stone-600">No follow-up needed.</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineCard({ timeline }: { timeline: TimelineItem[] }) {
  if (timeline.length === 0) {
    return <p className="text-xs text-stone-600">No timeline events.</p>;
  }
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-zimson-900">Full activity timeline</h4>
      <ol className="relative ml-3 space-y-3 border-l border-zimson-200 pl-4">
        {timeline.map((it, idx) => (
          <li key={idx} className="relative">
            <span
              className={`absolute -left-[22px] top-1.5 inline-flex h-3 w-3 rounded-full ${
                it.kind === "action" ? "bg-zimson-500" : "bg-stone-400"
              }`}
            />
            <div className="rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-700 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-zimson-900">
                  {it.kind === "action"
                    ? ACTION_LABELS[it.row.action] ?? it.row.action.replace(/_/g, " ")
                    : `Status → ${it.row.status.replace(/_/g, " ")}`}
                </p>
                <span className="text-[11px] text-stone-500">{fmtDateTime(it.at)}</span>
              </div>
              {it.kind === "action" ? (
                <>
                  {it.row.description ? <p className="mt-1">{it.row.description}</p> : null}
                  <p className="mt-1 text-stone-600">
                    By {it.row.actorName ?? "system"}
                    {it.row.actorRole ? ` · ${it.row.actorRole.replace(/_/g, " ")}` : ""}
                    {it.row.referenceDoc ? ` · Doc ${it.row.referenceDoc}` : ""}
                    {it.row.amountInr != null ? ` · ${fmtINR(it.row.amountInr)}` : ""}
                  </p>
                </>
              ) : (
                <>
                  {it.row.note ? <p className="mt-1">{it.row.note}</p> : null}
                  <p className="mt-1 text-stone-600">
                    By {it.row.changedByName ?? "system"}
                    {it.row.changedByRole ? ` · ${it.row.changedByRole.replace(/_/g, " ")}` : ""}
                  </p>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
