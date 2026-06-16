import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProcessSuccessModal } from "../../components/ui/ProcessSuccessModal";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson } from "../../lib/api";
import { jobVisibleToStoreUser } from "../../lib/srfAccess";
import {
  printStoreInwardReceiptDocument,
  printTransferFromMeta,
  type TransferPrintMeta,
} from "../../lib/serviceDocuments";
import { storeInwardReceiptPrintSubtitle } from "../../lib/srfLogisticsDocs";
import { resolveHoToStorePrint, resolveStoreToHoPrint } from "../../lib/transferDocumentKind";
import type { TransferPartyBlock } from "../../lib/transferDocumentKind";
import type { SrfJob } from "../../types/srfJob";

const rowClass = "border-b border-zimson-100 last:border-0";

const ackBtnPrimary =
  "rounded-xl bg-rlx-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rlx-green/90";
const ackBtnOutline =
  "rounded-xl border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50";

type DispatchMode = "outward" | "inward";

type StoreOutwardAck = {
  dcNumber: string;
  rows: SrfJob[];
  moved: number;
  printMeta: TransferPrintMeta;
  printOpts: {
    fromLocation: string;
    toLocation: string;
    fromHo: string;
    toHo: string;
  };
};

type StoreInwardAck = {
  inwardNumber: string;
  rows: SrfJob[];
  updated: number;
  receivedAt: Date;
  storeLabel: string;
  fromHoLabel: string;
  partyFrom?: TransferPartyBlock;
  partyTo?: TransferPartyBlock;
};

