import { FilterField } from "../../ui/FilterField";
import { useRegions } from "../../../context/RegionsContext";
import { useAuth } from "../../../context/AuthContext";
import { useMemo } from "react";
import type { ReportFiltersQuery } from "../../../lib/clientReportsApi";

type Props = {
  filters: ReportFiltersQuery;
  onChange: (next: ReportFiltersQuery) => void;
  onRun: () => void;
  running?: boolean;
};

export function ReportFilters({ filters, onChange, onRun, running }: Props) {
  const { regions } = useRegions();
  const { user } = useAuth();

  const stores = useMemo(() => {
    if (!filters.regionId) return regions.flatMap((r) => r.stores.map((s) => ({ ...s, regionName: r.name })));
    const reg = regions.find((r) => r.id === filters.regionId);
    return (reg?.stores ?? []).map((s) => ({ ...s, regionName: reg?.name ?? "" }));
  }, [regions, filters.regionId]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <FilterField label="From date">
        <input
          type="date"
          className="w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm"
          value={filters.from}
          onChange={(e) => onChange({ ...filters, from: e.target.value })}
        />
      </FilterField>
      <FilterField label="To date">
        <input
          type="date"
          className="w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm"
          value={filters.to}
          onChange={(e) => onChange({ ...filters, to: e.target.value })}
        />
      </FilterField>
      <FilterField label="Region">
        <select
          className="w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm"
          value={filters.regionId ?? ""}
          onChange={(e) => onChange({ ...filters, regionId: e.target.value || undefined, storeId: undefined })}
        >
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Store">
        <select
          className="w-full rounded-xl border border-zimson-300 px-3 py-2 text-sm"
          value={filters.storeId ?? ""}
          onChange={(e) => onChange({ ...filters, storeId: e.target.value || undefined })}
        >
          <option value="">All stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.regionName ? `${s.regionName} · ` : ""}
              {s.name}
            </option>
          ))}
        </select>
      </FilterField>
      <div className="flex items-end">
        <button
          type="button"
          disabled={running}
          onClick={onRun}
          className="w-full rounded-xl bg-zimson-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zimson-900 disabled:opacity-60"
        >
          {running ? "Loading…" : "Run report"}
        </button>
      </div>
      {user?.role === "store_accounts" && user.storeId ? (
        <p className="sm:col-span-2 lg:col-span-5 text-xs text-stone-500">Store-scoped: only your store data is included.</p>
      ) : null}
    </div>
  );
}
