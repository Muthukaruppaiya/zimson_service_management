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
  scInwardAckTitle,
  scInwardDocumentKindFromJob,
  scInwardNumberLabel,
  scInwardReceiptPrintSubtitle,
  type ScInwardDocumentKind,
} from "../../lib/srfLogisticsDocs";
import { formatEwayEdocMessage, challanCanCreateOrRetryEway, type EdocUiResult } from "../../lib/edocResultMessage";
import { transferFlowNeedsEway } from "../../lib/ewayBill";
import { EwayBillModal } from "../../components/service/EwayBillModal";
import { ProcessSuccessModal } from "../../components/ui/ProcessSuccessModal";
import { useMessageAlert } from "../../hooks/useMessageAlert";

const selectClass =
  "mt-1 w-full rounded-xl border border-rlx-rule bg-white px-3 py-2.5 text-sm outline-none focus:border-rlx-green focus:ring-2 focus:ring-rlx-green/30";

const tabBtn =
  "rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rlx-green";
const tabActive = "bg-rlx-green text-white shadow-sm";
const tabIdle = "border border-rlx-gold bg-white text-rlx-green hover:bg-rlx-green-light";

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
  const { jobs, confirmInwardByDc, createOutwardBatch, clerkLogBrandDispatchBatch } = useSrfJobs();
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
  const [inwardReviewOpen, setInwardReviewOpen] = useState(false);
  const [inwardReviewDc, setInwardReviewDc] = useState("");
  const [inwardAccepted, setInwardAccepted] = useState<Record<string, boolean>>({});
  const [inwardSaving, setInwardSaving] = useState(false);
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
    dcId?: string;
    documentKind: "DC" | "ODC" | "TD";
    watchCount: number;
    fromLocation: string;
    toLocation: string;
    fromHo: string;
    toHo: string;
    dispatchedAt: Date;
    rows: SrfJob[];
    printMeta: TransferPrintMeta;
    edoc?: EdocUiResult | null;
    printOpts: {
      fromLocation: string;
      toLocation: string;
      fromHo: string;
      toHo: string;
      hoInvoiceRef?: string;
      storeInvoiceRef?: string;
    };
  } | null>(null);

  const [ewayModalOpen, setEwayModalOpen] = useState(false);
  const [edocEnabled, setEdocEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiJson<{ enabled?: boolean }>("/api/edoc/status")
      .then((d) => {
        if (!cancelled) setEdocEnabled(Boolean(d.enabled));
      })
      .catch(() => {
        if (!cancelled) setEdocEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [selectedOut, setSelectedOut] = useState<Record<string, boolean>>({});
  const [scanOutwardSrfInput, setScanOutwardSrfInput] = useState("");
  const [selectedBrandOut, setSelectedBrandOut] = useState<Record<string, boolean>>({});
  const [brandDispatchPopupOpen, setBrandDispatchPopupOpen] = useState(false);
  const [brandDispatchRefInput, setBrandDispatchRefInput] = useState("");
  const [brandDispatchNoteInput, setBrandDispatchNoteInput] = useState("");
  const [brandDispatchSaving, setBrandDispatchSaving] = useState(false);
  const [brandDispatchSuccess, setBrandDispatchSuccess] = useState<{
    count: number;
    ref: string;
    note: string;
  } | null>(null);
  const { showError, alertModal } = useMessageAlert();
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

  function watchesOnTransfer(dcNumber: string): SrfJob[] {
    if (!dcNumber.trim()) return [];
    return inTransit.filter((j) => j.dcNumber === dcNumber);
  }

  const inwardReviewRows = useMemo(
    () => watchesOnTransfer(inwardReviewDc),
    [inwardReviewDc, inTransit],
  );

  function openInwardReview(dcNumber: string) {
    const rows = watchesOnTransfer(dcNumber);
    if (rows.length === 0) {
      setInwardMsg({ type: "err", text: `No watches pending on transfer ${dcNumber}.` });
      return;
    }
    setInwardMsg(null);
    setSelectedDc(dcNumber);
    setInwardReviewDc(dcNumber);
    setInwardAccepted(Object.fromEntries(rows.map((r) => [r.id, true])));
    setInwardReviewOpen(true);
  }

  function closeInwardReview() {
    setInwardReviewOpen(false);
    setInwardReviewDc("");
    setInwardAccepted({});
    setInwardSaving(false);
  }

  const brandOutwardQueue = useMemo(() => {
    if (!user) return [];
    return jobs.filter(
      (j) => j.status === "brand_outward_pending" && jobVisibleToServiceCentre(j, user),
    );
  }, [jobs, user]);

  const selectedBrandJobIds = useMemo(
    () => brandOutwardQueue.filter((j) => selectedBrandOut[j.id]).map((j) => j.id),
    [brandOutwardQueue, selectedBrandOut],
  );

  function toggleBrand(id: string) {
    setSelectedBrandOut((s) => ({ ...s, [id]: !s[id] }));
  }

  function toggleAllBrand(checked: boolean) {
    const next: Record<string, boolean> = {};
    if (checked) brandOutwardQueue.forEach((j) => (next[j.id] = true));
    setSelectedBrandOut(next);
  }

  function openBrandDispatchPopup(jobIds?: string[]) {
    if (jobIds?.length) {
      setSelectedBrandOut(Object.fromEntries(jobIds.map((id) => [id, true])));
    }
    setBrandDispatchRefInput("");
    setBrandDispatchNoteInput("");
    setBrandDispatchPopupOpen(true);
  }

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

  async function confirmInwardSelected() {
    if (!canPostDcInward || !inwardReviewDc.trim() || inwardSaving) return;
    const dcNumber = inwardReviewDc.trim();
    const selectedIds = inwardReviewRows.filter((j) => inwardAccepted[j.id]).map((j) => j.id);
    if (selectedIds.length === 0) {
      setInwardMsg({ type: "err", text: "Tick at least one watch in working condition to inward." });
      return;
    }
    setInwardSaving(true);
    setInwardMsg(null);
    const dcMeta = pendingDcOptions.find((o) => o.dcNumber === dcNumber);
    try {
      const result = await confirmInwardByDc(dcNumber, selectedIds);
      const receivedAt = new Date();
      const inwardedJobs = inwardReviewRows.filter((j) => selectedIds.includes(j.id));
      const documentKind =
        result.documentKind ??
        (inwardedJobs[0] ? scInwardDocumentKindFromJob(inwardedJobs[0]) : "store_transfer");
      const numberLabel = scInwardNumberLabel(documentKind);
      closeInwardReview();
      setSelectedDc("");
      setInwardAck({
        inwardNumber: result.dcNumber ?? dcNumber,
        documentKind,
        updated: result.updated,
        hoLabel: dcMeta?.hoLabel ?? user?.regionId ?? "—",
        storeLabel: dcMeta?.storeLabel ?? "—",
        jobs: inwardedJobs,
        receivedAt,
      });
      const skipped = inwardReviewRows.length - selectedIds.length;
      let okText = `Inward recorded for ${result.updated} watch(es). ${numberLabel}: ${result.dcNumber ?? dcNumber}.`;
      if (skipped > 0) {
        okText += ` ${skipped} not accepted — still on transfer (return to store flow coming next).`;
      } else if ((result.pendingOnTransfer ?? 0) > 0) {
        okText += ` ${result.pendingOnTransfer} still pending on this transfer.`;
      }
      setInwardMsg({ type: "ok", text: okText });
    } catch (err) {
      setInwardMsg({ type: "err", text: err instanceof Error ? err.message : "Could not inward DC." });
    } finally {
      setInwardSaving(false);
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
    setInwardMsg({ type: "ok", text: `Transfer ${hit.dcNumber} selected from barcode scan.` });
    openInwardReview(hit.dcNumber);
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
    const hasReturnToSender = selectedRows.some(
      (j) => !j.requiresLocalConversion && !!j.transferSourceRegionId,
    );
    const missingRepairInvoiceRefs = selectedRows.filter(
      (j) =>
        !j.requiresLocalConversion &&
        !!j.transferSourceRegionId &&
        !j.interHoReturnWithoutRepair &&
        !(j.hoSparesBillRef ?? "").trim(),
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
        dcId: result.dcId,
        documentKind: docKind,
        watchCount: rows.length,
        fromLocation: printOpts.fromLocation,
        toLocation,
        fromHo,
        toHo,
        dispatchedAt: new Date(),
        rows,
        printMeta,
        edoc: result.edoc ?? null,
        printOpts,
      });
      if (
        challanCanCreateOrRetryEway({
          flow: printMeta.flow,
          edocEnabled,
          ewayBillNo: result.edoc?.ewayBillNo,
          edocStatus: result.edoc?.ok ? "SUCCESS" : result.edoc?.skipped ? "SKIPPED" : result.edoc ? "FAILED" : null,
          edocError: result.edoc?.error,
          skipped: result.edoc?.skipped,
          skipReason: result.edoc?.skipReason,
        }) &&
        result.dcId
      ) {
        setEwayModalOpen(true);
      }
      const ewayNote = formatEwayEdocMessage(result.edoc);
      setOutwardMsg({
        type: "ok",
        text: [
          printMeta.flow === "ho_to_store"
            ? `Internal transfer ${result.odcNumber} created (HO → store). Print when ready.`
            : printMeta.printKind === "dc"
              ? `Delivery Challan ${result.odcNumber} created (${transferDocumentTitle(printMeta.printKind, printMeta.flow)}). Print when ready.`
              : `Internal transfer ${result.odcNumber} created. Print when ready.`,
          ewayNote,
        ]
          .filter(Boolean)
          .join(" "),
      });
      setSelectedOut({});
    } catch (e) {
      setOutwardMsg({ type: "err", text: e instanceof Error ? e.message : "Could not create internal outward transfer." });
    }
  }

  async function regenerateOutwardEway() {
    if (!outwardAck?.dcId) return;
    setEwayModalOpen(true);
  }

  function onOutwardEwaySuccess(edoc: EdocUiResult) {
    setOutwardAck((prev) => (prev ? { ...prev, edoc } : prev));
    const msg = formatEwayEdocMessage(edoc);
    setOutwardMsg({ type: edoc?.ok ? "ok" : "err", text: msg ?? "Could not generate e-way bill." });
  }

  if (user && !canPostDcInward && !canCreateOdc) {
    return (
      <div>
        <PageHeader
          title="Service centre logistics"
          description=""
          actions={
            <Link
              to="/service-centre"
              className="inline-flex rounded-xl border border-rlx-gold bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green shadow-sm transition hover:bg-rlx-green-light"
            >
              Service centre home
            </Link>
          }
        />
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
              className="inline-flex rounded-xl border border-rlx-gold bg-rlx-green-light px-4 py-2.5 text-sm font-semibold text-rlx-green shadow-sm transition hover:bg-rlx-green-light"
            >
              DC / ODC history
            </Link>
            <Link
              to="/service-centre"
              className="inline-flex rounded-xl border border-rlx-gold bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green shadow-sm transition hover:bg-rlx-green-light"
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (selectedDc) openInwardReview(selectedDc);
              }}
              className="max-w-2xl space-y-4"
            >
              <div>
                <label htmlFor="dc-pending" className="text-xs font-medium text-stone-600">
                  Select pending internal transfer
                </label>
                <select
                  id="dc-pending"
                  value={selectedDc}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSelectedDc(next);
                    if (next) openInwardReview(next);
                  }}
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
                className="rounded-xl bg-rlx-green px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rlx-green-deep disabled:cursor-not-allowed disabled:opacity-50"
              >
                Review watches &amp; inward
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

          {inwardReviewOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
                <h3 className="text-lg font-semibold text-rlx-green">Inward watches — {inwardReviewDc}</h3>
                <div className="mt-4 overflow-x-auto rounded-xl border border-rlx-rule">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="bg-rlx-green-light text-xs uppercase tracking-wide text-stone-600">
                        <th className="px-3 py-2">OK</th>
                        <th className="px-3 py-2">SRF</th>
                        <th className="px-3 py-2">Customer</th>
                        <th className="px-3 py-2">Watch</th>
                        <th className="px-3 py-2">From store</th>
                        <th className="px-3 py-2">Estimate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inwardReviewRows.map((j) => {
                        const loc = storeById.get(j.storeId);
                        return (
                          <tr key={j.id} className="border-t border-rlx-rule">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={Boolean(inwardAccepted[j.id])}
                                disabled={inwardSaving}
                                onChange={(e) =>
                                  setInwardAccepted((prev) => ({ ...prev, [j.id]: e.target.checked }))
                                }
                                aria-label={`Accept ${j.reference} in working condition`}
                                className="h-4 w-4 rounded border-rlx-gold"
                              />
                            </td>
                            <td className="px-3 py-2 font-mono text-xs font-semibold text-rlx-green">{j.reference}</td>
                            <td className="px-3 py-2 text-stone-800">
                              {j.customerName}
                              <span className="block text-xs text-stone-500">{j.phone}</span>
                            </td>
                            <td className="px-3 py-2 text-stone-700">
                              {j.watchBrand} {j.watchModel}
                            </td>
                            <td className="px-3 py-2 text-stone-700">{loc?.storeName ?? j.storeId}</td>
                            <td className="px-3 py-2 tabular-nums text-stone-800">
                              {j.estimateTotalInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeInwardReview}
                    disabled={inwardSaving}
                    className="rounded-xl border border-rlx-gold px-4 py-2 text-sm disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmInwardSelected()}
                    disabled={inwardSaving || !inwardReviewRows.some((j) => inwardAccepted[j.id])}
                    className="rounded-xl bg-rlx-green px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {inwardSaving
                      ? "Saving…"
                      : `Inward selected (${inwardReviewRows.filter((j) => inwardAccepted[j.id]).length})`}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

        </>
      ) : (
        <>
          <Card
            title="Online spare ODC pending (sender HO)"
          >
            {onlineSpareRows.filter((o) => !o.dispatchedAt).length === 0 ? (
              <div className="min-h-[2rem]" aria-hidden />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-rlx-rule/80">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-rlx-green-deep bg-rlx-green text-xs font-semibold uppercase tracking-wide text-white">
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
                        <tr key={o.id} className="border-b border-rlx-rule last:border-0">
                          <td className="px-3 py-2 font-mono text-xs font-semibold text-rlx-green">{o.orderNumber}</td>
                          <td className="px-3 py-2 font-mono text-xs">{o.srfReference}</td>
                          <td className="px-3 py-2 text-xs">{o.fromRegionName} to {o.toRegionName}</td>
                          <td className="px-3 py-2 text-xs">{o.invoiceRef ?? "-"}</td>
                          <td className="px-3 py-2 text-xs">{o.fulfilledAt ? new Date(o.fulfilledAt).toLocaleString() : "-"}</td>
                          <td className="px-3 py-2">
                            <Link
                              to="/service-centre/online-store"
                              className="rounded-lg border border-rlx-gold bg-white px-3 py-1.5 text-xs font-semibold text-rlx-green hover:bg-rlx-green-light"
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
          <Card title={`Send to brand (front desk) · ${brandOutwardQueue.length}`}>
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
            {brandOutwardQueue.length === 0 ? (
              <div className="mt-4 min-h-[2rem]" aria-hidden />
            ) : (
              <>
                <div className="mt-4 mb-3 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm text-stone-700">
                    <input
                      type="checkbox"
                      disabled={!canCreateOdc}
                      checked={
                        brandOutwardQueue.length > 0 &&
                        brandOutwardQueue.every((j) => selectedBrandOut[j.id])
                      }
                      onChange={(e) => toggleAllBrand(e.target.checked)}
                      className="rounded border-violet-400 text-violet-700 focus:ring-violet-500"
                    />
                    Select all ({brandOutwardQueue.length})
                  </label>
                  <button
                    type="button"
                    disabled={!canCreateOdc || selectedBrandJobIds.length === 0}
                    onClick={() => openBrandDispatchPopup()}
                    className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Log dispatch for selected ({selectedBrandJobIds.length})
                  </button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-violet-200/80">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-violet-300 bg-violet-50 text-xs font-semibold uppercase tracking-wide text-violet-900">
                    <tr>
                      <th className="px-3 py-2 w-10" />
                      <th className="px-3 py-2">SRF</th>
                      <th className="px-3 py-2">Watch</th>
                      <th className="px-3 py-2">Supervisor note</th>
                      <th className="px-3 py-2 w-40" />
                    </tr>
                  </thead>
                  <tbody>
                    {brandOutwardQueue.map((j) => (
                      <tr key={j.id} className="border-b border-violet-100 last:border-0">
                        <td className="px-3 py-2 align-top">
                          <input
                            type="checkbox"
                            disabled={!canCreateOdc}
                            checked={!!selectedBrandOut[j.id]}
                            onChange={() => toggleBrand(j.id)}
                            className="rounded border-violet-400 text-violet-700 focus:ring-violet-500"
                          />
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold text-violet-950">{j.reference}</td>
                        <td className="px-3 py-2 text-stone-700">
                          {j.watchBrand} {j.watchModel}
                          <span className="mt-0.5 block text-xs text-stone-500">{j.customerName}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-stone-600">{j.brandDispatchNote?.trim() || "—"}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            disabled={!canCreateOdc}
                            onClick={() => openBrandDispatchPopup([j.id])}
                            className="rounded-lg border border-violet-400 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Log this watch
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
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
              <div className="mt-4 min-h-[2rem]" aria-hidden />
            ) : (
              <>
                <div className="mt-4 mb-3 grid gap-2 md:grid-cols-4">
                  <input
                    value={outwardQuery}
                    onChange={(e) => setOutwardQuery(e.target.value)}
                    className="rounded-xl border border-rlx-gold/80 bg-rlx-green-light/50 px-3 py-2 text-sm"
                    placeholder="Search SRF/customer/phone/watch/store"
                  />
                  <input
                    type="date"
                    value={outwardFromDate}
                    onChange={(e) => setOutwardFromDate(e.target.value)}
                    className="rounded-xl border border-rlx-gold/80 bg-rlx-green-light/50 px-3 py-2 text-sm"
                  />
                  <input
                    type="date"
                    value={outwardToDate}
                    onChange={(e) => setOutwardToDate(e.target.value)}
                    className="rounded-xl border border-rlx-gold/80 bg-rlx-green-light/50 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setOutwardQuery("");
                      setOutwardFromDate("");
                      setOutwardToDate("");
                    }}
                    className="rounded-xl border border-rlx-gold px-3 py-2 text-sm font-semibold text-rlx-green hover:bg-rlx-green-light"
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
                      className="rounded border-rlx-gold text-rlx-green focus:ring-rlx-green"
                    />
                    Select all
                  </label>
                  <button
                    type="button"
                    disabled={!canCreateOdc}
                    onClick={() => void handleCreateOdc()}
                    className="rounded-xl bg-rlx-green px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rlx-green-deep disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Generate internal outward &amp; dispatch
                  </button>
                </div>
                <div className="mb-3 max-w-md">
                  <label className="text-sm">
                    Scan SRF barcode
                    <input
                      className="mt-1 w-full rounded-xl border border-rlx-gold/80 bg-rlx-green-light/50 px-3 py-2 text-sm"
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
                <div className="overflow-x-auto rounded-xl border border-rlx-rule/80">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-rlx-green-deep bg-rlx-green text-xs font-semibold uppercase tracking-wide text-white">
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
                          className="cursor-pointer border-b border-rlx-rule hover:bg-rlx-green-light/60 last:border-0"
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
                              className="rounded border-rlx-gold text-rlx-green focus:ring-rlx-green"
                            />
                          </td>
                          <td className="px-3 py-2 align-top font-mono font-semibold text-rlx-gold-dark">
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
                            {(!j.requiresLocalConversion && !!j.transferSourceRegionId) ? (
                              j.interHoReturnWithoutRepair ? (
                                <p className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-900">
                                  No repair return — invoice not required
                                </p>
                              ) : j.hoSparesBillRef ? (
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
                            <p className="rounded-lg border border-rlx-rule bg-rlx-green-light px-2 py-1 text-xs font-semibold text-rlx-green">
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
            <div className="overflow-x-auto rounded-xl border border-rlx-rule/80">
              <table className="min-w-full text-left text-sm">
                <tbody>
                  <tr className="border-b border-rlx-rule">
                    <th className="w-56 bg-rlx-green-light/70 px-3 py-2">Status</th>
                    <td className="px-3 py-2">{selectedJob.status.replace(/_/g, " ")}</td>
                  </tr>
                  <tr className="border-b border-rlx-rule">
                    <th className="bg-rlx-green-light/70 px-3 py-2">Customer</th>
                    <td className="px-3 py-2">{selectedJob.customerName} ({selectedJob.phone})</td>
                  </tr>
                  <tr className="border-b border-rlx-rule">
                    <th className="bg-rlx-green-light/70 px-3 py-2">Watch</th>
                    <td className="px-3 py-2">{selectedJob.watchBrand} {selectedJob.watchModel} · {selectedJob.serial}</td>
                  </tr>
                  <tr className="border-b border-rlx-rule">
                    <th className="bg-rlx-green-light/70 px-3 py-2">DC / ODC</th>
                    <td className="px-3 py-2">DC: {selectedJob.dcNumber ?? "-"} · ODC: {selectedJob.outwardDcNumber ?? "-"}</td>
                  </tr>
                  <tr className="border-b border-rlx-rule">
                    <th className="bg-rlx-green-light/70 px-3 py-2">Region / Store</th>
                    <td className="px-3 py-2">
                      HO: {selectedJob.regionName ?? selectedJob.regionId} · Store: {storeById.get(selectedJob.storeId)?.storeName ?? selectedJob.storeId}
                    </td>
                  </tr>
                  <tr className="border-b border-rlx-rule">
                    <th className="bg-rlx-green-light/70 px-3 py-2">Timeline</th>
                    <td className="px-3 py-2 text-xs text-stone-700">
                      Dispatched to SC: {selectedJob.dispatchedToScAt ? new Date(selectedJob.dispatchedToScAt).toLocaleString() : "-"}<br />
                      SC inward: {selectedJob.inwardAt ? new Date(selectedJob.inwardAt).toLocaleString() : "-"}<br />
                      Dispatched to store: {selectedJob.dispatchedToStoreAt ? new Date(selectedJob.dispatchedToStoreAt).toLocaleString() : "-"}<br />
                      Store inward: {selectedJob.receivedBackAtStoreAt ? new Date(selectedJob.receivedBackAtStoreAt).toLocaleString() : "-"}
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-rlx-green-light/70 px-3 py-2">Complaint</th>
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
              {transferFlowNeedsEway(outwardAck.printMeta.flow) ? (
                <div className="mt-4 rounded-xl border border-rlx-gold/40 bg-gradient-to-br from-rlx-green-light/80 to-rlx-gold-light/40 px-4 py-3 text-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-rlx-green">E-way bill (Masters India)</p>
                  {outwardAck.edoc?.ewayBillNo ? (
                    <p className="mt-1 font-mono text-base font-bold text-rlx-green-deep">{outwardAck.edoc.ewayBillNo}</p>
                  ) : (
                    <p className="mt-1 font-mono text-base font-bold text-rlx-green-deep">
                      {formatEwayEdocMessage(outwardAck.edoc) ?? "—"}
                    </p>
                  )}
                  {outwardAck.edoc?.ewayValidUpto ? (
                    <p className="mt-1 text-xs text-rlx-ink-muted">Valid until {outwardAck.edoc.ewayValidUpto}</p>
                  ) : null}
                  {challanCanCreateOrRetryEway({
                    flow: outwardAck.printMeta.flow,
                    edocEnabled,
                    ewayBillNo: outwardAck.edoc?.ewayBillNo,
                    edocStatus: outwardAck.edoc?.ok ? "SUCCESS" : outwardAck.edoc?.skipped ? "SKIPPED" : outwardAck.edoc ? "FAILED" : null,
                    edocError: outwardAck.edoc?.error,
                    skipped: outwardAck.edoc?.skipped,
                    skipReason: outwardAck.edoc?.skipReason,
                  }) && outwardAck.dcId ? (
                    <button
                      type="button"
                      onClick={() => void regenerateOutwardEway()}
                      className="mt-2 rounded-lg border border-rlx-gold bg-white px-3 py-1.5 text-xs font-semibold text-rlx-green hover:bg-rlx-green-light"
                    >
                      {outwardAck.edoc?.ewayBillNo ? "Regenerate e-way bill" : "Create e-way bill"}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {outwardAck.rows.length > 0 ? (
                <div className="mt-4 max-h-32 overflow-y-auto rounded-lg border border-rlx-rule text-xs">
                  <table className="min-w-full">
                    <thead className="sticky top-0 bg-rlx-green-light text-left font-semibold text-stone-600">
                      <tr>
                        <th className="px-2 py-1">SRF</th>
                        <th className="px-2 py-1">Watch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outwardAck.rows.map((j) => (
                        <tr key={j.id} className="border-t border-rlx-rule">
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
              <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/80 px-4 py-3 text-center">
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
                <div className="mt-4 max-h-32 overflow-y-auto rounded-lg border border-rlx-rule text-xs">
                  <table className="min-w-full">
                    <thead className="sticky top-0 bg-rlx-green-light text-left font-semibold text-stone-600">
                      <tr>
                        <th className="px-2 py-1">SRF</th>
                        <th className="px-2 py-1">Watch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inwardAck.jobs.map((j) => (
                        <tr key={j.id} className="border-t border-rlx-rule">
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
                  className="flex-1 rounded-xl border border-rlx-gold bg-rlx-green-light px-4 py-2.5 text-sm font-semibold text-rlx-green hover:bg-rlx-green-light"
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

      {outwardAck?.dcId && transferFlowNeedsEway(outwardAck.printMeta.flow) ? (
        <EwayBillModal
          open={ewayModalOpen}
          kind="challan"
          resourceId={outwardAck.dcId}
          onClose={() => setEwayModalOpen(false)}
          onSuccess={onOutwardEwaySuccess}
        />
      ) : null}
      {brandDispatchPopupOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-violet-950">Log brand dispatch</h3>
            {selectedBrandJobIds.length > 0 ? (
              <ul className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-violet-950">
                {brandOutwardQueue
                  .filter((j) => selectedBrandOut[j.id])
                  .map((j) => (
                    <li key={j.id} className="font-mono">
                      {j.reference} · {j.watchBrand} {j.watchModel}
                    </li>
                  ))}
              </ul>
            ) : null}
            <div className="mt-4 grid gap-3">
              <label className="text-sm">
                Dispatch reference / AWB *
                <input
                  className={selectClass}
                  value={brandDispatchRefInput}
                  onChange={(e) => setBrandDispatchRefInput(e.target.value)}
                  placeholder="Courier AWB or handover ref"
                />
              </label>
              <label className="text-sm">
                Dispatch remark *
                <textarea
                  className={selectClass}
                  rows={3}
                  value={brandDispatchNoteInput}
                  onChange={(e) => setBrandDispatchNoteInput(e.target.value)}
                  placeholder="Courier name, packet details, handover person…"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBrandDispatchPopupOpen(false)}
                className="rounded-xl border border-rlx-rule px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={brandDispatchSaving || selectedBrandJobIds.length === 0}
                onClick={() => {
                  const dispatchRef = brandDispatchRefInput.trim();
                  const note = brandDispatchNoteInput.trim();
                  if (!dispatchRef || !note) {
                    showError("AWB/ref and remark are required.", "Cannot save dispatch");
                    return;
                  }
                  if (selectedBrandJobIds.length === 0) {
                    showError("Select at least one watch.", "Cannot save dispatch");
                    return;
                  }
                  setBrandDispatchSaving(true);
                  void clerkLogBrandDispatchBatch(selectedBrandJobIds, { dispatchRef, note })
                    .then((out) => {
                      setBrandDispatchPopupOpen(false);
                      setBrandDispatchRefInput("");
                      setBrandDispatchNoteInput("");
                      setSelectedBrandOut({});
                      setOutwardMsg(null);
                      setBrandDispatchSuccess({ count: out.updated, ref: dispatchRef, note });
                    })
                    .catch((e: unknown) => {
                      showError(
                        e instanceof Error ? e.message : "Could not log brand dispatch.",
                        "Dispatch failed",
                      );
                    })
                    .finally(() => setBrandDispatchSaving(false));
                }}
                className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {brandDispatchSaving ? "Saving…" : `Save dispatch (${selectedBrandJobIds.length})`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {brandDispatchSuccess ? (
        <ProcessSuccessModal
          open
          title="Brand dispatch logged"
          description={`${brandDispatchSuccess.count} watch${brandDispatchSuccess.count === 1 ? "" : "es"} sent to brand desk`}
          onBackdropClick={() => setBrandDispatchSuccess(null)}
          actions={
            <button
              type="button"
              onClick={() => setBrandDispatchSuccess(null)}
              className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 sm:w-auto"
            >
              Done
            </button>
          }
        >
          <dl className="space-y-2 text-sm text-stone-700">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Dispatch ref / AWB</dt>
              <dd className="mt-0.5 font-mono font-semibold text-zimson-900">{brandDispatchSuccess.ref}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Remark</dt>
              <dd className="mt-0.5 text-stone-800">{brandDispatchSuccess.note}</dd>
            </div>
          </dl>
        </ProcessSuccessModal>
      ) : null}
      {alertModal}
    </div>
  );
}
