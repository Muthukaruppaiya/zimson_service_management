import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { SEED_TECHNICIANS } from "../../data/serviceSeed";
import { technicianCanActOnJob } from "../../lib/srfAccess";

export function TechnicianWorkbenchPage() {
  const { user } = useAuth();
  const { jobs, technicianEstimateOk, technicianMarkRepairComplete } = useSrfJobs();
  const [note, setNote] = useState<string | null>(null);

  const myJobs = useMemo(() => {
    if (!user || user.role !== "technician" || !user.technicianProfileId) return [];
    return jobs.filter(
      (j) =>
        technicianCanActOnJob(j, user) &&
        (j.status === "assigned" || j.status === "estimate_ok"),
    );
  }, [jobs, user]);

  const techLabel = useMemo(() => {
    if (!user?.technicianProfileId) return "";
    const t = SEED_TECHNICIANS.find((x) => x.id === user.technicianProfileId);
    return t ? `${t.name} (${t.grade})` : user.technicianProfileId;
  }, [user]);

  function ok(jobId: string) {
    setNote(null);
    if (!user?.technicianProfileId) return;
    const r = technicianEstimateOk(jobId, user.technicianProfileId);
    if ("error" in r) setNote(r.error);
    else setNote("Estimate confirmed OK — proceed with repair; when done, send to SC outward queue.");
  }

  function ship(jobId: string) {
    setNote(null);
    if (!user?.technicianProfileId) return;
    const r = technicianMarkRepairComplete(jobId, user.technicianProfileId);
    if ("error" in r) setNote(r.error);
    else setNote("Repair marked complete — logistics will create an ODC and dispatch to the chosen store.");
  }

  return (
    <div>
      <PageHeader
        title="Technician workbench"
        description={`Logged in as ${techLabel}. Confirm estimate OK, complete repair — watches then go to service centre outward (ODC) with optional destination store. Re-estimate will be a separate flow.`}
        actions={
          <Link
            to="/service-centre"
            className="inline-flex rounded-xl border border-zimson-400 bg-white px-4 py-2.5 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
          >
            Service centre home
          </Link>
        }
      />

      {note ? (
        <p className="mb-4 rounded-xl border border-zimson-200 bg-zimson-50 px-3 py-2 text-sm text-stone-800">
          {note}
        </p>
      ) : null}

      <Card title="My assigned SRFs">
        {myJobs.length === 0 ? (
          <p className="text-sm text-stone-600">
            Nothing assigned to you. Supervisor must assign an SRF after inward (demo: ho.tech@zimson.demo
            / tech-1).
          </p>
        ) : (
          <div className="space-y-6">
            {myJobs.map((j) => (
              <div
                key={j.id}
                className="rounded-2xl border border-zimson-200/80 bg-white/90 p-4 shadow-sm"
              >
                <p className="font-mono text-sm font-bold text-zimson-900">{j.reference}</p>
                <p className="text-sm text-stone-700">
                  {j.watchBrand} {j.watchModel} · {j.serial}
                </p>
                <p className="mt-2 text-sm text-stone-600">{j.complaint}</p>
                <p className="mt-2 text-xs font-medium text-stone-500">
                  Status: <span className="text-zimson-900">{j.status.replace(/_/g, " ")}</span>
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {j.status === "assigned" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => ok(j.id)}
                        className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
                      >
                        Estimate OK — proceed with repair
                      </button>
                      <button
                        type="button"
                        disabled
                        className="cursor-not-allowed rounded-xl border border-stone-200 bg-stone-100 px-4 py-2 text-sm font-medium text-stone-400"
                        title="Next phase"
                      >
                        Need re-estimate (next flow)
                      </button>
                    </>
                  ) : null}
                  {j.status === "estimate_ok" ? (
                    <button
                      type="button"
                      onClick={() => ship(j.id)}
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"
                    >
                      Repair done — send to outward queue
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
