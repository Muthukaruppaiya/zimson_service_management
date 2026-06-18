import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useSrfJobs } from "../../context/SrfJobsContext";
import { technicianCanActOnJob } from "../../lib/srfAccess";
import { apiJson } from "../../lib/api";
import { srfReestimateNotifyMessage } from "../../lib/srfApprovalWhatsApp";
import type { TechnicianProfile } from "../../types/technician";

export function TechnicianWorkbenchPage() {
  const { user } = useAuth();
  const {
    jobs,
    technicianEstimateOk,
    technicianRequestReestimate,
    submitSparesSlip,
    technicianMarkRepairComplete,
  } = useSrfJobs();
  const [note, setNote] = useState<string | null>(null);
  const [sparesTextByJob, setSparesTextByJob] = useState<Record<string, string>>({});
  const [technicians, setTechnicians] = useState<TechnicianProfile[]>([]);

  useEffect(() => {
    void apiJson<{ rows: TechnicianProfile[] }>("/api/service/technicians?activeOnly=1")
      .then((out) => setTechnicians(out.rows))
      .catch(() => setTechnicians([]));
  }, []);

  const myJobs = useMemo(() => {
    if (!user || user.role !== "technician" || !user.technicianProfileId) return [];
    return jobs.filter(
      (j) =>
        technicianCanActOnJob(j, user) &&
        (j.status === "assigned" || j.status === "estimate_ok" || j.status === "reestimate_required"),
    );
  }, [jobs, user]);

  const techLabel = useMemo(() => {
    if (!user?.technicianProfileId) return "";
    const t = technicians.find((x) => x.id === user.technicianProfileId);
    return t ? `${t.fullName} (${t.grade})` : user.technicianProfileId;
  }, [user, technicians]);

  async function ok(jobId: string) {
    setNote(null);
    if (!user?.technicianProfileId) return;
    try {
      await technicianEstimateOk(jobId, user.technicianProfileId);
      setNote("Estimate confirmed OK — proceed with repair; when done, send to SC outward queue.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not update estimate.");
    }
  }

  async function ship(jobId: string) {
    setNote(null);
    if (!user?.technicianProfileId) return;
    try {
      await technicianMarkRepairComplete(jobId, user.technicianProfileId);
      setNote("Repair marked complete — logistics will create an ODC and dispatch to the chosen store.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not mark repair complete.");
    }
  }

  async function submitSpares(jobId: string) {
    const raw = (sparesTextByJob[jobId] ?? "").trim();
    if (!raw) {
      setNote("Enter used spares as lines, for example: Glass - 1");
      return;
    }
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [namePart, qtyPart] = line.split("-").map((x) => x.trim());
        const qty = Number(qtyPart ?? "1");
        return { name: namePart || line, qty: Number.isFinite(qty) && qty > 0 ? qty : 1 };
      });
    try {
      await submitSparesSlip(jobId, lines);
      setNote("Used spares slip submitted.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not submit spares slip.");
    }
  }

  async function requestReestimate(jobId: string) {
    setNote(null);
    if (!user?.technicianProfileId) return;
    try {
      const notify = await technicianRequestReestimate(jobId, user.technicianProfileId, "Technician requested re-estimate.");
      setNote(srfReestimateNotifyMessage("Marked as re-estimate required.", notify));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not request re-estimate.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Technician workbench"
        description={`Logged in as ${techLabel}. Submit used spares slip, then mark repair complete for outward queue.`}
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
          <p className="text-sm text-stone-600">Nothing assigned to you currently.</p>
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
                {j.usedSpares && j.usedSpares.length > 0 ? (
                  <div className="mt-2 rounded-xl bg-zimson-50 p-2 text-xs text-stone-700">
                    Used spares: {j.usedSpares.map((x) => `${x.name} x${x.qty}`).join(", ")}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {j.status === "assigned" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void ok(j.id)}
                        className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
                      >
                        Estimate OK — proceed with repair
                      </button>
                      <button
                        type="button"
                        onClick={() => void requestReestimate(j.id)}
                        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
                      >
                        Need re-estimate
                      </button>
                    </>
                  ) : null}
                  {j.status === "estimate_ok" ? (
                    <>
                      <textarea
                        value={sparesTextByJob[j.id] ?? ""}
                        onChange={(e) => setSparesTextByJob((prev) => ({ ...prev, [j.id]: e.target.value }))}
                        placeholder={"Used spares slip (one per line)\nGlass - 1\nCrown - 1"}
                        className="w-full rounded-xl border border-zimson-300 bg-zimson-50/50 px-3 py-2 text-sm"
                        rows={3}
                      />
                      <button
                        type="button"
                        onClick={() => void submitSpares(j.id)}
                        className="rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50"
                      >
                        Submit spares slip
                      </button>
                      <button
                        type="button"
                        onClick={() => void ship(j.id)}
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"
                      >
                        Repair done — send to outward queue
                      </button>
                    </>
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
