import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { jobVisibleToServiceCentre } from "../../lib/srfAccess";
import type { SrfJob } from "../../types/srfJob";

const selectClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2";

const tabBtn =
  "rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zimson-400";
const tabActive = "bg-zimson-600 text-white shadow-sm";
const tabIdle = "border border-zimson-300 bg-white text-zimson-900 hover:bg-zimson-50";

export function ScLogisticsPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const { jobs, confirmInwardByDc, createOutwardBatch } = useSrfJobs();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "outward" ? "outward" : "inward";

  const storeById = useMemo(() => {
    const m = new Map<string, { regionName: string; storeName: string }>();
    for (const r of regions) {
      for (const s of r.stores) {
        m.set(s.id, { regionName: r.name, storeName: s.name });
      }
    }
    return m;
  }, [regions]);

  const storeOptions = useMemo(() => {
    const rows: { id: string; label: string }[] = [];
    for (const r of regions) {
      for (const s of r.stores) {
        rows.push({ id: s.id, label: `HO: ${r.name} · Store: ${s.name}` });
      }
    }
    return rows;
  }, [regions]);

  const [selectedDc, setSelectedDc] = useState("");
  const [inwardMsg, setInwardMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [selectedOut, setSelectedOut] = useState<Record<string, boolean>>({});
  const [destByJob, setDestByJob] = useState<Record<string, string>>({});
  const [outwardMsg, setOutwardMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const inTransit = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => j.status === "in_transit_sc" && jobVisibleToServiceCentre(j, user));
  }, [jobs, user]);

  /** One row per open DC — HO (region) and originating store are shown separately. */
  const pendingDcOptions = useMemo(() => {
    const map = new Map<string, SrfJob[]>();
    for (const j of inTransit) {
      if (!j.dcNumber) continue;
      const list = map.get(j.dcNumber) ?? [];
      list.push(j);
      map.set(j.dcNumber, list);
    }
    const rows = [...map.entries()].map(([dcNumber, list]) => {
      const first = list[0];
      const loc = storeById.get(first.storeId);
      return {
        dcNumber,
        count: list.length,
        hoLabel: loc?.regionName ?? first.regionId,
        storeLabel: loc?.storeName ?? first.storeId,
      };
    });
    return rows.sort((a, b) => a.dcNumber.localeCompare(b.dcNumber));
  }, [inTransit, storeById]);

  useEffect(() => {
    if (selectedDc && !pendingDcOptions.some((o) => o.dcNumber === selectedDc)) {
      setSelectedDc("");
    }
  }, [pendingDcOptions, selectedDc]);

  const inTransitByDc = useMemo(() => {
    const map = new Map<string, SrfJob[]>();
    for (const j of inTransit) {
      const key = j.dcNumber ?? "—";
      const list = map.get(key) ?? [];
      list.push(j);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [inTransit]);

  const readyOutward = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => j.status === "ready_for_outward" && jobVisibleToServiceCentre(j, user));
  }, [jobs, user]);

  function setTab(next: "inward" | "outward") {
    setSearchParams(next === "inward" ? {} : { tab: "outward" }, { replace: true });
  }

  function handleInward(e: React.FormEvent) {
    e.preventDefault();
    setInwardMsg(null);
    if (!selectedDc.trim()) {
      setInwardMsg({ type: "err", text: "Choose a pending DC from the list for this HO." });
      return;
    }
    const result = confirmInwardByDc(selectedDc);
    if ("error" in result) {
      setInwardMsg({ type: "err", text: result.error });
      return;
    }
    setInwardMsg({
      type: "ok",
      text: `Inward recorded for ${result.updated} watch(es) on DC ${selectedDc}. Supervisor can now assign technicians.`,
    });
    setSelectedDc("");
  }

  function destinationFor(jobId: string, originatingStoreId: string) {
    return destByJob[jobId] ?? originatingStoreId;
  }

  function toggleOut(id: string) {
    setSelectedOut((s) => ({ ...s, [id]: !s[id] }));
  }

  function toggleAllOut(checked: boolean) {
    const next: Record<string, boolean> = {};
    if (checked) readyOutward.forEach((j) => (next[j.id] = true));
    setSelectedOut(next);
  }

  function handleCreateOdc() {
    setOutwardMsg(null);
    const ids = Object.entries(selectedOut)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (ids.length === 0) {
      setOutwardMsg({ type: "err", text: "Select at least one SRF." });
      return;
    }
    const items = ids.map((jobId) => {
      const j = jobs.find((x) => x.id === jobId);
      const dest = destinationFor(jobId, j?.storeId ?? "");
      return { jobId, destinationStoreId: dest };
    });
    const result = createOutwardBatch(items);
    if ("error" in result) {
      setOutwardMsg({ type: "err", text: result.error });
      return;
    }
    setOutwardMsg({
      type: "ok",
      text: `Outward challan ${result.odcNumber} created. Selected watches are dispatched to their destination stores.`,
    });
    setSelectedOut({});
  }

  return (
    <div>
      <PageHeader
        title="Service centre logistics"
        description="Each regional HO only sees its own pending DCs and queues. Inward: pick the store’s open DC from the list (no typing). Outward: ODC per batch, destination store separate from HO."
        actions={
          <Link
            to="/service-centre"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Service centre home
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <button type="button" className={`${tabBtn} ${tab === "inward" ? tabActive : tabIdle}`} onClick={() => setTab("inward")}>
          Inward (DC)
        </button>
        <button
          type="button"
          className={`${tabBtn} ${tab === "outward" ? tabActive : tabIdle}`}
          onClick={() => setTab("outward")}
        >
          Outward (ODC)
        </button>
      </div>

      {tab === "inward" ? (
        <>
          <Card
            title="Inward by delivery challan (DC)"
            subtitle="Pending DCs from stores shipping to this HO only — each line is one store batch, separate from the service centre (HO)"
          >
            <form onSubmit={handleInward} className="max-w-2xl space-y-4">
              <div>
                <label htmlFor="dc-pending" className="text-xs font-medium text-stone-600">
                  Select pending DC
                </label>
                <select
                  id="dc-pending"
                  value={selectedDc}
                  onChange={(e) => setSelectedDc(e.target.value)}
                  className={selectClass}
                >
                  <option value="">— Choose a DC awaiting inward —</option>
                  {pendingDcOptions.map((o) => (
                    <option key={o.dcNumber} value={o.dcNumber}>
                      {o.dcNumber} · HO: {o.hoLabel} · From store: {o.storeLabel} · {o.count} watch
                      {o.count === 1 ? "" : "es"}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-stone-500">
                  Stores create DCs from their counter; this list is built from shipments still in transit to{" "}
                  <strong>your</strong> regional HO. Other HOs and other stores stay isolated in their own data.
                </p>
              </div>
              <button
                type="submit"
                disabled={!selectedDc || pendingDcOptions.length === 0}
                className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm inward
              </button>
            </form>
            {inwardMsg ? (
              <p
                className={
                  inwardMsg.type === "ok"
                    ? "mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200"
                    : "mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200"
                }
              >
                {inwardMsg.text}
              </p>
            ) : null}
          </Card>

          <Card
            title="In transit to this HO"
            subtitle="Grouped by DC — originating store is not the HO; inward confirms receipt at the service centre"
            className="mt-8"
          >
            {inTransit.length === 0 ? (
              <p className="text-sm text-stone-600">
                Nothing in transit for this regional HO. Each store dispatches separately; their open DCs will
                appear in the dropdown above.
              </p>
            ) : (
              <div className="space-y-6">
                {inTransitByDc.map(([dc, list]) => {
                  const first = list[0];
                  const loc = storeById.get(first.storeId);
                  return (
                    <div key={dc}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                        <span className="font-mono text-zimson-900">{dc}</span>
                        <span className="ml-2 font-normal normal-case text-stone-600">
                          HO {loc?.regionName ?? first.regionId} · Store {loc?.storeName ?? first.storeId} ·{" "}
                          {list.length} SRF{list.length === 1 ? "" : "s"}
                        </span>
                      </p>
                      <ul className="space-y-2 text-sm">
                        {list.map((j) => (
                          <li
                            key={j.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zimson-200/80 bg-zimson-50/40 px-3 py-2"
                          >
                            <span className="font-mono font-semibold text-zimson-900">{j.reference}</span>
                            <span className="text-stone-700">
                              {j.watchBrand} {j.watchModel}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          <Card title="Create outward challan (ODC)" subtitle="After technician marks repair complete">
            <p className="text-sm text-stone-600">
              Select watches that are <strong>ready for outward</strong>, set each <strong>destination store</strong>{" "}
              (defaults to the store that raised the SRF), then generate one ODC for the batch.
            </p>
            {outwardMsg ? (
              <p
                className={
                  outwardMsg.type === "ok"
                    ? "mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200"
                    : "mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200"
                }
              >
                {outwardMsg.text}
              </p>
            ) : null}

            {readyOutward.length === 0 ? (
              <p className="mt-4 text-sm text-stone-600">
                No watches in the outward queue. Technicians must mark repair complete first; jobs then appear here.
              </p>
            ) : (
              <>
                <div className="mt-4 mb-3 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm text-stone-700">
                    <input
                      type="checkbox"
                      checked={readyOutward.length > 0 && readyOutward.every((j) => selectedOut[j.id])}
                      onChange={(e) => toggleAllOut(e.target.checked)}
                      className="rounded border-zimson-400 text-zimson-600 focus:ring-zimson-500"
                    />
                    Select all
                  </label>
                  <button
                    type="button"
                    onClick={handleCreateOdc}
                    className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
                  >
                    Generate ODC &amp; dispatch
                  </button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                      <tr>
                        <th className="px-3 py-2 w-10" />
                        <th className="px-3 py-2">SRF</th>
                        <th className="px-3 py-2">Watch</th>
                        <th className="px-3 py-2 min-w-[220px]">Destination store</th>
                      </tr>
                    </thead>
                    <tbody>
                      {readyOutward.map((j) => (
                        <tr key={j.id} className="border-b border-zimson-100 last:border-0">
                          <td className="px-3 py-2 align-top">
                            <input
                              type="checkbox"
                              checked={!!selectedOut[j.id]}
                              onChange={() => toggleOut(j.id)}
                              className="rounded border-zimson-400 text-zimson-600 focus:ring-zimson-500"
                            />
                          </td>
                          <td className="px-3 py-2 align-top font-mono font-semibold text-zimson-900">{j.reference}</td>
                          <td className="px-3 py-2 align-top text-stone-700">
                            {j.watchBrand} {j.watchModel}
                            <span className="mt-0.5 block text-xs text-stone-500">{j.customerName}</span>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <select
                              value={destinationFor(j.id, j.storeId)}
                              onChange={(e) =>
                                setDestByJob((prev) => ({ ...prev, [j.id]: e.target.value }))
                              }
                              className="w-full max-w-xs rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zimson-400/40"
                            >
                              {storeOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-stone-500">Originating store is pre-selected.</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
