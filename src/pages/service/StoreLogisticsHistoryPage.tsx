import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { isArchivedSrfJob, jobVisibleToStoreUser } from "../../lib/srfAccess";
import { printTransferFromMeta } from "../../lib/serviceDocuments";
import { resolveHoToStorePrint, resolveStoreToHoPrint } from "../../lib/transferDocumentKind";
import type { SrfJob } from "../../types/srfJob";

type DirectionFilter = "all" | "outward" | "inward";
type OutwardLifecycle =
  | "waiting_delivery_boy"
  | "in_transit"
  | "at_ho"
  | "return_waiting_delivery_boy"
  | "return_in_transit"
  | "return_awaiting_inward"
  | "return_received"
  | "other";
type InwardLifecycle = "waiting_delivery_boy" | "in_transit_to_store" | "awaiting_inward" | "received";

type StoreHistoryRow = SrfJob & {
  direction: "outward" | "inward" | "both";
  transferNo: string;
  outwardLifecycle?: OutwardLifecycle;
  inwardLifecycle?: InwardLifecycle;
  eventAt: string;
};

function transferSeriesLabel(no: string | null | undefined): string {
  const u = (no ?? "").trim().toUpperCase();
  if (!u) return "—";
  if (u.startsWith("TD")) return "TD";
  if (u.startsWith("DC")) return "DC";
  return "Ref";
}

function outwardLifecycle(job: SrfJob): OutwardLifecycle {
  if (job.status === "pending_ho_transit") return "waiting_delivery_boy";
  if (job.status === "in_transit_sc") return "in_transit";
  if (job.outwardDcNumber || job.dispatchedToStoreAt) {
    if (job.status === "received_at_store" || job.receivedBackAtStoreAt) return "return_received";
    if (job.status === "pending_store_transit") return "return_waiting_delivery_boy";
    if (job.status === "dispatched_to_store") return "return_in_transit";
    return "return_awaiting_inward";
  }
  if (
    job.inwardAt ||
    [
      "received_at_sc",
      "assigned",
      "estimate_ok",
      "ready_for_outward",
      "store_self_pending",
      "store_self_assigned",
      "store_self_working",
    ].includes(job.status)
  ) {
    return "at_ho";
  }
  return "other";
}

function inwardLifecycle(job: SrfJob): InwardLifecycle {
  if (job.status === "received_at_store" || job.receivedBackAtStoreAt) return "received";
  if (job.status === "pending_store_transit") return "waiting_delivery_boy";
  if (job.status === "dispatched_to_store") return "in_transit_to_store";
  return "awaiting_inward";
}

function lifecycleBadge(row: StoreHistoryRow) {
  if (row.direction === "outward" || row.direction === "both") {
    const lc = row.outwardLifecycle;
    if (lc === "waiting_delivery_boy") {
      return (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
          Outward to HO · Waiting for delivery boy
        </span>
      );
    }
    if (lc === "in_transit") {
      return (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
          Outward · In transit to HO
        </span>
      );
    }
    if (lc === "at_ho") {
      return (
        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">
          Outward · At service centre
        </span>
      );
    }
    if (lc === "return_waiting_delivery_boy") {
      return (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
          Return from HO · Waiting for delivery boy
        </span>
      );
    }
    if (lc === "return_in_transit") {
      return (
        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-900">
          Return from HO · With delivery boy
        </span>
      );
    }
    if (lc === "return_awaiting_inward") {
      return (
        <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-900">
          Return from HO · Awaiting store inward
        </span>
      );
    }
    if (lc === "return_received") {
      return (
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
          Return from HO · Received at store
        </span>
      );
    }
    if (row.direction === "outward") {
      return (
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
          Outward to HO · Pending
        </span>
      );
    }
  }
  if (row.inwardLifecycle === "received") {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
        Inward from HO · Received
      </span>
    );
  }
  if (row.inwardLifecycle === "waiting_delivery_boy") {
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
        Inward from HO · Waiting for delivery boy
      </span>
    );
  }
  if (row.inwardLifecycle === "in_transit_to_store") {
    return (
      <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-900">
        Inward from HO · With delivery boy
      </span>
    );
  }
  return (
    <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-900">
      Inward from HO · Awaiting inward
    </span>
  );
}

export function StoreLogisticsHistoryPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const { jobs } = useSrfJobs();
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<StoreHistoryRow | null>(null);
  const pageSize = 12;

  const storeId = user?.storeId ?? "";

  const regionForStore = useMemo(
    () => regions.find((r) => r.stores.some((s) => s.id === storeId)),
    [regions, storeId],
  );
  const storeRecord = useMemo(
    () => regionForStore?.stores.find((s) => s.id === storeId),
    [regionForStore, storeId],
  );

  const visibleJobs = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => !isArchivedSrfJob(j) && jobVisibleToStoreUser(j, user));
  }, [jobs, user]);

  const historyRows = useMemo((): StoreHistoryRow[] => {
    if (!user?.storeId) return [];
    const rows: StoreHistoryRow[] = [];
    for (const j of visibleJobs) {
      const isOriginStore = j.storeId === user.storeId;
      const isDestStore = j.destinationStoreId === user.storeId;
      const hasOutward = isOriginStore && Boolean(j.dcNumber || j.dispatchedToScAt);
      const hasInward =
        isDestStore && Boolean(j.outwardDcNumber || j.dispatchedToStoreAt || j.receivedBackAtStoreAt);

      if (!hasOutward && !hasInward) continue;

      let dir: StoreHistoryRow["direction"] = "outward";
      if (hasOutward && hasInward) dir = "both";
      else if (hasInward) dir = "inward";

      const transferNo =
        dir === "inward" ? (j.outwardDcNumber ?? "") : (j.dcNumber ?? j.outwardDcNumber ?? "");

      const eventAt =
        dir === "inward"
          ? j.receivedBackAtStoreAt ?? j.dispatchedToStoreAt ?? j.createdAt
          : j.dispatchedToScAt ?? j.createdAt;

      rows.push({
        ...j,
        direction: dir,
        transferNo,
        outwardLifecycle: hasOutward ? outwardLifecycle(j) : undefined,
        inwardLifecycle: hasInward ? inwardLifecycle(j) : undefined,
        eventAt,
      });
    }
    return rows.sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime());
  }, [visibleJobs, user?.storeId]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;

    return historyRows.filter((j) => {
      if (direction === "outward" && j.direction === "inward") return false;
      if (direction === "inward" && j.direction === "outward") return false;

      if (statusFilter !== "all") {
        if (statusFilter === "waiting_delivery_boy_to_ho" && j.outwardLifecycle !== "waiting_delivery_boy") return false;
        if (statusFilter === "in_transit" && j.outwardLifecycle !== "in_transit") return false;
        if (statusFilter === "at_ho" && j.outwardLifecycle !== "at_ho") return false;
        if (statusFilter === "waiting_delivery_boy" && j.inwardLifecycle !== "waiting_delivery_boy") return false;
        if (statusFilter === "in_transit_to_store" && j.inwardLifecycle !== "in_transit_to_store") return false;
        if (statusFilter === "awaiting_inward" && j.inwardLifecycle !== "awaiting_inward") return false;
        if (statusFilter === "received" && j.inwardLifecycle !== "received") return false;
      }

      const ts = new Date(j.eventAt).getTime();
      if (from != null && ts < from) return false;
      if (to != null && ts > to) return false;

      if (q) {
        const hay = [
          j.reference,
          j.dcNumber,
          j.outwardDcNumber,
          j.transferNo,
          j.customerName,
          j.phone,
          j.watchBrand,
          j.watchModel,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [historyRows, direction, statusFilter, fromDate, toDate, query]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage]);

  const stats = useMemo(() => {
    const outward = historyRows.filter((r) => r.direction === "outward" || r.direction === "both").length;
    const inward = historyRows.filter((r) => r.direction === "inward" || r.direction === "both").length;
    const inTransit = historyRows.filter((r) => r.outwardLifecycle === "in_transit").length;
    const awaitingInward = historyRows.filter((r) => r.inwardLifecycle === "awaiting_inward").length;
    return { outward, inward, inTransit, awaitingInward };
  }, [historyRows]);

  function printTransferForJob(job: SrfJob, transferNumber: string, flow: "store_to_ho" | "ho_to_store") {
    if (!regionForStore || !storeRecord) return;
    if (flow === "store_to_ho") {
      const r = resolveStoreToHoPrint(storeRecord, regionForStore);
      printTransferFromMeta(
        {
          printKind: r.printKind,
          flow: "store_to_ho",
          transferNumber,
          from: r.from,
          to: r.to,
        },
        [job],
        { seriesCode: "TD", transferDate: job.dispatchedToScAt ?? job.createdAt },
      );
      return;
    }
    const destStore =
      regionForStore.stores.find((s) => s.id === job.destinationStoreId) ?? storeRecord;
    const destRegion = regions.find((r) => r.stores.some((s) => s.id === job.destinationStoreId));
    const r = resolveHoToStorePrint(regionForStore, destStore, destRegion);
    printTransferFromMeta(
      {
        printKind: r.printKind,
        flow: "ho_to_store",
        transferNumber,
        from: r.from,
        to: r.to,
      },
      [job],
      { seriesCode: "TD", transferDate: job.dispatchedToStoreAt ?? job.receivedBackAtStoreAt },
    );
  }

  if (!user) return null;

  return (
    <div>
      <ServiceBreadcrumb current="Inward & outward history" />
      <PageHeader
        title="Store inward & outward history"
        description=""
        actions={
          <Link
            to="/service/store-dispatch"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Open store dispatch
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zimson-200 bg-zimson-50/60 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Outward (store → HO)</p>
          <p className="mt-1 text-2xl font-bold text-zimson-900">{stats.outward}</p>
        </div>
        <div className="rounded-xl border border-zimson-200 bg-zimson-50/60 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Inward (HO → store)</p>
          <p className="mt-1 text-2xl font-bold text-zimson-900">{stats.inward}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">In transit to HO</p>
          <p className="mt-1 text-2xl font-bold text-amber-950">{stats.inTransit}</p>
        </div>
        <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-800">Awaiting store inward</p>
          <p className="mt-1 text-2xl font-bold text-violet-950">{stats.awaitingInward}</p>
        </div>
      </div>

      <Card title={`Transfer history (${filteredRows.length})`}>
        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["outward", "Outward (to HO)"],
              ["inward", "Inward (from HO)"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setDirection(key);
                setStatusFilter("all");
                setPage(1);
              }}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                direction === key
                  ? "bg-zimson-600 text-white"
                  : "border border-zimson-300 bg-white text-zimson-900 hover:bg-zimson-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mb-4 grid gap-2 md:grid-cols-2 lg:grid-cols-5">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search SRF, TD/DC no., customer…"
            className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm lg:col-span-2"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            {direction !== "inward" ? <option value="waiting_delivery_boy_to_ho">Waiting for delivery boy to HO</option> : null}
            {direction !== "inward" ? <option value="in_transit">In transit to HO</option> : null}
            {direction !== "inward" ? <option value="at_ho">At service centre</option> : null}
            {direction !== "outward" ? <option value="waiting_delivery_boy">Waiting for delivery boy</option> : null}
            {direction !== "outward" ? <option value="in_transit_to_store">With delivery boy to store</option> : null}
            {direction !== "outward" ? <option value="awaiting_inward">Awaiting store inward</option> : null}
            {direction !== "outward" ? <option value="received">Received at store</option> : null}
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setDirection("all");
            setStatusFilter("all");
            setFromDate("");
            setToDate("");
            setQuery("");
            setPage(1);
          }}
          className="mb-4 rounded-xl border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
        >
          Reset filters
        </button>

        {filteredRows.length === 0 ? (
          <div className="min-h-[2rem]" aria-hidden />
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                  <tr>
                    <th className="px-3 py-2">Direction / status</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">SRF</th>
                    <th className="px-3 py-2">Transfer (TD/DC)</th>
                    <th className="px-3 py-2">Outward TD</th>
                    <th className="px-3 py-2">Return TD</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Watch</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((j) => (
                    <tr
                      key={`hist-${j.id}-${j.direction}`}
                      onClick={() => setSelected(j)}
                      className="cursor-pointer border-b border-zimson-100 hover:bg-zimson-50/60 last:border-0"
                    >
                      <td className="px-3 py-2">{lifecycleBadge(j)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-stone-600">
                        {new Date(j.eventAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{j.reference}</td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs font-semibold text-zimson-900">{j.transferNo || "—"}</span>
                        {j.transferNo ? (
                          <span className="ml-1 text-[10px] font-bold text-stone-500">
                            ({transferSeriesLabel(j.transferNo)})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-stone-800">{j.dcNumber ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-stone-800">{j.outwardDcNumber ?? "—"}</td>
                      <td className="px-3 py-2">{j.customerName}</td>
                      <td className="px-3 py-2 text-stone-700">
                        {j.watchBrand} {j.watchModel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-stone-600">
                Page {currentPage} of {totalPages} · {filteredRows.length} record
                {filteredRows.length === 1 ? "" : "s"}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-zimson-300 px-3 py-1.5 text-xs font-semibold text-zimson-900 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`SRF details ${selected.reference}`}
          onClick={() => setSelected(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.45)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex shrink-0 items-start justify-between overflow-hidden bg-gradient-to-r from-[#0c1c56] via-[#173786] to-[#24499c] px-5 py-5 text-white sm:px-7">
              <div className="absolute inset-x-0 top-0 h-1 bg-rlx-gold" />
              <div className="relative">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-100">SRF logistics details</p>
                <h3 className="mt-1 font-mono text-xl font-bold tracking-wide">{selected.reference}</h3>
                <div className="mt-2">{lifecycleBadge(selected)}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/10 text-xl text-white transition hover:bg-white/20"
                title="Close"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto bg-slate-50 px-5 py-5 sm:px-7">
              <div className="grid gap-3 sm:grid-cols-2">
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Customer</p>
                  <p className="mt-2 font-semibold text-slate-900">{selected.customerName}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{selected.phone || "No mobile number"}</p>
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Watch</p>
                  <p className="mt-2 font-semibold text-slate-900">
                    {selected.watchBrand} {selected.watchModel}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">Serial number: {selected.serial || "—"}</p>
                </section>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">Outward transfer to HO</p>
                  <p className="mt-2 font-mono text-sm font-bold text-blue-950">{selected.dcNumber ?? "Not created"}</p>
                </section>
                <section className="rounded-xl border border-violet-200 bg-violet-50/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700">Return transfer to store</p>
                  <p className="mt-2 font-mono text-sm font-bold text-violet-950">
                    {selected.outwardDcNumber ?? "Not created"}
                  </p>
                </section>
              </div>

              <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Movement timeline</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  {[
                    { label: "Sent to HO", at: selected.dispatchedToScAt },
                    { label: "HO inward", at: selected.inwardAt },
                    { label: "Sent to store", at: selected.dispatchedToStoreAt },
                    { label: "Store inward", at: selected.receivedBackAtStoreAt },
                  ].map((item, index) => {
                    const done = Boolean(item.at);
                    return (
                      <div key={item.label} className="relative flex gap-3 sm:block">
                        <div className="flex flex-col items-center sm:flex-row">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              done ? "bg-emerald-600 text-white" : "border-2 border-slate-300 bg-white text-slate-400"
                            }`}
                          >
                            {done ? "✓" : index + 1}
                          </span>
                          {index < 3 ? (
                            <span className={`hidden h-0.5 flex-1 sm:block ${done ? "bg-emerald-300" : "bg-slate-200"}`} />
                          ) : null}
                        </div>
                        <div className="sm:mt-2">
                          <p className={`text-xs font-semibold ${done ? "text-slate-900" : "text-slate-500"}`}>{item.label}</p>
                          <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                            {item.at ? new Date(item.at).toLocaleString() : "Pending"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-800">Customer complaint</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-800">{selected.complaint || "No complaint recorded."}</p>
              </section>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
              {selected.dcNumber ? (
                <button
                  type="button"
                  onClick={() => printTransferForJob(selected, selected.dcNumber!, "store_to_ho")}
                  className="rounded-xl bg-[#173786] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c1c56]"
                >
                  Reprint outward transfer
                </button>
              ) : null}
              {selected.outwardDcNumber ? (
                <button
                  type="button"
                  onClick={() =>
                    printTransferForJob(selected, selected.outwardDcNumber!, "ho_to_store")
                  }
                  className="rounded-xl bg-[#173786] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c1c56]"
                >
                  Reprint return transfer
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="ml-auto rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
