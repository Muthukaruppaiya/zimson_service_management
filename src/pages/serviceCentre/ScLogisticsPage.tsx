import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson } from "../../lib/api";
import { jobVisibleToServiceCentre } from "../../lib/srfAccess";
import type { SeedRegion } from "../../data/seed";
import type { SrfJob } from "../../types/srfJob";
import { printScInwardAckDocument, printTransferFromMeta, type TransferPrintMeta } from "../../lib/serviceDocuments";
import {
  resolveHoToHoPrint,
  resolveHoToStorePrint,
  resolveStoreToHoPrint,
  transferDocumentTitle,
} from "../../lib/transferDocumentKind";
import {
  scInwardAckSubtitle,
  scInwardAckTitle,
  scInwardDocumentKindFromJob,
  scInwardNumberLabel,
  scInwardReceiptPrintSubtitle,
  type ScInwardDocumentKind,
} from "../../lib/srfLogisticsDocs";
import type { TransferPartyBlock } from "../../lib/transferDocumentKind";

const selectClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm outline-none ring-zimson-400/40 focus:ring-2";

const tabBtn =
  "rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zimson-400";
const tabActive = "bg-zimson-600 text-white shadow-sm";
const tabIdle = "border border-zimson-300 bg-white text-zimson-900 hover:bg-zimson-50";

function inwardFromLocationName(kind: ScInwardDocumentKind, storeLabel: string): string {
  if (kind === "store_transfer") return storeLabel;
  if (kind === "inter_ho_return") return "Sender HO (return leg)";
  return "Other HO";
}

