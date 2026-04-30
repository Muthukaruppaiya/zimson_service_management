import { useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useRegions } from "../../context/RegionsContext";
import { apiJson } from "../../lib/api";
import type { TechnicianProfile } from "../../types/technician";

export function TechnicianMasterPage() {
  const { user } = useAuth();
  const { regions } = useRegions();
  const [rows, setRows] = useState<TechnicianProfile[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    employeeCode: "",
    fullName: "",
    email: "",
    phone: "",
    grade: "",
    regionId: "",
    specialization: "",
    experienceYears: "0",
    notes: "",
  });

  const canCreate = useMemo(
    () =>
      [
        "super_admin",
        "regional_admin",
        "ho_admin",
        "ho_manager",
        "service_centre_supervisor",
        "service_centre_clerk",
      ].includes(user?.role ?? ""),
    [user?.role],
  );

  async function load() {
    try {
      const out = await apiJson<{ rows: TechnicianProfile[] }>("/api/service/technicians?activeOnly=1");
      setRows(out.rows);
      setMsg("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not load technicians.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createTechnician() {
    if (!canCreate) return;
    if (!form.employeeCode.trim() || !form.fullName.trim() || !form.grade.trim()) {
      setMsg("Employee code, name and grade are required.");
      return;
    }
    try {
      await apiJson("/api/service/technicians", {
        method: "POST",
        json: {
          employeeCode: form.employeeCode.trim(),
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          grade: form.grade.trim(),
          regionId: form.regionId.trim() || null,
          specialization: form.specialization.trim(),
          experienceYears: Number(form.experienceYears || 0),
          notes: form.notes.trim(),
        },
      });
      setForm({
        employeeCode: "",
        fullName: "",
        email: "",
        phone: "",
        grade: "",
        regionId: "",
        specialization: "",
        experienceYears: "0",
        notes: "",
      });
      setMsg("Technician created.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not create technician.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Technician master"
        description="Create technician profiles (no login required). Data is used in SRF assignment and quick bill."
      />

      <Card title="Create technician">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">Employee code<input className="mt-1 w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm" value={form.employeeCode} onChange={(e) => setForm((p) => ({ ...p, employeeCode: e.target.value }))} /></label>
          <label className="text-sm">Name<input className="mt-1 w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm" value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} /></label>
          <label className="text-sm">Mail ID<input className="mt-1 w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></label>
          <label className="text-sm">Phone number<input className="mt-1 w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></label>
          <label className="text-sm">Grade<input className="mt-1 w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm" value={form.grade} onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))} /></label>
          <label className="text-sm">Region<select className="mt-1 w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm" value={form.regionId} onChange={(e) => setForm((p) => ({ ...p, regionId: e.target.value }))}><option value="">Select region</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label className="text-sm">Specialization<input className="mt-1 w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm" value={form.specialization} onChange={(e) => setForm((p) => ({ ...p, specialization: e.target.value }))} /></label>
          <label className="text-sm">Experience (years)<input className="mt-1 w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm" value={form.experienceYears} onChange={(e) => setForm((p) => ({ ...p, experienceYears: e.target.value }))} /></label>
          <label className="text-sm md:col-span-2">Notes<textarea className="mt-1 w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm" rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={() => void createTechnician()} disabled={!canCreate} className="rounded-xl bg-zimson-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            Create technician
          </button>
          {msg ? <p className="text-xs text-stone-600">{msg}</p> : null}
        </div>
      </Card>

      <Card title={`Technician list (${rows.length})`} className="mt-8">
        <div className="overflow-x-auto rounded-xl border border-zimson-200/80">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zimson-200 bg-zimson-50/80 text-xs font-semibold uppercase tracking-wide text-stone-600">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Grade</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Mail</th>
                <th className="px-3 py-2">Region</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zimson-100 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{r.employeeCode}</td>
                  <td className="px-3 py-2">{r.fullName}</td>
                  <td className="px-3 py-2">{r.grade}</td>
                  <td className="px-3 py-2">{r.phone ?? "-"}</td>
                  <td className="px-3 py-2">{r.email ?? "-"}</td>
                  <td className="px-3 py-2">{r.regionName ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
