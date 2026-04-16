import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { SEED_TECHNICIANS } from "../../data/serviceSeed";
import { jobVisibleToServiceCentre } from "../../lib/srfAccess";

export function ScSupervisorPage() {
  const { user } = useAuth();
  const { jobs, assignTechnician } = useSrfJobs();
  const [pickTech, setPickTech] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const received = useMemo(() => {
    if (!user) return [];
    return jobs.filter(
      (j) => j.status === "received_at_sc" && jobVisibleToServiceCentre(j, user),
    );
  }, [jobs, user]);

  function handleAssign(jobId: string) {
    const techId = pickTech[jobId];
    if (!techId) {
      setFeedback((f) => ({ ...f, [jobId]: "Choose a technician." }));
      return;
    }
    const result = assignTechnician(jobId, techId);
    if ("error" in result) {
      setFeedback((f) => ({ ...f, [jobId]: result.error }));
      return;
    }
    setFeedback((f) => ({ ...f, [jobId]: "Assigned." }));
  }

  return (
    <div>
      <PageHeader
        title="Supervisor — assign technicians"
        description="Match repair complexity to technician grade. Technician then analyses the watch and confirms whether the estimate stands (re-estimate is a later phase)."
        actions={
          <Link
            to="/service-centre"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Service centre home
          </Link>
        }
      />

      <Card title="Queue — received at service centre" subtitle="Not yet assigned">
        {received.length === 0 ? (
          <p className="text-sm text-stone-600">
            No watches waiting for assignment. Complete inward first, or dispatch from the store with a
            DC.
          </p>
        ) : (
          <div className="space-y-6">
            {received.map((j) => (
              <div
                key={j.id}
                className="rounded-2xl border border-zimson-200/80 bg-white/90 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-zimson-900">{j.reference}</p>
                    <p className="text-sm text-stone-800">
                      {j.customerName} · {j.phone}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
                      {j.watchBrand} {j.watchModel} · {j.serial}
                    </p>
                    <p className="mt-2 text-xs text-stone-500">{j.complaint}</p>
                  </div>
                  <div className="text-right text-sm tabular-nums text-stone-700">
                    Est.{" "}
                    {j.estimateTotalInr.toLocaleString(undefined, {
                      style: "currency",
                      currency: "INR",
                    })}
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-[200px] flex-1">
                    <label className="text-xs font-medium text-stone-600">Technician (by grade)</label>
                    <select
                      value={pickTech[j.id] ?? ""}
                      onChange={(e) =>
                        setPickTech((p) => ({ ...p, [j.id]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zimson-400/40"
                    >
                      <option value="">Select…</option>
                      {SEED_TECHNICIANS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.grade}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAssign(j.id)}
                    className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
                  >
                    Assign
                  </button>
                </div>
                {feedback[j.id] ? (
                  <p className="mt-2 text-xs text-stone-600">{feedback[j.id]}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
