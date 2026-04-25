import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson } from "../../lib/api";
import { jobVisibleToStoreUser } from "../../lib/srfAccess";
import { printDcDocument, printFullSrfDocument } from "../../lib/serviceDocuments";
import type { SrfJob } from "../../types/srfJob";

const rowClass = "border-b border-zimson-100 last:border-0";
const statusClass: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800",
  photo_pending: "bg-amber-50 text-amber-900",
  at_store: "bg-stone-100 text-stone-700",
  in_transit_sc: "bg-blue-100 text-blue-700",
  received_at_sc: "bg-violet-100 text-violet-700",
  assigned: "bg-indigo-100 text-indigo-700",
  estimate_ok: "bg-amber-100 text-amber-700",
  reestimate_required: "bg-rose-100 text-rose-700",
  ready_for_outward: "bg-cyan-100 text-cyan-700",
  dispatched_to_store: "bg-orange-100 text-orange-700",
  received_at_store: "bg-emerald-100 text-emerald-700",
  closed: "bg-emerald-200 text-emerald-900",
  cancelled: "bg-stone-200 text-stone-600 line-through decoration-stone-500",
};

function buildSrfTimeline(job: SrfJob): Array<{ label: string; done: boolean; at?: string | null }> {
  return [
    { label: "SRF created", done: true, at: job.createdAt },
    { label: "Store dispatched (DC)", done: Boolean(job.dcNumber), at: job.dispatchedToScAt },
    { label: "HO inward", done: Boolean(job.inwardAt), at: job.inwardAt },
    { label: "Technician assigned", done: Boolean(job.assignedAt), at: job.assignedAt },
    { label: "Estimate approved", done: Boolean(job.estimateOkAt), at: job.estimateOkAt },
    { label: "Repair complete", done: Boolean(job.completedAtSc), at: job.completedAtSc },
    { label: "Outward from HO (ODC)", done: Boolean(job.outwardDcNumber), at: job.dispatchedToStoreAt },
    { label: "Received at store", done: Boolean(job.receivedBackAtStoreAt), at: job.receivedBackAtStoreAt },
    { label: "Billed & closed", done: Boolean(job.closedAt), at: job.closedAt },
  ];
}

