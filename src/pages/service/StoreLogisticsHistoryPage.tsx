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
type OutwardLifecycle = "in_transit" | "at_ho" | "return_dispatched" | "return_received" | "other";
type InwardLifecycle = "awaiting_inward" | "received";

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
  if (job.status === "in_transit_sc") return "in_transit";
  if (job.outwardDcNumber || job.dispatchedToStoreAt) {
    if (job.status === "received_at_store" || job.receivedBackAtStoreAt) return "return_received";
    return "return_dispatched";
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
  if (job.status === "dispatched_to_store" || job.outwardDcNumber) return "awaiting_inward";
  return "awaiting_inward";
}

function lifecycleBadge(row: StoreHistoryRow) {
  if (row.direction === "outward" || row.direction === "both") {
    const lc = row.outwardLifecycle;
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
    if (lc === "return_dispatched") {
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
  }
  if (row.inwardLifecycle === "received") {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
        Inward from HO · Received
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
  const [selected, setSelected] = useState<SrfJob | null>(null);
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
        if (statusFilter === "in_transit" && j.outwardLifecycle !== "in_transit") return false;
        if (statusFilter === "at_ho" && j.outwardLifecycle !== "at_ho") return false;
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
        description="Track internal transfers you sent to the service centre and watches returned from HO."
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
            {direction !== "inward" ? <option value="in_transit">In transit to HO</option> : null}
            {direction !== "inward" ? <option value="at_ho">At service centre</option> : null}
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
          <p className="text-sm text-stone-600">
            No inward or outward transfer records for your store yet. Use{" "}
            <Link to="/service/store-dispatch" className="font-semibold text-zimson-700 underline">
              Store dispatch
            </Link>{" "}
            to send watches to HO or receive returns.
          </p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between border-b border-zimson-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500">SRF details</p>
                <h3 className="font-mono text-lg font-bold text-zimson-900">{selected.reference}</h3>
                <p className="text-sm text-stone-600">{selected.status.replace(/_/g, " ")}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700"
              >
                Close
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <table className="min-w-full text-left text-sm">
                <tbody>
                  <tr className="border-b border-zimson-100">
                    <th className="w-48 bg-zimson-50/70 px-3 py-2">Customer</th>
                    <td className="px-3 py-2">
                      {selected.customerName} · {selected.phone}
                    </td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Watch</th>
                    <td className="px-3 py-2">
                      {selected.watchBrand} {selected.watchModel} · S/N {selected.serial || "—"}
                    </td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Outward transfer (TD)</th>
                    <td className="px-3 py-2 font-mono">{selected.dcNumber ?? "—"}</td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Return transfer (TD)</th>
                    <td className="px-3 py-2 font-mono">{selected.outwardDcNumber ?? "—"}</td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Timeline</th>
                    <td className="px-3 py-2 text-xs text-stone-700">
                      Sent to HO:{" "}
                      {selected.dispatchedToScAt ? new Date(selected.dispatchedToScAt).toLocaleString() : "—"}
                      <br />
                      HO inward: {selected.inwardAt ? new Date(selected.inwardAt).toLocaleString() : "—"}
                      <br />
                      HO dispatch to store:{" "}
                      {selected.dispatchedToStoreAt
                        ? new Date(selected.dispatchedToStoreAt).toLocaleString()
                        : "—"}
                      <br />
                      Store inward:{" "}
                      {selected.receivedBackAtStoreAt
                        ? new Date(selected.receivedBackAtStoreAt).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-zimson-50/70 px-3 py-2">Complaint</th>
                    <td className="px-3 py-2">{selected.complaint || "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 border-t border-zimson-100 px-5 py-4">
              {selected.dcNumber ? (
                <button
                  type="button"
                  onClick={() => printTransferForJob(selected, selected.dcNumber!, "store_to_ho")}
                  className="rounded-xl border border-zimson-300 bg-zimson-50 px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-100"
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
                  className="rounded-xl border border-zimson-300 bg-zimson-50 px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-100"
                >
                  Reprint return transfer
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
