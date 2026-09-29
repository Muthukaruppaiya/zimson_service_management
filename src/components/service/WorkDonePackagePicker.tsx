import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../../lib/api";
import { formatInr } from "../../lib/formatInr";
import {
  packageDisplayName,
  packageTypeLabel,
  snapshotFromPackage,
  watchServiceKindLabel,
  WATCH_SERVICE_KINDS,
} from "../../lib/servicePackage";
import type { ServicePackage, SrfServicePackageSnapshot, WatchServiceKind } from "../../types/servicePackage";

export type WorkDoneChargeType = "service" | "spare";

export type WorkDoneSpareLine = {
  spareId: string;
  qty: string;
  fromPackage?: boolean;
  /** Service is included in package amount; spare is a separate billed line. */
  chargeType?: WorkDoneChargeType;
};

export function lineChargeType(line: Pick<WorkDoneSpareLine, "chargeType" | "fromPackage">): WorkDoneChargeType {
  if (line.chargeType === "service" || line.chargeType === "spare") return line.chargeType;
  return line.fromPackage ? "service" : "spare";
}

export function linesFromPackageSnapshot(
  pkg: SrfServicePackageSnapshot | null | undefined,
): WorkDoneSpareLine[] {
  const ids = (pkg?.spareIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean);
  if (ids.length === 0) return [{ spareId: "", qty: "1", chargeType: "spare" }];
  return ids.map((spareId) => ({ spareId, qty: "1", fromPackage: true, chargeType: "service" }));
}

export function draftLineFromUsedSpare(
  u: {
    spareId?: string | null;
    qty?: number;
    includedInPackage?: boolean;
    chargeType?: "service" | "spare";
  },
  packageSpareIds?: string[] | null,
): WorkDoneSpareLine {
  const spareId = String(u.spareId ?? "").trim();
  const inPkg = Boolean(spareId && (packageSpareIds ?? []).includes(spareId));
  const chargeType: WorkDoneChargeType =
    u.chargeType === "service" || u.chargeType === "spare"
      ? u.chargeType
      : u.includedInPackage === true
        ? "service"
        : u.includedInPackage === false
          ? "spare"
          : inPkg
            ? "service"
            : "spare";
  return {
    spareId,
    qty: String(u.qty ?? 1),
    fromPackage: inPkg && chargeType === "service",
    chargeType,
  };
}

export function usedSparePersistFlags(line: WorkDoneSpareLine): {
  includedInPackage: boolean;
  chargeType: WorkDoneChargeType;
} {
  const chargeType = lineChargeType(line);
  return {
    includedInPackage: chargeType === "service",
    chargeType,
  };
}

type Props = {
  watchBrand: string;
  lines: WorkDoneSpareLine[];
  onLinesChange: (lines: WorkDoneSpareLine[]) => void;
  selected: SrfServicePackageSnapshot | null;
  onSelectedChange: (pkg: SrfServicePackageSnapshot | null) => void;
  disabled?: boolean;
  lockSelection?: boolean;
};

export function WorkDonePackagePicker({
  watchBrand,
  lines,
  onLinesChange,
  selected,
  onSelectedChange,
  disabled,
  lockSelection,
}: Props) {
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [serviceType, setServiceType] = useState<WatchServiceKind | "">(selected?.serviceType ?? "");

  useEffect(() => {
    setServiceType(selected?.serviceType ?? "");
  }, [selected?.id, selected?.serviceType]);

  useEffect(() => {
    const brand = watchBrand.trim();
    if (!brand) {
      setPackages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void apiJson<{ packages: ServicePackage[] }>(
      `/api/catalog/service-packages?brand=${encodeURIComponent(brand)}`,
    )
      .then((data) => {
        if (!cancelled) setPackages(data.packages ?? []);
      })
      .catch(() => {
        if (!cancelled) setPackages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [watchBrand]);

  const forType = useMemo(
    () => packages.filter((p) => !serviceType || p.serviceType === serviceType),
    [packages, serviceType],
  );

  function applyPackage(id: string) {
    const pkg = packages.find((p) => p.id === id);
    if (!pkg) {
      onSelectedChange(null);
      return;
    }
    setServiceType(pkg.serviceType);
    onSelectedChange(snapshotFromPackage(pkg));
    const extras = lines.filter((l) => !l.fromPackage && l.spareId.trim());
    const pkgLines: WorkDoneSpareLine[] = pkg.spares.map((s) => ({
      spareId: s.spareId,
      qty: String(Math.max(1, Math.round(s.qty || 1))),
      fromPackage: true,
      chargeType: "service",
    }));
    onLinesChange(pkgLines.length > 0 ? [...pkgLines, ...extras] : extras.length ? extras : [{ spareId: "", qty: "1", chargeType: "spare" }]);
  }

  function clearPackage() {
    onSelectedChange(null);
    const extras = lines.filter((l) => !l.fromPackage);
    onLinesChange(extras.length > 0 ? extras : [{ spareId: "", qty: "1", chargeType: "spare" }]);
  }

  if (!watchBrand.trim()) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Service package</p>
        {selected && !lockSelection ? (
          <button
            type="button"
            disabled={disabled}
            onClick={clearPackage}
            className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-700 disabled:opacity-50"
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className="p-4">
        {loading && !selected ? (
          <p className="text-xs text-slate-400">Loading packages for {watchBrand}…</p>
        ) : selected ? (
          <div className="rounded-lg border border-rlx-green bg-rlx-green/5 px-3 py-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">{packageDisplayName(selected)}</p>
              <p className="text-sm font-semibold tabular-nums text-rlx-green">{formatInr(selected.priceInr)}</p>
            </div>
            <p className="mt-0.5 text-[11px] uppercase tracking-widest text-slate-400">
              {packageTypeLabel(selected.packageType)} · {watchServiceKindLabel(selected.serviceType)} ·{" "}
              {(selected.spareIds ?? []).length} spare{(selected.spareIds ?? []).length === 1 ? "" : "s"}
            </p>
            {(selected.spareNames ?? []).length > 0 ? (
              <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                {selected.spareNames.join(" · ")}
              </p>
            ) : null}
          </div>
        ) : packages.length === 0 ? (
          <p className="text-sm text-slate-500">No packages for {watchBrand}.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={disabled || lockSelection}
                onClick={() => setServiceType("")}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest transition ${
                  serviceType === ""
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Any
              </button>
              {WATCH_SERVICE_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  disabled={disabled || lockSelection}
                  onClick={() => {
                    const next = serviceType === k.value ? "" : k.value;
                    setServiceType(next);
                  }}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest transition ${
                    serviceType === k.value
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {forType.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled || lockSelection}
                  onClick={() => applyPackage(p.id)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">{packageDisplayName(p)}</p>
                    <p className="text-sm font-semibold tabular-nums text-rlx-green">{formatInr(p.priceInr)}</p>
                  </div>
                  <p className="mt-0.5 text-[11px] uppercase tracking-widest text-slate-400">
                    {packageTypeLabel(p.packageType)} · {watchServiceKindLabel(p.serviceType)} · {p.spares.length} spare
                    {p.spares.length === 1 ? "" : "s"}
                  </p>
                  {p.spares.length > 0 ? (
                    <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                      {p.spares.map((s) => s.name).join(" · ")}
                    </p>
                  ) : null}
                </button>
              ))}
            </div>
            {forType.length === 0 ? (
              <p className="text-xs text-slate-400">No {watchServiceKindLabel(serviceType)} packages for this brand.</p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