function buildScInwardPrintParties(
  ack: {
    documentKind: ScInwardDocumentKind;
    inwardNumber: string;
    jobs: SrfJob[];
  },
  regions: SeedRegion[],
  userRegionId: string | undefined,
): { partyFrom?: TransferPartyBlock; partyTo?: TransferPartyBlock } {
  const first = ack.jobs[0];
  if (!first) return {};
  if (ack.documentKind === "store_transfer") {
    const store = regions.flatMap((r) => r.stores).find((s) => s.id === first.storeId);
    const region = regions.find((r) => r.id === first.regionId);
    if (store && region) {
      const r = resolveStoreToHoPrint(store, region);
      return { partyFrom: r.from, partyTo: r.to };
    }
    return {};
  }
  if (ack.documentKind === "inter_ho_dc" || ack.documentKind === "inter_ho_return") {
    const fromRegionId =
      ack.documentKind === "inter_ho_return"
        ? (first.transferTargetRegionId ?? first.regionId)
        : (first.transferSourceRegionId ?? first.regionId);
    const toRegionId =
      ack.documentKind === "inter_ho_return"
        ? (first.transferSourceRegionId ?? userRegionId ?? first.regionId)
        : (userRegionId ?? first.regionId);
    const fromReg = fromRegionId ? regions.find((r) => r.id === fromRegionId) : undefined;
    const toReg = toRegionId ? regions.find((r) => r.id === toRegionId) : undefined;
    if (fromReg && toReg) {
      const r = resolveHoToHoPrint(
        fromReg,
        toReg,
        ack.documentKind === "inter_ho_return" ? "ho_to_ho_return" : "ho_to_ho_dispatch",
      );
      return { partyFrom: r.from, partyTo: r.to };
    }
  }
  return {};
}

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
      user.role === "service_centre_clerk" ||
      user.role === "super_admin" ||
      user.role === "admin" ||
      user.role === "admin" ||
      user.role === "ho_manager"
    );
  }, [user]);

  const canCreateOdc = useMemo(() => {
    if (!user) return false;
    return (
      user.role === "service_centre_clerk" ||
      user.role === "service_centre_clerk" ||
      user.role === "super_admin" ||
      user.role === "admin" ||
      user.role === "admin" ||
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

  const [selectedDc, setSelectedDc] = useState("");
  const [scanInwardDcInput, setScanInwardDcInput] = useState("");
  const [inwardMsg, setInwardMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [inwardAck, setInwardAck] = useState<{
    inwardNumber: string;
    documentKind: ScInwardDocumentKind;
    updated: number;
    hoLabel: string;
    storeLabel: string;
    jobs: SrfJob[];
    receivedAt: Date;
  } | null>(null);
  const [outwardAck, setOutwardAck] = useState<{
    odcNumber: string;
    documentKind: "DC" | "ODC" | "TD";
    watchCount: number;
    fromLocation: string;
    toLocation: string;
    fromHo: string;
    toHo: string;
    dispatchedAt: Date;
    rows: SrfJob[];
    printMeta: TransferPrintMeta;
    printOpts: {
      fromLocation: string;
      toLocation: string;
      fromHo: string;
      toHo: string;
      hoInvoiceRef?: string;
      storeInvoiceRef?: string;
    };
  } | null>(null);

  const [selectedOut, setSelectedOut] = useState<Record<string, boolean>>({});
  const [scanOutwardSrfInput, setScanOutwardSrfInput] = useState("");
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
      const documentKind = scInwardDocumentKindFromJob(first);
      return {
        dcNumber,
        count: list.length,
        hoLabel: loc?.regionName ?? first.regionId,
        storeLabel: loc?.storeName ?? first.storeId,
        documentKind,
        typeLabel: scInwardNumberLabel(documentKind),
      };
    });
    return rows.sort((a, b) => a.dcNumber.localeCompare(b.dcNumber));
  }, [inTransit, storeById]);

  useEffect(() => {
    if (selectedDc && !pendingDcOptions.some((o) => o.dcNumber === selectedDc)) {
      setSelectedDc("");
    }
  }, [pendingDcOptions, selectedDc]);

  const readyOutward = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => j.status === "ready_for_outward" && jobVisibleToServiceCentre(j, user));
  }, [jobs, user]);

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
    const dcNumber = selectedDc.trim();
    if (!dcNumber) {
      setInwardMsg({ type: "err", text: "Choose a pending DC from the list for this HO." });
      return;
    }
    const dcMeta = pendingDcOptions.find((o) => o.dcNumber === dcNumber);
    const jobsOnDc = inTransit.filter((j) => j.dcNumber === dcNumber);
    try {
      const result = await confirmInwardByDc(dcNumber);
      const receivedAt = new Date();
      const documentKind =
        result.documentKind ??
        (jobsOnDc[0] ? scInwardDocumentKindFromJob(jobsOnDc[0]) : "store_transfer");
      const numberLabel = scInwardNumberLabel(documentKind);
      setInwardAck({
        inwardNumber: result.dcNumber ?? dcNumber,
        documentKind,
        updated: result.updated,
        hoLabel: dcMeta?.hoLabel ?? user?.regionId ?? "—",
        storeLabel: dcMeta?.storeLabel ?? "—",
        jobs: jobsOnDc,
        receivedAt,
      });
      setInwardMsg({
        type: "ok",
        text: `Inward recorded for ${result.updated} watch(es). ${numberLabel}: ${result.dcNumber ?? dcNumber}.`,
      });
      setSelectedDc("");
    } catch (err) {
      setInwardMsg({ type: "err", text: err instanceof Error ? err.message : "Could not inward DC." });
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
    // For inter-HO returned SRFs (transferSourceReference set) the true booking store always
    // lives on the ORIGINAL parent SRF. Look the parent up so legacy child SRFs (where the
    // child's own destinationStoreId got corrupted by the old convert-local bug) still show
    // and dispatch to the correct customer-collection store. The backend applies the same
    // parent-recovery so the actual ODC always lands at the right destination.
    if (j?.transferSourceReference) {
      const parent = jobs.find((p) => p.id !== j.id && p.reference === j.transferSourceReference && !!p.destinationStoreId);
      if (parent?.destinationStoreId) {
        return parent.destinationStoreId;
      }
    }
    return j?.destinationStoreId || originatingStoreId;
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
      // For inter-HO return rows, the backend restores the root parent SRF reference
      // (transfer_source_reference) in the same transaction. The local jobs state is the
      // pre-update snapshot, so override `reference` on the rows we print so the ODC document
      // shows the root parent SRF number instead of the child SRF reference.
      const rows = jobs
        .filter((j) => ids.includes(j.id))
        .map((j) => {
          const isReturnLeg =
            !j.requiresLocalConversion && (!!j.transferSourceRegionId || !!j.transferTargetRegionId);
          if (isReturnLeg && j.transferSourceReference) {
            return { ...j, reference: j.transferSourceReference };
          }
          return j;
        });
      const first = rows[0];
      const regionNameById = new Map<string, string>(regions.map((r) => [r.id, r.name]));
      const destLabels = Array.from(new Set(items.map((it) => it.destinationStoreId)))
        .map((sid) => {
          const loc = storeById.get(sid);
          const transferJob = jobs.find(x => items.some(it => it.jobId === x.id) && x.destinationStoreId === sid && (
             (x.requiresLocalConversion && x.transferTargetRegionId) ||
             (!x.requiresLocalConversion && x.transferSourceRegionId)
          ));
          if (transferJob) {
             const targetRegId = transferJob.requiresLocalConversion ? transferJob.transferTargetRegionId : transferJob.transferSourceRegionId;
             const reg = regions.find(r => r.id === targetRegId);
             return `HO: ${reg?.name ?? targetRegId}`;
          }
          return loc ? `Store: ${loc.storeName} (HO: ${loc.regionName})` : `Store: ${sid}`;
        });
      const toLocation = destLabels.length === 1 ? destLabels[0] : `Multiple stores (${destLabels.length})`;
      const fromHo = first?.regionName ?? (first?.regionId ? regionNameById.get(first.regionId) ?? first.regionId : "-");
      const toHo =
        hasReturnToSender && first?.transferSourceRegionId
          ? regionNameById.get(first.transferSourceRegionId) ?? first.transferSourceRegionId
          : fromHo;
      const printOpts = {
        fromLocation: `HO / Service Centre: ${fromHo}`,
        toLocation,
        fromHo,
        toHo,
        hoInvoiceRef: hasReturnToSender ? (selectedRows[0]?.hoSparesBillRef ?? undefined) : undefined,
        storeInvoiceRef: undefined,
      };
      const docKind = result.documentKind ?? (hasReturnToSender || selectedRows.some((j) => j.requiresLocalConversion && j.transferTargetRegionId) ? "DC" : "TD");
      const destStoreId = items[0]?.destinationStoreId ?? first?.destinationStoreId ?? "";
      const fromRegion = regions.find((r) => r.id === (first?.regionId ?? user?.regionId));
      const destStore = regions.flatMap((r) => r.stores).find((s) => s.id === destStoreId);
      const destRegion = regions.find((r) => r.stores.some((s) => s.id === destStoreId));
      const toRegionId =
        hasReturnToSender && first?.transferSourceRegionId
          ? first.transferSourceRegionId
          : first?.transferTargetRegionId ?? first?.regionId;
      const toRegion = toRegionId ? regions.find((r) => r.id === toRegionId) : undefined;
      const fallbackMeta = (() => {
        if (!fromRegion) return null;
        if ((hasReturnToSender || first?.requiresLocalConversion) && toRegion) {
          const r = resolveHoToHoPrint(
            fromRegion,
            toRegion,
            hasReturnToSender ? "ho_to_ho_return" : "ho_to_ho_dispatch",
          );
          return {
            printKind: r.printKind,
            flow: r.flow,
            transferNumber: result.odcNumber,
            from: r.from,
            to: r.to,
          } satisfies TransferPrintMeta;
        }
        if (destStore) {
          const r = resolveHoToStorePrint(fromRegion, destStore, destRegion);
          return {
            printKind: r.printKind,
            flow: "ho_to_store" as const,
            transferNumber: result.odcNumber,
            from: r.from,
            to: r.to,
          } satisfies TransferPrintMeta;
        }
        return null;
      })();
      const printMeta =
        result.printMeta ??
        fallbackMeta ?? {
          printKind: "dc" as const,
          flow: (hasReturnToSender ? "ho_to_ho_return" : "ho_to_store") as TransferPrintMeta["flow"],
          transferNumber: result.odcNumber,
          from: {
            locationLabel: printOpts.fromLocation,
            legalName: fromHo,
            address: "—",
            phone: "—",
            email: "—",
            gstin: "—",
          },
          to: {
            locationLabel: toLocation,
            legalName: toHo,
            address: "—",
            phone: "—",
            email: "—",
            gstin: "—",
          },
        };
      setOutwardAck({
        odcNumber: result.odcNumber,
        documentKind: docKind,
        watchCount: rows.length,
        fromLocation: printOpts.fromLocation,
        toLocation,
        fromHo,
        toHo,
        dispatchedAt: new Date(),
        rows,
        printMeta,
        printOpts,
      });
      setOutwardMsg({
        type: "ok",
        text:
          printMeta.flow === "ho_to_store"
            ? `Internal transfer ${result.odcNumber} created (HO → store). Print when ready.`
            : printMeta.printKind === "dc"
              ? `Delivery Challan ${result.odcNumber} created (${transferDocumentTitle(printMeta.printKind, printMeta.flow)}). Print when ready.`
              : `Internal transfer ${result.odcNumber} created. Print when ready.`,
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
        description=""
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/service-centre/logistics-history"
              className="inline-flex rounded-xl border border-zimson-300 bg-zimson-50 px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-100"
            >
              DC / ODC history
            </Link>
            <Link
              to="/service-centre"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Service centre home
            </Link>
          </div>
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
                      {o.dcNumber} · {o.typeLabel} · HO: {o.hoLabel}
                      {o.documentKind === "store_transfer" ? ` · From store: ${o.storeLabel}` : ""} · {o.count} watch
                      {o.count === 1 ? "" : "es"}
                    </option>
                  ))}
                </select>
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

        </>
      ) : (
        <>
          <Card
            title="Online spare ODC pending (sender HO)"
          >
            {onlineSpareRows.filter((o) => !o.dispatchedAt).length === 0 ? (
              <p className="text-sm text-stone-600">No pending records.</p>
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
          <Card title="Create internal outward transfer">
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
                          <td className="px-3 py-2 align-top font-mono font-semibold text-zimson-900">
                            {j.reference}
                            {j.transferSourceReference && j.transferSourceReference !== j.reference ? (
                              <span className="mt-0.5 block text-[10px] font-normal text-stone-500">
                                Root: <span className="font-mono">{j.transferSourceReference}</span>
                              </span>
                            ) : null}
                          </td>
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
                                <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">
                                  Pending supervisor invoice
                                </p>
                              )
                            ) : (
                              <span className="text-xs text-stone-500">Not required</span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <p className="rounded-lg border border-zimson-200 bg-zimson-50 px-2 py-1 text-xs font-semibold text-zimson-900">
                              {(() => {
                                const destId = destinationFor(j.id, j.storeId);
                                if (j.requiresLocalConversion && j.transferTargetRegionId) {
                                  const reg = regions.find(r => r.id === j.transferTargetRegionId);
                                  const finalStore = storeById.get(destId);
                                  const finalLabel = finalStore
                                    ? `Store: ${finalStore.storeName} (HO: ${finalStore.regionName})`
                                    : `Store: ${destId}`;
                                  return (
                                    <>
                                      <span>Next: HO: {reg?.name ?? j.transferTargetRegionId}</span>
                                      <span className="mt-0.5 block text-[10px] font-normal text-stone-500">Final: {finalLabel}</span>
                                    </>
                                  );
                                }
                                if (!j.requiresLocalConversion && j.transferSourceRegionId) {
                                  const reg = regions.find(r => r.id === j.transferSourceRegionId);
                                  const finalStore = storeById.get(destId);
                                  const finalLabel = finalStore
                                    ? `Store: ${finalStore.storeName} (HO: ${finalStore.regionName})`
                                    : `Store: ${destId}`;
                                  return (
                                    <>
                                      <span>Next: HO: {reg?.name ?? j.transferSourceRegionId}</span>
                                      <span className="mt-0.5 block text-[10px] font-normal text-stone-500">Final: {finalLabel}</span>
                                    </>
                                  );
                                }
                                const loc = storeById.get(destId);
                                return (loc?.regionName ? `HO: ${loc.regionName} · ` : "") + `Store: ${loc?.storeName ?? destId}`;
                              })()}
                            </p>
                            {j.requiresLocalConversion && (
                              <p className="mt-1 text-[10px] text-stone-500">
                                Original Store: {storeById.get(j.storeId)?.storeName ?? j.storeId}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-stone-500">
                              {j.transferTargetStoreId
                                ? "Inter-HO transfer: destination is auto-fixed."
                                : "Set at SRF booking (same-region store)."}
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

      {outwardAck ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
          <div
            className={`w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ${
              outwardAck.documentKind === "DC" ? "ring-emerald-200" : "ring-indigo-200"
            }`}
            role="dialog"
            aria-labelledby="outward-ack-title"
          >
            <div
              className={`bg-gradient-to-br px-5 py-5 text-white ${
                outwardAck.documentKind === "DC" ? "from-emerald-600 to-emerald-700" : "from-indigo-600 to-indigo-700"
              }`}
            >
              <p
                className={`text-[11px] font-bold uppercase tracking-widest ${
                  outwardAck.documentKind === "DC" ? "text-emerald-100" : "text-indigo-100"
                }`}
              >
                {outwardAck.documentKind === "DC" ? "Inter-HO dispatch confirmed" : "Internal transfer confirmed"}
              </p>
              <h2 id="outward-ack-title" className="mt-1 text-xl font-bold">
                {outwardAck.documentKind === "DC" ? "HO → HO delivery challan (DC)" : "HO → store transfer (TD)"}
              </h2>
            </div>
            <div className="px-5 py-5">
              <p className="text-sm text-stone-600">
                {outwardAck.documentKind === "DC" ? (
                  <>
                    <strong>{outwardAck.watchCount}</strong> watch{outwardAck.watchCount === 1 ? "" : "es"} on inter-HO DC.
                    Receiving HO will inward this batch from their pending list.
                  </>
                ) : (
                  <>
                    <strong>{outwardAck.watchCount}</strong> watch{outwardAck.watchCount === 1 ? "" : "es"} on transfer document (TD).
                    Store can inward when the batch arrives.
                  </>
                )}
              </p>
              <div
                className={`mt-4 rounded-xl border-2 px-4 py-3 text-center ${
                  outwardAck.documentKind === "DC"
                    ? "border-emerald-200 bg-emerald-50/80"
                    : "border-indigo-200 bg-indigo-50/80"
                }`}
              >
                <p
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    outwardAck.documentKind === "DC" ? "text-emerald-800" : "text-indigo-800"
                  }`}
                >
                  {outwardAck.documentKind === "DC" ? "DC number" : "Transfer number (TD)"}
                </p>
                <p
                  className={`mt-1 font-mono text-2xl font-bold ${
                    outwardAck.documentKind === "DC" ? "text-emerald-900" : "text-indigo-900"
                  }`}
                >
                  {outwardAck.odcNumber}
                </p>
              </div>
              <dl className="mt-4 space-y-1.5 text-sm text-stone-700">
                <div className="flex justify-between gap-2">
                  <dt className="text-stone-500">From</dt>
                  <dd className="max-w-[60%] text-right font-medium text-stone-900">{outwardAck.fromLocation}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-stone-500">To</dt>
                  <dd className="max-w-[60%] text-right font-medium text-stone-900">{outwardAck.toLocation}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-stone-500">Dispatched at</dt>
                  <dd className="font-medium text-stone-900">{outwardAck.dispatchedAt.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-stone-500">Dispatched by</dt>
                  <dd className="font-medium text-stone-900">{user?.displayName ?? "—"}</dd>
                </div>
              </dl>
              {outwardAck.rows.length > 0 ? (
                <div className="mt-4 max-h-32 overflow-y-auto rounded-lg border border-zimson-200 text-xs">
                  <table className="min-w-full">
                    <thead className="sticky top-0 bg-zimson-50 text-left font-semibold text-stone-600">
                      <tr>
                        <th className="px-2 py-1">SRF</th>
                        <th className="px-2 py-1">Watch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outwardAck.rows.map((j) => (
                        <tr key={j.id} className="border-t border-zimson-100">
                          <td className="px-2 py-1 font-mono font-semibold">{j.reference}</td>
                          <td className="px-2 py-1">
                            {j.watchBrand} {j.watchModel}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() =>
                    printTransferFromMeta(outwardAck.printMeta, outwardAck.rows, {
                      seriesCode: outwardAck.documentKind === "DC" ? "DC" : "TD",
                      hoInvoiceRef: outwardAck.printOpts.hoInvoiceRef,
                      storeInvoiceRef: outwardAck.printOpts.storeInvoiceRef,
                      preparedBy: user?.displayName?.trim() || user?.email?.trim(),
                      transferDate: outwardAck.dispatchedAt,
                    })
                  }
                  className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                    outwardAck.printMeta.printKind === "dc"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                      : "border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
                  }`}
                >
                  Print {outwardAck.documentKind === "DC" ? "DC" : "TD"} copy
                </button>
                <button
                  type="button"
                  onClick={() => setOutwardAck(null)}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${
                    outwardAck.documentKind === "DC"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {inwardAck ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-emerald-200"
            role="dialog"
            aria-labelledby="inward-ack-title"
          >
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 px-5 py-5 text-white">
              <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-100">Inward confirmed</p>
              <h2 id="inward-ack-title" className="mt-1 text-xl font-bold">
                {scInwardAckTitle(inwardAck.documentKind)}
              </h2>
            </div>
            <div className="px-5 py-5">
              <p className="text-sm text-stone-600">{scInwardAckSubtitle(inwardAck.documentKind, inwardAck.updated)}</p>
              <div className="mt-4 rounded-xl border-2 border-emerald-200 bg-emerald-50/80 px-4 py-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  {scInwardNumberLabel(inwardAck.documentKind)}
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-emerald-900">{inwardAck.inwardNumber}</p>
              </div>
              <dl className="mt-4 space-y-1.5 text-sm text-stone-700">
                <div className="flex justify-between gap-2">
                  <dt className="text-stone-500">Service centre</dt>
                  <dd className="font-medium text-stone-900">{inwardAck.hoLabel}</dd>
                </div>
                {inwardAck.documentKind === "store_transfer" ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-stone-500">From store</dt>
                    <dd className="font-medium text-stone-900">{inwardAck.storeLabel}</dd>
                  </div>
                ) : (
                  <div className="flex justify-between gap-2">
                    <dt className="text-stone-500">Route</dt>
                    <dd className="max-w-[60%] text-right font-medium text-stone-900">
                      {inwardAck.documentKind === "inter_ho_return"
                        ? "Repair HO → sender HO (return DC)"
                        : "Other HO → this service centre"}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-stone-500">Received at</dt>
                  <dd className="font-medium text-stone-900">{inwardAck.receivedAt.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-stone-500">Received by</dt>
                  <dd className="font-medium text-stone-900">{user?.displayName ?? "—"}</dd>
                </div>
              </dl>
              {inwardAck.jobs.length > 0 ? (
                <div className="mt-4 max-h-32 overflow-y-auto rounded-lg border border-zimson-200 text-xs">
                  <table className="min-w-full">
                    <thead className="sticky top-0 bg-zimson-50 text-left font-semibold text-stone-600">
                      <tr>
                        <th className="px-2 py-1">SRF</th>
                        <th className="px-2 py-1">Watch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inwardAck.jobs.map((j) => (
                        <tr key={j.id} className="border-t border-zimson-100">
                          <td className="px-2 py-1 font-mono font-semibold">{j.reference}</td>
                          <td className="px-2 py-1">
                            {j.watchBrand} {j.watchModel}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const parties = buildScInwardPrintParties(inwardAck, regions, user?.regionId);
                    printScInwardAckDocument({
                      inwardNumber: inwardAck.inwardNumber,
                      numberLabel: scInwardNumberLabel(inwardAck.documentKind),
                      documentTitle: "SRF Inward Acknowledgment",
                      documentSubtitle: scInwardReceiptPrintSubtitle(inwardAck.documentKind),
                      receivedAtLocation: inwardAck.hoLabel,
                      fromLocationLabel:
                        inwardAck.documentKind === "store_transfer" ? "Received from (store)" : "Received from",
                      fromLocationName: inwardFromLocationName(inwardAck.documentKind, inwardAck.storeLabel),
                      receivedBy: user?.displayName?.trim() || user?.email?.trim() || "Service centre",
                      receivedAt: inwardAck.receivedAt,
                      jobs: inwardAck.jobs,
                      transferSeries: inwardAck.documentKind === "store_transfer" ? "TD" : "DC",
                      partyFrom: parties.partyFrom,
                      partyTo: parties.partyTo,
                    });
                  }}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Print inward receipt
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const first = inwardAck.jobs[0];
                    if (inwardAck.documentKind === "store_transfer" && first) {
                      const store = regions.flatMap((r) => r.stores).find((s) => s.id === first.storeId);
                      const region = regions.find((r) => r.id === first.regionId);
                      if (store && region) {
                        const r = resolveStoreToHoPrint(store, region);
                        printTransferFromMeta(
                          {
                            printKind: r.printKind,
                            flow: "store_to_ho",
                            transferNumber: inwardAck.inwardNumber,
                            from: r.from,
                            to: r.to,
                          },
                          inwardAck.jobs,
                          {
                            seriesCode: "TD",
                            preparedBy: user?.displayName?.trim() || user?.email?.trim(),
                            transferDate: inwardAck.receivedAt,
                          },
                        );
                        return;
                      }
                    }
                    if (
                      (inwardAck.documentKind === "inter_ho_dc" || inwardAck.documentKind === "inter_ho_return") &&
                      first
                    ) {
                      const parties = buildScInwardPrintParties(inwardAck, regions, user?.regionId);
                      if (parties.partyFrom && parties.partyTo) {
                        const flow =
                          inwardAck.documentKind === "inter_ho_return" ? "ho_to_ho_return" : "ho_to_ho_dispatch";
                        printTransferFromMeta(
                          {
                            printKind: "dc",
                            flow,
                            transferNumber: inwardAck.inwardNumber,
                            from: parties.partyFrom,
                            to: parties.partyTo,
                          },
                          inwardAck.jobs,
                          {
                            seriesCode: "DC",
                            preparedBy: user?.displayName?.trim() || user?.email?.trim(),
                            transferDate: inwardAck.receivedAt,
                          },
                        );
                      }
                    }
                  }}
                  className="flex-1 rounded-xl border border-zimson-300 bg-zimson-50 px-4 py-2.5 text-sm font-semibold text-zimson-900 hover:bg-zimson-100"
                >
                  Print transfer / DC copy
                </button>
                <button
                  type="button"
                  onClick={() => setInwardAck(null)}
                  className="flex-1 rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