export function StoreDispatchPage() {
  const { user } = useAuth();
  const { jobs, dispatchToServiceCentre, receiveOutwardByDc } = useSrfJobs();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [outwardDcInput, setOutwardDcInput] = useState("");
  const [detailJobId, setDetailJobId] = useState<string | null>(null);

  const atStore = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => j.status === "at_store" && jobVisibleToStoreUser(j, user));
  }, [jobs, user]);
  const receivedAtStore = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => j.status === "received_at_store" && jobVisibleToStoreUser(j, user));
  }, [jobs, user]);

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  async function handleReceiveOutward() {
    setMessage(null);
    try {
      const out = await receiveOutwardByDc(outwardDcInput);
      setMessage({ type: "ok", text: `Received ${out.updated} watch(es) against ODC ${outwardDcInput}.` });
      setOutwardDcInput("");
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Could not receive ODC." });
    }
  }

  const pendingOdcOptions = useMemo(() => {
    if (!user) return [];
    const set = new Set<string>();
    for (const j of jobs) {
      if (j.status === "dispatched_to_store" && jobVisibleToStoreUser(j, user) && j.outwardDcNumber) {
        set.add(j.outwardDcNumber);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [jobs, user]);

  const visibleJobs = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => jobVisibleToStoreUser(j, user));
  }, [jobs, user]);

  function toggleAll(checked: boolean) {
    const next: Record<string, boolean> = {};
    if (checked) atStore.forEach((j) => (next[j.id] = true));
    setSelected(next);
  }

  async function handleDispatch() {
    setMessage(null);
    const ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    try {
      const result = await dispatchToServiceCentre(ids);
      const rows = atStore.filter((j) => ids.includes(j.id));
      printDcDocument("DC", result.dcNumber, rows);
      setMessage({
        type: "ok",
        text: `Delivery challan ${result.dcNumber} created for this store only. Hand over watches with the DC copy; your regional HO inward desk will select this DC from their pending list (no manual typing).`,
      });
      void apiJson("/api/notifications/service-dispatch", {
        method: "POST",
        json: { dcNumber: result.dcNumber, count: ids.length },
      }).catch(() => {});
      setSelected({});
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Could not create DC." });
    }
  }

  if (!user) return null;

  return (
    <div>
      <ServiceBreadcrumb current="Send to service centre" />
      <PageHeader
        title="Send watches to service centre (HO)"
        description="End of day: select SRFs that are still at the store and generate one DC to ship them to your regional service centre / HO."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/service/store-billing"
              className="inline-flex rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Open store billing
            </Link>
            <Link
              to="/service"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Service home
            </Link>
          </div>
        }
      />

      <Card
        title="SRFs at this store"
        subtitle="Each store ships separately to its regional HO — only this store’s SRFs appear here"
      >
        {atStore.length === 0 ? (
          <p className="text-sm text-stone-600">
            No open SRFs at your store. Create one from{" "}
            <Link className="font-medium text-zimson-800 underline" to="/service/srf">
              SRF booking
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={atStore.length > 0 && atStore.every((j) => selected[j.id])}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="rounded border-zimson-300 text-zimson-600 focus:ring-zimson-500"
                />
                Select all ({atStore.length})
              </label>
              <button
                type="button"
                onClick={() => void handleDispatch()}
                className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
              >
                Create DC &amp; mark in transit
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-stone-500">
                    <th className="py-2 pr-2 w-10" />
                    <th className="py-2 pr-3">SRF</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Watch</th>
                    <th className="py-2">Est. (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  {atStore.map((j) => (
                    <tr key={j.id} className={rowClass}>
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={!!selected[j.id]}
                          onChange={() => toggle(j.id)}
                          className="rounded border-zimson-300 text-zimson-600 focus:ring-zimson-500"
                        />
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs font-semibold text-zimson-900">
                        {j.reference}
                      </td>
                      <td className="py-2 pr-3 text-stone-800">
                        {j.customerName}
                        <span className="block text-xs text-stone-500">{j.phone}</span>
                      </td>
                      <td className="py-2 pr-3 text-stone-700">
                        {j.watchBrand} {j.watchModel}
                      </td>
                      <td className="py-2 tabular-nums text-stone-800">
                        {j.estimateTotalInr.toLocaleString(undefined, {
                          style: "currency",
                          currency: "INR",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {message ? (
          <p
            className={
              message.type === "ok"
                ? "mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200"
                : "mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200"
            }
          >
            {message.text}
          </p>
        ) : null}
      </Card>

      <Card title="Receive from HO (ODC)" subtitle="Scan/type ODC and confirm receipt at store" className="mt-8">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Pending ODC number
            <select
              className="mt-1 min-w-[280px] rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
              value={outwardDcInput}
              onChange={(e) => setOutwardDcInput(e.target.value)}
            >
              <option value="">Select pending ODC…</option>
              {pendingOdcOptions.map((dc) => (
                <option key={dc} value={dc}>
                  {dc}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void handleReceiveOutward()}
            disabled={!outwardDcInput}
            className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Confirm store receive
          </button>
        </div>
      </Card>

      <Card
        title="SRF inventory at store"
        subtitle="Inwarded watches stay in store inventory until customer comes for collection."
        className="mt-8"
      >
        {receivedAtStore.length === 0 ? (
          <p className="text-sm text-stone-600">No inwarded watches in store inventory.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-3">SRF</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Watch</th>
                  <th className="py-2 pr-3">Inward at store</th>
                  <th className="py-2">Estimate</th>
                </tr>
              </thead>
              <tbody>
                {receivedAtStore.map((j) => (
                  <tr key={j.id} className={rowClass}>
                    <td className="py-2 pr-3 font-mono text-xs font-semibold text-zimson-900">{j.reference}</td>
                    <td className="py-2 pr-3 text-stone-800">
                      {j.customerName}
                      <span className="block text-xs text-stone-500">{j.phone}</span>
                    </td>
                    <td className="py-2 pr-3 text-stone-700">{j.watchBrand} {j.watchModel}</td>
                    <td className="py-2 pr-3 text-stone-700">{j.receivedBackAtStoreAt ? new Date(j.receivedBackAtStoreAt).toLocaleString() : "-"}</td>
                    <td className="py-2 tabular-nums text-stone-800">
                      {j.estimateTotalInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Store billing module" subtitle="Customer collection and invoicing happens in a dedicated page." className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-600">
            Use the separate billing module to search SRF by reference, verify OTP, record payment, and generate invoice.
          </p>
          <Link
            to="/service/store-billing"
            className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
          >
            Go to store billing
          </Link>
        </div>
      </Card>

      <Card title="SRF master table (all data)" subtitle="Track complete SRF lifecycle with DC/ODC and status" className="mt-8">
        <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead>
              <tr className="border-b border-zimson-200 bg-zimson-50/80 text-xs uppercase tracking-wide text-stone-600">
                <th className="px-3 py-2">SRF</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Watch</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">DC</th>
                <th className="px-3 py-2">ODC</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.map((j) => (
                <tr key={j.id} className={rowClass}>
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{j.reference}</td>
                  <td className="px-3 py-2">{j.customerName}</td>
                  <td className="px-3 py-2">{j.watchBrand} {j.watchModel}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass[j.status] ?? "bg-stone-100 text-stone-700"}`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{j.dcNumber ?? "-"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{j.outwardDcNumber ?? "-"}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setDetailJobId(j.id)}
                      className="rounded-lg border border-zimson-300 bg-white px-2 py-1 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {detailJobId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            {(() => {
              const j = visibleJobs.find((x) => x.id === detailJobId);
              if (!j) return <p className="text-sm text-stone-600">SRF details not found.</p>;
              const timeline = buildSrfTimeline(j);
              return (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-stone-900">SRF details — {j.reference}</h3>
                      <p className="text-sm text-stone-600">{j.customerName} · {j.watchBrand} {j.watchModel}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const out = await apiJson<{ rows: Array<{ id: string; status: string; note: string; changedBy: string | null; changedAt: string }> }>(
                              `/api/service/srf-jobs/${encodeURIComponent(j.id)}/status-history`,
                            );
                            printFullSrfDocument(
                              j,
                              (out.rows ?? []).map((x) => ({
                                id: x.id,
                                status: x.status,
                                note: x.note,
                                changedAt: x.changedAt,
                              })),
                            );
                          } catch {
                            printFullSrfDocument(j, []);
                          }
                        }}
                        className="rounded-xl border border-zimson-300 bg-zimson-50 px-3 py-1.5 text-sm font-semibold text-zimson-900"
                      >
                        Print document
                      </button>
                      <button type="button" onClick={() => setDetailJobId(null)} className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm">
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
                    <table className="min-w-full text-left text-sm">
                      <tbody>
                        <tr className="border-b border-zimson-100"><th className="w-52 bg-zimson-50/70 px-3 py-2">Status</th><td className="px-3 py-2">{j.status}</td></tr>
                        <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">DC number</th><td className="px-3 py-2 font-mono">{j.dcNumber ?? "-"}</td></tr>
                        <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">ODC number</th><td className="px-3 py-2 font-mono">{j.outwardDcNumber ?? "-"}</td></tr>
                        <tr className="border-b border-zimson-100"><th className="bg-zimson-50/70 px-3 py-2">Estimate</th><td className="px-3 py-2">INR {Number(j.estimateTotalInr ?? 0).toFixed(2)}</td></tr>
                        <tr><th className="bg-zimson-50/70 px-3 py-2">Store</th><td className="px-3 py-2">{j.storeName ?? j.storeId}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-xl border border-zimson-200/80 p-4">
                    <h4 className="mb-2 text-sm font-semibold text-stone-900">Step status</h4>
                    <div className="space-y-2">
                      {timeline.map((s) => (
                        <div key={s.label} className="flex items-center justify-between rounded-lg border border-zimson-100 px-3 py-2 text-sm">
                          <span className={s.done ? "font-medium text-stone-900" : "text-stone-500"}>{s.label}</span>
                          <span className={s.done ? "text-emerald-700" : "text-stone-400"}>
                            {s.done ? (s.at ? new Date(s.at).toLocaleString() : "Done") : "Pending"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {j.photos && j.photos.length > 0 ? (
                    <div className="rounded-xl border border-zimson-200/80 p-4">
                      <h4 className="mb-2 text-sm font-semibold text-stone-900">Uploaded watch photos</h4>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {j.photos.map((p) => (
                          <div key={p.id} className="rounded-lg border border-zimson-200 p-1.5">
                            <img src={`/${p.filePath}`} alt={p.photoKind ?? "watch photo"} className="h-24 w-full rounded object-cover" />
                            <p className="mt-1 text-[11px] capitalize text-stone-600">{p.photoKind ?? "other"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
