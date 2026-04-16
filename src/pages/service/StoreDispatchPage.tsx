import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ServiceBreadcrumb } from "../../components/service/ServiceBreadcrumb";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { jobVisibleToStoreUser } from "../../lib/srfAccess";

const rowClass = "border-b border-zimson-100 last:border-0";

export function StoreDispatchPage() {
  const { user } = useAuth();
  const { jobs, dispatchToServiceCentre } = useSrfJobs();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const atStore = useMemo(() => {
    if (!user) return [];
    return jobs.filter((j) => j.status === "at_store" && jobVisibleToStoreUser(j, user));
  }, [jobs, user]);

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function toggleAll(checked: boolean) {
    const next: Record<string, boolean> = {};
    if (checked) atStore.forEach((j) => (next[j.id] = true));
    setSelected(next);
  }

  function handleDispatch() {
    setMessage(null);
    const ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const result = dispatchToServiceCentre(ids);
    if ("error" in result) {
      setMessage({ type: "err", text: result.error });
      return;
    }
    setMessage({
      type: "ok",
      text: `Delivery challan ${result.dcNumber} created for this store only. Hand over watches with the DC copy; your regional HO inward desk will select this DC from their pending list (no manual typing).`,
    });
    setSelected({});
  }

  if (!user) return null;

  return (
    <div>
      <ServiceBreadcrumb current="Send to service centre" />
      <PageHeader
        title="Send watches to service centre (HO)"
        description="End of day: select SRFs that are still at the store and generate one DC to ship them to your regional service centre / HO."
        actions={
          <Link
            to="/service"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Service home
          </Link>
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
                onClick={handleDispatch}
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
    </div>
  );
}