export function StoreDispatchPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const { jobs, dispatchToServiceCentre, receiveOutwardByDc } = useSrfJobs();
  const [mode, setMode] = useState<DispatchMode>("outward");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [outwardDcInput, setOutwardDcInput] = useState("");
  const [scanOutwardSrfInput, setScanOutwardSrfInput] = useState("");
  const [scanInwardDcInput, setScanInwardDcInput] = useState("");
  const [outwardAck, setOutwardAck] = useState<StoreOutwardAck | null>(null);
  const [storeInwardAck, setStoreInwardAck] = useState<StoreInwardAck | null>(null);
  const [inwardReviewOpen, setInwardReviewOpen] = useState(false);
  const [inwardReviewDc, setInwardReviewDc] = useState("");
  const [inwardAccepted, setInwardAccepted] = useState<Record<string, boolean>>({});
  const [inwardSaving, setInwardSaving] = useState(false);

  const atStore = useMemo(() => {
    if (!user) return [];
    return jobs.filter(
      (j) =>
        j.status === "at_store" &&
        j.repairRoute !== "store_self" &&
        jobVisibleToStoreUser(j, user),
    );
  }, [jobs, user]);
  const receivedAtStore = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => j.status === "received_at_store" && jobVisibleToStoreUser(j, user));
  }, [jobs, user]);

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function applyScannedOutwardSrf(raw: string) {
    const scanned = raw.trim().toUpperCase();
    if (!scanned) return;
    const hit = atStore.find((j) => j.reference.trim().toUpperCase() === scanned);
    if (!hit) {
      setMessage({ type: "err", text: `Scanned SRF not found in outward list: ${scanned}` });
      return;
    }
    setSelected((prev) => ({ ...prev, [hit.id]: true }));
    setMessage({ type: "ok", text: `SRF ${hit.reference} selected from barcode scan.` });
  }

  function applyScannedInwardDc(raw: string) {
    const scanned = raw.trim().toUpperCase();
    if (!scanned) return;
    const hit = pendingOdcOptions.find((dc) => dc.trim().toUpperCase() === scanned);
    if (!hit) {
      setMessage({ type: "err", text: `Scanned TD/DC not found in pending inward list: ${scanned}` });
      return;
    }
    setOutwardDcInput(hit);
    setMessage({ type: "ok", text: `Transfer ${hit} selected from barcode scan.` });
    openInwardReview(hit);
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

  function watchesPendingOnTransfer(dcNumber: string): SrfJob[] {
    if (!user || !dcNumber.trim()) return [];
    return jobs.filter(
      (j) =>
        j.outwardDcNumber === dcNumber &&
        j.status === "dispatched_to_store" &&
        jobVisibleToStoreUser(j, user),
    );
  }

  const inwardReviewRows = useMemo(
    () => watchesPendingOnTransfer(inwardReviewDc),
    [inwardReviewDc, jobs, user],
  );

  function openInwardReview(dcNumber: string) {
    const rows = watchesPendingOnTransfer(dcNumber);
    if (rows.length === 0) {
      setMessage({ type: "err", text: `No watches pending on transfer ${dcNumber}.` });
      return;
    }
    setMessage(null);
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

  async function confirmInwardSelected() {
    if (!user || !inwardReviewDc.trim() || inwardSaving) return;
    const dcNumber = inwardReviewDc.trim();
    const selectedIds = inwardReviewRows.filter((j) => inwardAccepted[j.id]).map((j) => j.id);
    if (selectedIds.length === 0) {
      setMessage({ type: "err", text: "Tick at least one watch in working condition to inward." });
      return;
    }
    setInwardSaving(true);
    setMessage(null);
    try {
      const out = await receiveOutwardByDc(dcNumber, selectedIds);
      const rows = inwardReviewRows.filter((j) => selectedIds.includes(j.id));
      const store = regions.flatMap((r) => r.stores).find((s) => s.id === user.storeId);
      const region = regions.find((r) => r.id === user.regionId);
      const storeLabel = store?.invoiceDisplayName?.trim() || store?.name || user.storeId || "Store";
      const fromHoLabel = region?.name ?? "Service centre";
      let partyFrom: TransferPartyBlock | undefined;
      let partyTo: TransferPartyBlock | undefined;
      if (store && region) {
        const r = resolveHoToStorePrint(region, store, region);
        partyFrom = r.from;
        partyTo = r.to;
      }
      closeInwardReview();
      setOutwardDcInput("");
      setStoreInwardAck({
        inwardNumber: dcNumber,
        rows,
        updated: out.updated,
        receivedAt: new Date(),
        storeLabel,
        fromHoLabel,
        partyFrom,
        partyTo,
      });
      const skipped = inwardReviewRows.length - selectedIds.length;
      let okText = `Inwarded ${out.updated} watch(es) on ${dcNumber}.`;
      if (skipped > 0) {
        okText += ` ${skipped} not accepted — still on transfer (return to HO flow coming next).`;
      } else if ((out.pendingOnTransfer ?? 0) > 0) {
        okText += ` ${out.pendingOnTransfer} still pending on this transfer.`;
      }
      setMessage({ type: "ok", text: okText });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Could not receive internal transfer." });
    } finally {
      setInwardSaving(false);
    }
  }

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
    if (ids.length === 0) {
      setMessage({ type: "err", text: "Select at least one SRF to dispatch to the service centre." });
      return;
    }
    try {
      const result = await dispatchToServiceCentre(ids);
      const rows = atStore.filter((j) => ids.includes(j.id));
      const printOpts = {
        fromLocation: `Store: ${rows[0]?.storeName ?? rows[0]?.storeId ?? user?.storeId ?? "-"}`,
        toLocation: `HO / Service Centre: ${rows[0]?.regionName ?? rows[0]?.regionId ?? user?.regionId ?? "-"}`,
        fromHo: rows[0]?.regionName ?? rows[0]?.regionId ?? user?.regionId ?? "-",
        toHo: rows[0]?.regionName ?? rows[0]?.regionId ?? user?.regionId ?? "-",
      };
      const storeId = rows[0]?.storeId ?? user?.storeId ?? "";
      const regionId = rows[0]?.regionId ?? user?.regionId ?? "";
      const store = regions.flatMap((r) => r.stores).find((s) => s.id === storeId);
      const region = regions.find((r) => r.id === regionId);
      const fallback =
        store && region
          ? (() => {
              const r = resolveStoreToHoPrint(store, region);
              return {
                printKind: r.printKind,
                flow: "store_to_ho" as const,
                transferNumber: result.dcNumber,
                from: r.from,
                to: r.to,
              };
            })()
          : null;
      const printMeta = result.printMeta ?? fallback;
      if (!printMeta) {
        setMessage({ type: "err", text: "Transfer created but print details are unavailable. Configure store/region addresses in Regions." });
      }
      setOutwardAck({
        dcNumber: result.dcNumber,
        rows,
        moved: result.moved,
        printMeta: printMeta ?? {
          printKind: "transfer",
          flow: "store_to_ho",
          transferNumber: result.dcNumber,
          from: {
            locationLabel: printOpts.fromLocation,
            legalName: printOpts.fromHo,
            address: "—",
            phone: "—",
            email: "—",
            gstin: "—",
          },
          to: {
            locationLabel: printOpts.toLocation,
            legalName: printOpts.toHo,
            address: "—",
            phone: "—",
            email: "—",
            gstin: "—",
          },
        },
        printOpts,
      });
      void apiJson("/api/notifications/service-dispatch", {
        method: "POST",
        json: { dcNumber: result.dcNumber, count: ids.length },
      }).catch(() => {});
      setSelected({});
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Could not create internal transfer." });
    }
  }

  if (!user) return null;

  return (
    <div>
      <ServiceBreadcrumb current="Send to service centre" />
      <PageHeader
        title="Send watches to service centre (HO)"
        description=""
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/service/store-logistics-history"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Inward & outward history
            </Link>
            <Link
              to="/service/srf-master"
              className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
            >
              Open SRF master table
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

      <Card title="SRF store flow options" subtitle="">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("outward")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              mode === "outward"
                ? "bg-zimson-600 text-white"
                : "border border-zimson-300 bg-white text-zimson-900 hover:bg-zimson-50"
            }`}
          >
            Outward SRF
          </button>
          <button
            type="button"
            onClick={() => setMode("inward")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              mode === "inward"
                ? "bg-zimson-600 text-white"
                : "border border-zimson-300 bg-white text-zimson-900 hover:bg-zimson-50"
            }`}
          >
            Inward SRF
          </button>
        </div>
      </Card>

      {mode === "outward" ? (
        <Card
          title="Outward SRF (Store to HO)"
          subtitle=""
          className="mt-8"
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
                  Create internal transfer &amp; mark in transit
                </button>
              </div>
              <div className="mb-3 max-w-md">
                <label className="text-sm">
                  Scan SRF barcode
                  <input
                    className="mt-1 w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                    placeholder="Scan SRF barcode and press Enter"
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
        </Card>
      ) : (
        <>
          <Card title="Inward SRF (HO to Store)" subtitle="Select pending internal transfer and confirm inward at store." className="mt-8">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                Pending internal transfer number
                <select
                  className="mt-1 min-w-[280px] rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  value={outwardDcInput}
                  onChange={(e) => {
                    const next = e.target.value;
                    setOutwardDcInput(next);
                    if (next) openInwardReview(next);
                  }}
                >
                  <option value="">Select pending transfer…</option>
                  {pendingOdcOptions.map((dc) => (
                    <option key={dc} value={dc}>
                      {dc}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Scan TD/DC barcode
                <input
                  className="mt-1 min-w-[280px] rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  placeholder="Scan TD or DC and press Enter"
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
                type="button"
                onClick={() => outwardDcInput && openInwardReview(outwardDcInput)}
                disabled={!outwardDcInput}
                className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Review watches &amp; inward
              </button>
            </div>
          </Card>

          <Card
            title="Inwarded SRF inventory at store"
            subtitle="Inwarded watches stay in store inventory until customer collection."
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
        </>
      )}
      {inwardReviewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zimson-900">Inward watches — {inwardReviewDc}</h3>
            <p className="mt-1 text-sm text-stone-600">
              {inwardReviewRows.length} watch{inwardReviewRows.length === 1 ? "" : "es"} sent on this transfer.
              Tick each watch that arrived in working condition, then inward.
            </p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-zimson-200">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="bg-zimson-50 text-xs uppercase tracking-wide text-stone-600">
                    <th className="px-3 py-2">OK</th>
                    <th className="px-3 py-2">SRF</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Watch</th>
                    <th className="px-3 py-2">Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  {inwardReviewRows.map((j) => (
                    <tr key={j.id} className="border-t border-zimson-100">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={Boolean(inwardAccepted[j.id])}
                          disabled={inwardSaving}
                          onChange={(e) =>
                            setInwardAccepted((prev) => ({ ...prev, [j.id]: e.target.checked }))
                          }
                          aria-label={`Accept ${j.reference} in working condition`}
                          className="h-4 w-4 rounded border-zimson-400"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-zimson-900">{j.reference}</td>
                      <td className="px-3 py-2 text-stone-800">
                        {j.customerName}
                        <span className="block text-xs text-stone-500">{j.phone}</span>
                      </td>
                      <td className="px-3 py-2 text-stone-700">
                        {j.watchBrand} {j.watchModel}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-stone-800">
                        {j.estimateTotalInr.toLocaleString(undefined, { style: "currency", currency: "INR" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {inwardReviewRows.some((j) => !inwardAccepted[j.id]) ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                Unticked watch(es) will stay on this transfer and can be sent back to HO (return flow — next step).
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeInwardReview}
                disabled={inwardSaving}
                className="rounded-xl border border-zimson-300 px-4 py-2 text-sm disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmInwardSelected()}
                disabled={inwardSaving || !inwardReviewRows.some((j) => inwardAccepted[j.id])}
                className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {inwardSaving
                  ? "Saving…"
                  : `Inward selected (${inwardReviewRows.filter((j) => inwardAccepted[j.id]).length})`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

      {storeInwardAck ? (
        <ProcessSuccessModal
          open
          title="SRF received at store"
          description={`${storeInwardAck.inwardNumber} · ${storeInwardAck.updated} watch${storeInwardAck.updated === 1 ? "" : "es"}`}
          onBackdropClick={() => setStoreInwardAck(null)}
          actions={
            <>
              <button
                type="button"
                className={ackBtnPrimary}
                onClick={() =>
                  printStoreInwardReceiptDocument({
                    inwardNumber: storeInwardAck.inwardNumber,
                    storeLabel: storeInwardAck.storeLabel,
                    fromHoLabel: storeInwardAck.fromHoLabel,
                    receivedBy: user?.displayName?.trim() || user?.email?.trim() || "Store",
                    receivedAt: storeInwardAck.receivedAt,
                    jobs: storeInwardAck.rows,
                    partyFrom: storeInwardAck.partyFrom,
                    partyTo: storeInwardAck.partyTo,
                  })
                }
              >
                Print inward receipt
              </button>
              <button type="button" className={ackBtnOutline} onClick={() => setStoreInwardAck(null)}>
                Done
              </button>
            </>
          }
        >
          <p className="text-sm text-stone-700">{storeInwardReceiptPrintSubtitle()}</p>
          <div className="mt-4 rounded-xl border-2 border-rlx-green/30 bg-rlx-green/5 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rlx-green">Transfer number (TD)</p>
            <p className="mt-1 font-mono text-2xl font-bold text-stone-900">{storeInwardAck.inwardNumber}</p>
          </div>
          <dl className="mt-4 space-y-1.5 text-sm text-stone-700">
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">Received at store</dt>
              <dd className="font-medium text-stone-900">{storeInwardAck.storeLabel}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">From HO</dt>
              <dd className="font-medium text-stone-900">{storeInwardAck.fromHoLabel}</dd>
            </div>
          </dl>
          {storeInwardAck.rows.length > 0 ? (
            <div className="mt-4 max-h-36 overflow-y-auto rounded-lg border border-rlx-rule text-xs">
              <table className="min-w-full">
                <thead className="sticky top-0 bg-stone-50 text-left font-semibold text-stone-600">
                  <tr>
                    <th className="px-2 py-1.5">SRF</th>
                    <th className="px-2 py-1.5">Customer</th>
                    <th className="px-2 py-1.5">Watch</th>
                  </tr>
                </thead>
                <tbody>
                  {storeInwardAck.rows.map((j) => (
                    <tr key={j.id} className="border-t border-rlx-rule">
                      <td className="px-2 py-1.5 font-mono font-semibold">{j.reference}</td>
                      <td className="px-2 py-1.5">{j.customerName}</td>
                      <td className="px-2 py-1.5">
                        {j.watchBrand} {j.watchModel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </ProcessSuccessModal>
      ) : null}

      {outwardAck ? (
        <ProcessSuccessModal
          open
          title="Internal transfer created (store → HO)"
          description={`${outwardAck.dcNumber} · ${outwardAck.moved} watch${outwardAck.moved === 1 ? "" : "es"}`}
          onBackdropClick={() => setOutwardAck(null)}
          actions={
            <>
              <button
                type="button"
                className={ackBtnPrimary}
                onClick={() =>
                  printTransferFromMeta(outwardAck.printMeta, outwardAck.rows, {
                    seriesCode: "TD",
                    preparedBy: user?.displayName?.trim() || user?.email?.trim(),
                  })
                }
              >
                Print transfer copy
              </button>
              <button type="button" className={ackBtnOutline} onClick={() => setOutwardAck(null)}>
                Done
              </button>
            </>
          }
        >
          <p className="text-sm text-stone-700">
            {/* Hand over the physical watch(es) with the printed internal transfer document. Store → HO movement
            uses a transfer document (not a GST delivery challan). Your regional HO inward desk will select this
            batch from their pending list. */}
          </p>
          <div className="mt-4 rounded-xl border-2 border-rlx-green/30 bg-rlx-green/5 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rlx-green">Transfer number (TD)</p>
            <p className="mt-1 font-mono text-2xl font-bold text-stone-900">{outwardAck.dcNumber}</p>
          </div>
          <dl className="mt-4 space-y-1.5 text-sm text-stone-700">
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">From</dt>
              <dd className="font-medium text-stone-900">{outwardAck.printOpts.fromLocation}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-stone-500">To</dt>
              <dd className="font-medium text-stone-900">{outwardAck.printOpts.toLocation}</dd>
            </div>
          </dl>
          {outwardAck.rows.length > 0 ? (
            <div className="mt-4 max-h-36 overflow-y-auto rounded-lg border border-rlx-rule text-xs">
              <table className="min-w-full">
                <thead className="sticky top-0 bg-stone-50 text-left font-semibold text-stone-600">
                  <tr>
                    <th className="px-2 py-1.5">SRF</th>
                    <th className="px-2 py-1.5">Customer</th>
                    <th className="px-2 py-1.5">Watch</th>
                  </tr>
                </thead>
                <tbody>
                  {outwardAck.rows.map((j) => (
                    <tr key={j.id} className="border-t border-rlx-rule">
                      <td className="px-2 py-1.5 font-mono font-semibold">{j.reference}</td>
                      <td className="px-2 py-1.5">{j.customerName}</td>
                      <td className="px-2 py-1.5">
                        {j.watchBrand} {j.watchModel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </ProcessSuccessModal>
      ) : null}
    </div>
  );
}
