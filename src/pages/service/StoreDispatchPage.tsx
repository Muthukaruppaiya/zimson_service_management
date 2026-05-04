import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { apiJson } from "../../lib/api";
import { jobVisibleToStoreUser } from "../../lib/srfAccess";
import { printDcDocument } from "../../lib/serviceDocuments";

const rowClass = "border-b border-zimson-100 last:border-0";

type DispatchMode = "outward" | "inward";

export function StoreDispatchPage() {
  const { user } = useAuth();
  const { jobs, dispatchToServiceCentre, receiveOutwardByDc } = useSrfJobs();
  const [mode, setMode] = useState<DispatchMode>("outward");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [outwardDcInput, setOutwardDcInput] = useState("");
  const [scanOutwardSrfInput, setScanOutwardSrfInput] = useState("");
  const [scanInwardDcInput, setScanInwardDcInput] = useState("");

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
      setMessage({ type: "err", text: `Scanned DC/ODC not found in pending inward list: ${scanned}` });
      return;
    }
    setOutwardDcInput(hit);
    setMessage({ type: "ok", text: `Transfer ${hit} selected from barcode scan.` });
  }

  async function handleReceiveOutward() {
    setMessage(null);
    try {
      const out = await receiveOutwardByDc(outwardDcInput);
      setMessage({ type: "ok", text: `Received ${out.updated} watch(es) against internal transfer ${outwardDcInput}.` });
      setOutwardDcInput("");
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Could not receive internal transfer." });
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
      printDcDocument("DC", result.dcNumber, rows, {
        fromLocation: `Store: ${rows[0]?.storeName ?? rows[0]?.storeId ?? user?.storeId ?? "-"}`,
        toLocation: `HO / Service Centre: ${rows[0]?.regionName ?? rows[0]?.regionId ?? user?.regionId ?? "-"}`,
        fromHo: rows[0]?.regionName ?? rows[0]?.regionId ?? user?.regionId ?? "-",
        toHo: rows[0]?.regionName ?? rows[0]?.regionId ?? user?.regionId ?? "-",
      });
      setMessage({
        type: "ok",
        text: `Internal transfer ${result.dcNumber} created for this store only. Hand over watches with transfer copy; your regional HO inward desk will select this transfer from pending list (no manual typing).`,
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
        description="Choose SRF outward or inward flow for store operations."
        actions={
          <div className="flex flex-wrap gap-2">
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

      <Card title="SRF store flow options" subtitle="Choose one flow: inward SRF or outward SRF">
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
          subtitle="Select SRFs at this store and create internal transfer to service centre."
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
                  onChange={(e) => setOutwardDcInput(e.target.value)}
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
                Scan DC/ODC barcode
                <input
                  className="mt-1 min-w-[280px] rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                  placeholder="Scan DC/ODC and press Enter"
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
                onClick={() => void handleReceiveOutward()}
                disabled={!outwardDcInput}
                className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Confirm store receive
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
    </div>
  );
}
