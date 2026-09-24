import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProcessSuccessModal } from "../../components/ui/ProcessSuccessModal";
import { useAuth } from "../../context/AuthContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { isValidPackageName, sanitizePackageNameInput } from "../../lib/servicePackage";
import type { ServicePackageType } from "../../types/servicePackage";

const inputCls =
  "mt-1 w-full border border-rlx-rule bg-white px-3 py-2.5 text-sm text-stone-800 outline-none transition-colors focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/30";
const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-stone-500";

export function InventoryServicePackageTypesPage() {
  const { user } = useAuth();
  const api = useApiMode();
  const canManage = user?.role === "super_admin";
  const [rows, setRows] = useState<ServicePackageType[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createdAck, setCreatedAck] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) {
      setErr("Package types need API / database mode.");
      setRows([]);
      setLoading(false);
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const path = canManage ? "/api/catalog/service-package-types?all=1" : "/api/catalog/service-package-types";
      const data = await apiJson<{ types: ServicePackageType[] }>(path);
      setRows(data.types ?? []);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not load package types.");
    } finally {
      setLoading(false);
    }
  }, [api, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addType(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    const next = sanitizePackageNameInput(name).trim();
    if (!isValidPackageName(next)) {
      setErr("Package type must be letters and numbers only, with no special characters.");
      return;
    }
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await apiJson("/api/catalog/service-package-types", { method: "POST", json: { name: next } });
      setName("");
      setCreatedAck(next);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not add package type.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: ServicePackageType) {
    if (!canManage) return;
    setErr(null);
    setOk(null);
    setBusyId(row.id);
    try {
      await apiJson(`/api/catalog/service-package-types/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        json: { isActive: !row.isActive },
      });
      setOk(row.isActive ? "Package type deactivated." : "Package type reactivated.");
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not update package type.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <InventoryBreadcrumb
        current="Package types"
        parent={{ label: "Service packages", to: "/inventory/service-packages" }}
      />
      <PageHeader
        title="Package types"
        description=""
        actions={
          <Link
            to="/inventory/service-packages"
            className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 transition hover:bg-stone-50"
          >
            ← Back to packages
          </Link>
        }
      />

      {err ? <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div> : null}
      {ok ? <div className="mb-4 border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">✓ {ok}</div> : null}

      {canManage ? (
        <form onSubmit={(e) => void addType(e)} className="mb-5 border border-rlx-rule bg-white shadow-sm">
          <div className="border-b border-rlx-rule bg-rlx-green px-5 py-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">Add package type</h3>
          </div>
          <div className="flex flex-wrap items-end gap-3 p-5">
            <label className={`${labelCls} min-w-[16rem] flex-1`}>
              Type name *
              <input
                className={inputCls}
                value={name}
                maxLength={80}
                onChange={(e) => setName(sanitizePackageNameInput(e.target.value))}
                placeholder="Letters and numbers only"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="bg-rlx-green px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-rlx-green/90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save type"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mb-5 text-sm text-stone-600">Only Super Admin can add package types.</p>
      )}

      <div className="border border-rlx-rule bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-rlx-rule bg-rlx-green px-5 py-3.5">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">All package types</h3>
          <span className="border border-white/30 px-2 py-0.5 text-[10px] font-bold text-white/70">{rows.length}</span>
        </div>
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-stone-500">No package types yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-rlx-rule bg-stone-50 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  <th className="px-5 py-3 text-left">Package type</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  {canManage ? <th className="px-5 py-3 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-rlx-rule last:border-0 transition hover:bg-rlx-green/5">
                    <td className="px-5 py-3.5 font-semibold text-stone-800">{row.name}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          row.isActive ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {row.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {canManage ? (
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void toggleActive(row)}
                          className="border border-rlx-rule bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-stone-500 transition hover:bg-stone-50 disabled:opacity-50"
                        >
                          {row.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createdAck ? (
        <ProcessSuccessModal
          open
          title="Package type created"
          description="This type is now available on the Add package screen."
          onBackdropClick={() => setCreatedAck(null)}
          actions={
            <>
              <Link
                to="/inventory/service-packages/new"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 sm:w-auto"
              >
                Add package
              </Link>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-rlx-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rlx-green/90 sm:w-auto"
                onClick={() => setCreatedAck(null)}
              >
                Add another type
              </button>
            </>
          }
        >
          <div className="rounded-xl border-2 border-rlx-green/30 bg-rlx-green/5 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rlx-green">Package type</p>
            <p className="mt-1 font-mono text-2xl font-bold text-stone-900">{createdAck}</p>
          </div>
        </ProcessSuccessModal>
      ) : null}
    </div>
  );
}
