import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson } from "../../lib/api";
import { jobVisibleToServiceCentre } from "../../lib/srfAccess";
import type { SrfJob } from "../../types/srfJob";
import { printDcDocument } from "../../lib/serviceDocuments";

const selectClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2";

const tabBtn =
  "rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zimson-400";
const tabActive = "bg-zimson-600 text-white shadow-sm";
const tabIdle = "border border-zimson-300 bg-white text-zimson-900 hover:bg-zimson-50";

type OnlineSpareOrderRow = {
  id: string;
  orderNumber: string;
  srfReference: string;
  fromRegionName: string;
  toRegionName: string;
  invoiceRef: string | null;
  fulfilledAt: string | null;
  dispatchedAt: string | null;
};

export function ScLogisticsPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const { jobs, confirmInwardByDc, createOutwardBatch } = useSrfJobs();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "outward" ? "outward" : "inward";

  const canPostDcInward = useMemo(() => {
    if (!user) return false;
    return (
      user.role === "service_centre_clerk" ||
      user.role === "service_centre_inward" ||
      user.role === "super_admin" ||
      user.role === "regional_admin" ||
      user.role === "ho_admin" ||
      user.role === "ho_manager"
    );
  }, [user]);

  const canCreateOdc = useMemo(() => {
    if (!user) return false;
    return (
      user.role === "service_centre_clerk" ||
      user.role === "service_centre_outward" ||
      user.role === "super_admin" ||
      user.role === "regional_admin" ||
      user.role === "ho_admin" ||
      user.role === "ho_manager"
    );
  }, [user]);

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
  const [scanInwardDcInput, setScanInwardDcInput] = useState("");
  const [inwardMsg, setInwardMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [inwardQuery, setInwardQuery] = useState(
    searchParams.get("tab") !== "outward" ? searchParams.get("q") ?? "" : "",
  );
  const [inwardFromDate, setInwardFromDate] = useState("");
  const [inwardToDate, setInwardToDate] = useState("");

  const [selectedOut, setSelectedOut] = useState<Record<string, boolean>>({});
  const [scanOutwardSrfInput, setScanOutwardSrfInput] = useState("");
  const [destByJob, setDestByJob] = useState<Record<string, string>>({});
  const [outwardMsg, setOutwardMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [outwardQuery, setOutwardQuery] = useState(
    searchParams.get("tab") === "outward" ? searchParams.get("q") ?? "" : "",
  );
  const [outwardFromDate, setOutwardFromDate] = useState("");
  const [outwardToDate, setOutwardToDate] = useState("");
  const [onlineSpareRows, setOnlineSpareRows] = useState<OnlineSpareOrderRow[]>([]);

  useEffect(() => {
    const q = searchParams.get("q");
    if (!q) return;
    if (searchParams.get("tab") === "outward") setOutwardQuery(q);
    else setInwardQuery(q);
  }, [searchParams]);
  const [selectedJob, setSelectedJob] = useState<SrfJob | null>(null);

  useEffect(() => {
    if (!user || tab !== "outward") return;
    let cancelled = false;
    void apiJson<{ rows: OnlineSpareOrderRow[] }>("/api/service/inter-ho-spare-orders?status=FULFILLED")
      .then((out) => {
        if (cancelled) return;
        setOnlineSpareRows(out.rows);
      })
      .catch(() => {
        if (cancelled) return;
        setOnlineSpareRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, tab]);

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

  const inwardRows = useMemo(() => {
    const q = inwardQuery.trim().toLowerCase();
    const from = inwardFromDate ? new Date(`${inwardFromDate}T00:00:00`).getTime() : null;
    const to = inwardToDate ? new Date(`${inwardToDate}T23:59:59`).getTime() : null;
    return inTransit
      .filter((j) => {
        const ts = new Date(j.createdAt).getTime();
        if (from != null && ts < from) return false;
        if (to != null && ts > to) return false;
        return true;
      })
      .filter((j) => {
        if (!q) return true;
        const loc = storeById.get(j.storeId);
        return (
          j.reference.toLowerCase().includes(q) ||
          j.customerName.toLowerCase().includes(q) ||
          j.phone.toLowerCase().includes(q) ||
          `${j.watchBrand} ${j.watchModel}`.toLowerCase().includes(q) ||
          (j.dcNumber ?? "").toLowerCase().includes(q) ||
          (loc?.storeName ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [inTransit, inwardQuery, inwardFromDate, inwardToDate, storeById]);

  const readyOutward = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => j.status === "ready_for_outward" && jobVisibleToServiceCentre(j, user));
  }, [jobs, user]);

  const allVisibleJobs = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => jobVisibleToServiceCentre(j, user));
  }, [jobs, user]);

  const allDcRows = useMemo(() => {
    const rows = allVisibleJobs
      .filter((j) => !!j.dcNumber)
      .map((j) => ({ ...j, challan: j.dcNumber as string }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rows;
  }, [allVisibleJobs]);

  const allOdcRows = useMemo(() => {
    const rows = allVisibleJobs
      .filter((j) => !!j.outwardDcNumber)
      .map((j) => ({ ...j, challan: j.outwardDcNumber as string }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rows;
  }, [allVisibleJobs]);

  const outwardRows = useMemo(() => {
    const q = outwardQuery.trim().toLowerCase();
    const from = outwardFromDate ? new Date(`${outwardFromDate}T00:00:00`).getTime() : null;
    const to = outwardToDate ? new Date(`${outwardToDate}T23:59:59`).getTime() : null;
    return readyOutward
      .filter((j) => {
        const ts = new Date(j.createdAt).getTime();
        if (from != null && ts < from) return false;
        if (to != null && ts > to) return false;
        return true;
      })
      .filter((j) => {
        if (!q) return true;
        const loc = storeById.get(j.storeId);
        return (
          j.reference.toLowerCase().includes(q) ||
          j.customerName.toLowerCase().includes(q) ||
          j.phone.toLowerCase().includes(q) ||
          `${j.watchBrand} ${j.watchModel}`.toLowerCase().includes(q) ||
          (loc?.storeName ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [readyOutward, outwardQuery, outwardFromDate, outwardToDate, storeById]);

  function setTab(next: "inward" | "outward") {
    setSearchParams(next === "inward" ? {} : { tab: "outward" }, { replace: true });
  }

  useEffect(() => {
    if (!user) return;
    if (!canPostDcInward && canCreateOdc && tab === "inward") {
      setSearchParams({ tab: "outward" }, { replace: true });
    }
    if (canPostDcInward && !canCreateOdc && tab === "outward") {
      setSearchParams({}, { replace: true });
    }
  }, [user, canPostDcInward, canCreateOdc, tab, setSearchParams]);

  async function handleInward(e: React.FormEvent) {
    e.preventDefault();
    if (!canPostDcInward) return;
    setInwardMsg(null);
    if (!selectedDc.trim()) {
      setInwardMsg({ type: "err", text: "Choose a pending DC from the list for this HO." });
      return;
    }
    try {
      const result = await confirmInwardByDc(selectedDc);
      setInwardMsg({
        type: "ok",
        text: `Inward recorded for ${result.updated} watch(es) on DC ${selectedDc}. Supervisor can now assign technicians.`,
      });
      setSelectedDc("");
    } catch (e) {
      setInwardMsg({ type: "err", text: e instanceof Error ? e.message : "Could not inward DC." });
    }
  }

  function applyScannedInwardDc(raw: string) {
    const scanned = raw.trim().toUpperCase();
    if (!scanned) return;
    const hit = pendingDcOptions.find((o) => o.dcNumber.trim().toUpperCase() === scanned);
    if (!hit) {
      setInwardMsg({ type: "err", text: `Scanned DC not found in pending inward list: ${scanned}` });
      return;
    }
    setSelectedDc(hit.dcNumber);
    setInwardMsg({ type: "ok", text: `DC ${hit.dcNumber} selected from barcode scan.` });
  }

  function destinationFor(jobId: string, originatingStoreId: string) {
    const j = jobs.find((x) => x.id === jobId);
    if (j?.transferTargetStoreId && j.requiresLocalConversion) return j.transferTargetStoreId;
    if (j?.transferSourceStoreId && !j.requiresLocalConversion) return j.transferSourceStoreId;
    return destByJob[jobId] ?? originatingStoreId;
  }

  function toggleOut(id: string) {
    setSelectedOut((s) => ({ ...s, [id]: !s[id] }));
  }

  function applyScannedOutwardSrf(raw: string) {
    const scanned = raw.trim().toUpperCase();
    if (!scanned) return;
    const hit = outwardRows.find((j) => j.reference.trim().toUpperCase() === scanned);
    if (!hit) {
      setOutwardMsg({ type: "err", text: `Scanned SRF not found in outward queue: ${scanned}` });
      return;
    }
    setSelectedOut((prev) => ({ ...prev, [hit.id]: true }));
    setOutwardMsg({ type: "ok", text: `SRF ${hit.reference} selected from barcode scan.` });
  }

  function toggleAllOut(checked: boolean, rows: SrfJob[]) {
    const next: Record<string, boolean> = {};
    if (checked) rows.forEach((j) => (next[j.id] = true));
    setSelectedOut(next);
  }

  async function handleCreateOdc() {
    if (!canCreateOdc) return;
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
    const selectedRows = jobs.filter((j) => ids.includes(j.id));
    const hasReturnToSender = selectedRows.some((j) => !!j.transferTargetRegionId && !j.requiresLocalConversion);
    const missingRepairInvoiceRefs = selectedRows.filter(
      (j) => !!j.transferTargetRegionId && !j.requiresLocalConversion && !(j.hoSparesBillRef ?? "").trim(),
    );
    if (hasReturnToSender && missingRepairInvoiceRefs.length > 0) {
      const refs = missingRepairInvoiceRefs.map((j) => j.reference).join(", ");
      setOutwardMsg({ type: "err", text: `Create repair HO invoice first for: ${refs}` });
      return;
    }
    try {
      const result = await createOutwardBatch(items, {
        storeInvoiceRef: undefined,
      });
      const rows = jobs.filter((j) => ids.includes(j.id));
      const first = rows[0];
      const regionNameById = new Map<string, string>(regions.map((r) => [r.id, r.name]));
      const destLabels = Array.from(new Set(items.map((it) => it.destinationStoreId)))
        .map((sid) => {
          const loc = storeById.get(sid);
          return loc ? `Store: ${loc.storeName} (HO: ${loc.regionName})` : `Store: ${sid}`;
        });
      const toLocation = destLabels.length === 1 ? destLabels[0] : `Multiple stores (${destLabels.length})`;
      const fromHo = first?.regionName ?? (first?.regionId ? regionNameById.get(first.regionId) ?? first.regionId : "-");
      const toHo =
        hasReturnToSender && first?.transferSourceRegionId
          ? regionNameById.get(first.transferSourceRegionId) ?? first.transferSourceRegionId
          : fromHo;
      printDcDocument("ODC", result.odcNumber, rows, {
        fromLocation: `HO / Service Centre: ${fromHo}`,
        toLocation,
        fromHo,
        toHo,
        hoInvoiceRef: hasReturnToSender ? (selectedRows[0]?.hoSparesBillRef ?? undefined) : undefined,
        storeInvoiceRef: undefined,
      });
      setOutwardMsg({
        type: "ok",
        text: `Internal outward transfer ${result.odcNumber} created. Selected watches are dispatched to destination stores.`,
      });
      setSelectedOut({});
    } catch (e) {
      setOutwardMsg({ type: "err", text: e instanceof Error ? e.message : "Could not create internal outward transfer." });
    }
  }

  if (user && !canPostDcInward && !canCreateOdc) {
    return (
      <div>
        <PageHeader
          title="Service centre logistics"
          description="HO inward and outward batches"
          actions={
            <Link
              to="/service-centre"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Service centre home
            </Link>
          }
        />
        <p className="text-sm text-stone-600">
          Your role cannot confirm internal inward from store or generate internal outward batches. Use supervisor/technician
          areas instead, or ask an administrator for the inward/outward logistics role.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Service centre logistics"
        description="Each regional HO sees its own internal transfers. Inward: pick the store transfer from list (no typing). Outward: transfer per batch back to store."
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
          Internal inward (Store to HO)
        </button>
        <button
          type="button"
          className={`${tabBtn} ${tab === "outward" ? tabActive : tabIdle}`}
          onClick={() => setTab("outward")}
        >
          Internal outward (HO to Store)
        </button>
      </div>

      {tab === "inward" ? (
        <>
          <Card
            title="Internal inward from store"
            subtitle="Pending store-to-HO internal transfers only — each line is one store batch"
          >
            <form onSubmit={(e) => void handleInward(e)} className="max-w-2xl space-y-4">
              <div>
                <label htmlFor="dc-pending" className="text-xs font-medium text-stone-600">
                  Select pending internal transfer
                </label>
                <select
                  id="dc-pending"
                  value={selectedDc}
                  onChange={(e) => setSelectedDc(e.target.value)}
                  className={selectClass}
                >
                  <option value="">— Choose a pending internal transfer —</option>
                  {pendingDcOptions.map((o) => (
                    <option key={o.dcNumber} value={o.dcNumber}>
                      {o.dcNumber} · HO: {o.hoLabel} · From store: {o.storeLabel} · {o.count} watch
                      {o.count === 1 ? "" : "es"}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-stone-500">
                  Stores create internal transfers from counter; this list is built from shipments in transit to{" "}
                  <strong>your</strong> regional HO. Other HOs and other stores stay isolated in their own data.
                </p>
              </div>
              <label className="text-sm">
                Scan DC barcode
                <input
                  className={selectClass}
                  placeholder="Scan DC and press Enter"
                  value={scanInwardDcInput}
                  onChange={(e) => setScanInwardDcInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    applyScannedInwardDc(scanInwardDcInput);
                    setScanInwardDcInput("");
                  }}
                />
              </label>
              <button
                type="submit"
                disabled={!canPostDcInward || !selectedDc || pendingDcOptions.length === 0}
                className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm inward
              </button>
              {!canPostDcInward ? (
                <p className="text-xs text-amber-800">You can view transit lists but cannot post inward for this HO.</p>
              ) : null}
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
            title={`Inward transit list (${inwardRows.length})`}
            subtitle="Listed format with filters; click any row for full details"
            className="mt-8"
          >
            {inTransit.length === 0 ? (
              <p className="text-sm text-stone-600">
                Nothing in transit for this regional HO. Each store dispatches separately; their open DCs will
                appear in the dropdown above.
              </p>
            ) : (
              <div>
                <div className="mb-3 grid gap-2 md:grid-cols-4">
                  <input
                    value={inwardQuery}
                    onChange={(e) => setInwardQuery(e.target.value)}
                    className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
                    placeholder="Search SRF/customer/phone/watch/DC/store"
                  />
                  <input
                    type="date"
                    value={inwardFromDate}
                    onChange={(e) => setInwardFromDate(e.target.value)}
                    className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
                  />
                  <input
                    type="date"
                    value={inwardToDate}
                    onChange={(e) => setInwardToDate(e.target.value)}
                    className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setInwardQuery("");
                      setInwardFromDate("");
                      setInwardToDate("");
                    }}
                    className="rounded-xl border border-zimson-300 px-3 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
                  >
                    Reset
                  </button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">DC</th>
                        <th className="px-3 py-2">SRF</th>
                        <th className="px-3 py-2">Customer</th>
                        <th className="px-3 py-2">Watch</th>
                        <th className="px-3 py-2">Store</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inwardRows.map((j) => {
                        const loc = storeById.get(j.storeId);
                        return (
                          <tr
                            key={j.id}
                            onClick={() => setSelectedJob(j)}
                            className="cursor-pointer border-b border-zimson-100 hover:bg-zimson-50/60 last:border-0"
                          >
                            <td className="px-3 py-2 text-xs text-stone-600">{new Date(j.createdAt).toLocaleString()}</td>
                            <td className="px-3 py-2 font-mono text-xs text-zimson-900">{j.dcNumber ?? "-"}</td>
                            <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{j.reference}</td>
                            <td className="px-3 py-2">{j.customerName}</td>
                            <td className="px-3 py-2">{j.watchBrand} {j.watchModel}</td>
                            <td className="px-3 py-2 text-xs text-stone-600">{loc?.storeName ?? j.storeId}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
          <Card
            title={`All internal inward list (${allDcRows.length})`}
            subtitle="Complete internal transfer visibility for this HO scope (pending + completed)"
            className="mt-8"
          >
            {allDcRows.length === 0 ? (
              <p className="text-sm text-stone-600">No internal inward records found.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">DC</th>
                      <th className="px-3 py-2">SRF</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Store</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allDcRows.map((j) => (
                      <tr
                        key={`all-dc-${j.id}`}
                        onClick={() => setSelectedJob(j)}
                        className="cursor-pointer border-b border-zimson-100 hover:bg-zimson-50/60 last:border-0"
                      >
                        <td className="px-3 py-2 text-xs text-stone-600">{new Date(j.createdAt).toLocaleString()}</td>
                        <td className="px-3 py-2 font-mono text-xs text-zimson-900">{j.dcNumber}</td>
                        <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{j.reference}</td>
                        <td className="px-3 py-2 text-xs text-stone-700">{j.status.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2">{j.customerName}</td>
                        <td className="px-3 py-2 text-xs text-stone-600">{storeById.get(j.storeId)?.storeName ?? j.storeId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          <Card
            title="Online spare ODC pending (sender HO)"
            subtitle="Cross-region HO-to-HO outward uses ODC terminology."
          >
            {onlineSpareRows.filter((o) => !o.dispatchedAt).length === 0 ? (
              <p className="text-sm text-stone-600">No online spare orders pending outward dispatch.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                    <tr>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">SRF</th>
                      <th className="px-3 py-2">Route</th>
                      <th className="px-3 py-2">Invoice</th>
                      <th className="px-3 py-2">Invoiced at</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {onlineSpareRows
                      .filter((o) => !o.dispatchedAt)
                      .map((o) => (
                        <tr key={o.id} className="border-b border-zimson-100 last:border-0">
                          <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{o.orderNumber}</td>
                          <td className="px-3 py-2 font-mono text-xs">{o.srfReference}</td>
                          <td className="px-3 py-2 text-xs">{o.fromRegionName} to {o.toRegionName}</td>
                          <td className="px-3 py-2 text-xs">{o.invoiceRef ?? "-"}</td>
                          <td className="px-3 py-2 text-xs">{o.fulfilledAt ? new Date(o.fulfilledAt).toLocaleString() : "-"}</td>
                          <td className="px-3 py-2">
                            <Link
                              to="/service-centre/online-store"
                              className="rounded-lg border border-zimson-300 bg-white px-3 py-1.5 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                            >
                              Open online store
                            </Link>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Create internal outward transfer" subtitle="After technician marks repair complete">
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
                <div className="mt-4 mb-3 grid gap-2 md:grid-cols-4">
                  <input
                    value={outwardQuery}
                    onChange={(e) => setOutwardQuery(e.target.value)}
                    className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
                    placeholder="Search SRF/customer/phone/watch/store"
                  />
                  <input
                    type="date"
                    value={outwardFromDate}
                    onChange={(e) => setOutwardFromDate(e.target.value)}
                    className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
                  />
                  <input
                    type="date"
                    value={outwardToDate}
                    onChange={(e) => setOutwardToDate(e.target.value)}
                    className="rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setOutwardQuery("");
                      setOutwardFromDate("");
                      setOutwardToDate("");
                    }}
                    className="rounded-xl border border-zimson-300 px-3 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
                  >
                    Reset
                  </button>
                </div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm text-stone-700">
                    <input
                      type="checkbox"
                      disabled={!canCreateOdc}
                      checked={outwardRows.length > 0 && outwardRows.every((j) => selectedOut[j.id])}
                      onChange={(e) => toggleAllOut(e.target.checked, outwardRows)}
                      className="rounded border-zimson-400 text-zimson-600 focus:ring-zimson-500"
                    />
                    Select all
                  </label>
                  <button
                    type="button"
                    disabled={!canCreateOdc}
                    onClick={() => void handleCreateOdc()}
                    className="rounded-xl bg-zimson-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Generate internal outward &amp; dispatch
                  </button>
                </div>
                <div className="mb-3 max-w-md">
                  <label className="text-sm">
                    Scan SRF barcode
                    <input
                      className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm"
                      placeholder="Scan SRF and press Enter"
                      value={scanOutwardSrfInput}
                      onChange={(e) => setScanOutwardSrfInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        applyScannedOutwardSrf(scanOutwardSrfInput);
                        setScanOutwardSrfInput("");
                      }}
                    />
                  </label>
                </div>
                <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                      <tr>
                        <th className="px-3 py-2 w-10" />
                        <th className="px-3 py-2">SRF</th>
                        <th className="px-3 py-2">Watch</th>
                        <th className="px-3 py-2 min-w-[220px]">Repair HO invoice</th>
                        <th className="px-3 py-2 min-w-[220px]">Destination store</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outwardRows.map((j) => (
                        <tr
                          key={j.id}
                          onClick={() => setSelectedJob(j)}
                          className="cursor-pointer border-b border-zimson-100 hover:bg-zimson-50/60 last:border-0"
                        >
                          <td className="px-3 py-2 align-top">
                            <input
                              type="checkbox"
                              disabled={!canCreateOdc}
                              checked={!!selectedOut[j.id]}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleOut(j.id);
                              }}
                              className="rounded border-zimson-400 text-zimson-600 focus:ring-zimson-500"
                            />
                          </td>
                          <td className="px-3 py-2 align-top font-mono font-semibold text-zimson-900">{j.reference}</td>
                          <td className="px-3 py-2 align-top text-stone-700">
                            {j.watchBrand} {j.watchModel}
                            <span className="mt-0.5 block text-xs text-stone-500">{j.customerName}</span>
                          </td>
                          <td className="px-3 py-2 align-top">
                            {!!j.transferTargetRegionId && !j.requiresLocalConversion ? (
                              j.hoSparesBillRef ? (
                                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                                  {j.hoSparesBillRef}
                                </p>
                              ) : (
                                <Link
                                  to={`/service-centre/online-store/invoice?srfId=${encodeURIComponent(j.id)}&invoiceFor=sender-ho`}
                                  className="inline-flex rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Create repair HO invoice
                                </Link>
                              )
                            ) : (
                              <span className="text-xs text-stone-500">Not required</span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <select
                              value={destinationFor(j.id, j.storeId)}
                              onChange={(e) =>
                                setDestByJob((prev) => ({ ...prev, [j.id]: e.target.value }))
                              }
                              onClick={(e) => e.stopPropagation()}
                              disabled={Boolean(j.transferTargetStoreId || j.transferSourceStoreId)}
                              className="w-full max-w-xs rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zimson-400/40"
                            >
                              {storeOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-stone-500">
                              {j.transferTargetStoreId
                                ? "Inter-HO transfer: destination is auto-fixed."
                                : "Originating store is pre-selected."}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
          <Card
            title={`All internal outward list (${allOdcRows.length})`}
            subtitle="Complete internal outward visibility for this HO scope (created + dispatched)"
            className="mt-8"
          >
            {allOdcRows.length === 0 ? (
              <p className="text-sm text-stone-600">No internal outward records found.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">ODC</th>
                      <th className="px-3 py-2">SRF</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Store</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allOdcRows.map((j) => (
                      <tr
                        key={`all-odc-${j.id}`}
                        onClick={() => setSelectedJob(j)}
                        className="cursor-pointer border-b border-zimson-100 hover:bg-zimson-50/60 last:border-0"
                      >
                        <td className="px-3 py-2 text-xs text-stone-600">{new Date(j.createdAt).toLocaleString()}</td>
                        <td className="px-3 py-2 font-mono text-xs text-zimson-900">{j.outwardDcNumber}</td>
                        <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{j.reference}</td>
                        <td className="px-3 py-2 text-xs text-stone-700">{j.status.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2">{j.customerName}</td>
                        <td className="px-3 py-2 text-xs text-stone-600">{storeById.get(j.storeId)?.storeName ?? j.storeId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      {selectedJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">SRF details - {selectedJob.reference}</h3>
                <p className="text-sm text-stone-600">{new Date(selectedJob.createdAt).toLocaleString()}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="rounded-lg border px-3 py-1.5 text-sm"
              >
                Close
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
              <table className="min-w-full text-left text-sm">
                <tbody>
                  <tr className="border-b border-zimson-100">
                    <th className="w-56 bg-zimson-50/70 px-3 py-2">Status</th>
                    <td className="px-3 py-2">{selectedJob.status.replace(/_/g, " ")}</td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Customer</th>
                    <td className="px-3 py-2">{selectedJob.customerName} ({selectedJob.phone})</td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Watch</th>
                    <td className="px-3 py-2">{selectedJob.watchBrand} {selectedJob.watchModel} · {selectedJob.serial}</td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">DC / ODC</th>
                    <td className="px-3 py-2">DC: {selectedJob.dcNumber ?? "-"} · ODC: {selectedJob.outwardDcNumber ?? "-"}</td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Region / Store</th>
                    <td className="px-3 py-2">
                      HO: {selectedJob.regionName ?? selectedJob.regionId} · Store: {storeById.get(selectedJob.storeId)?.storeName ?? selectedJob.storeId}
                    </td>
                  </tr>
                  <tr className="border-b border-zimson-100">
                    <th className="bg-zimson-50/70 px-3 py-2">Timeline</th>
                    <td className="px-3 py-2 text-xs text-stone-700">
                      Dispatched to SC: {selectedJob.dispatchedToScAt ? new Date(selectedJob.dispatchedToScAt).toLocaleString() : "-"}<br />
                      SC inward: {selectedJob.inwardAt ? new Date(selectedJob.inwardAt).toLocaleString() : "-"}<br />
                      Dispatched to store: {selectedJob.dispatchedToStoreAt ? new Date(selectedJob.dispatchedToStoreAt).toLocaleString() : "-"}<br />
                      Store inward: {selectedJob.receivedBackAtStoreAt ? new Date(selectedJob.receivedBackAtStoreAt).toLocaleString() : "-"}
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-zimson-50/70 px-3 py-2">Complaint</th>
                    <td className="px-3 py-2">{selectedJob.complaint || "-"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
