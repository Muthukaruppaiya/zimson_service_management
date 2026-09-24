import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../../lib/api";
import { formatInr } from "../../lib/formatInr";
import { inputClass } from "../../lib/uiForm";
import {
  packageDisplayName,
  packageTypeLabel,
  snapshotFromPackage,
  watchServiceKindLabel,
  WATCH_SERVICE_KINDS,
} from "../../lib/servicePackage";
import type { ServicePackage, SrfServicePackageSnapshot, WatchServiceKind } from "../../types/servicePackage";

type WorkAsPackage = "" | "yes" | "no";

type Props = {
  watchBrand: string;
  workAsPackage: WorkAsPackage;
  onWorkAsPackageChange: (value: WorkAsPackage) => void;
  selected: SrfServicePackageSnapshot | null;
  onSelectedChange: (pkg: SrfServicePackageSnapshot | null) => void;
};

const fieldClass = `${inputClass} ui-field--compact`;

function packageOptionLabel(p: ServicePackage): string {
  return `${packageDisplayName(p)} · ${packageTypeLabel(p.packageType)} · ${watchServiceKindLabel(p.serviceType)} · ${formatInr(p.priceInr)}`;
}

export function SrfBookingPackageField({
  watchBrand,
  workAsPackage,
  onWorkAsPackageChange,
  selected,
  onSelectedChange,
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

  const options = useMemo(
    () =>
      forType.map((p) => ({
        value: p.id,
        label: packageOptionLabel(p),
      })),
    [forType],
  );

  function pickPackage(id: string) {
    if (!id) {
      onSelectedChange(null);
      return;
    }
    const pkg = packages.find((p) => p.id === id);
    if (!pkg) {
      onSelectedChange(null);
      return;
    }
    setServiceType(pkg.serviceType);
    onSelectedChange(snapshotFromPackage(pkg));
  }

  return (
    <div className="md:col-span-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
      <label className="block min-w-0 text-xs font-medium text-stone-600">
        <span className="mb-0.5 block">Work as a package?</span>
        <span className="mt-1 inline-flex w-full rounded-lg border border-rlx-rule bg-white p-0.5">
          {(
            [
              { value: "yes" as const, label: "Yes" },
              { value: "no" as const, label: "No" },
            ]
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onWorkAsPackageChange(opt.value)}
              className={`h-8 min-w-0 flex-1 rounded-md text-xs font-semibold transition ${
                workAsPackage === opt.value
                  ? "bg-rlx-green text-white"
                  : "text-stone-600 hover:bg-stone-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </span>
      </label>

      {workAsPackage === "yes" ? (
        <>
          <label className="block min-w-0 text-xs font-medium text-stone-600">
            <span className="mb-0.5 block">Service type</span>
            <select
              className={fieldClass}
              value={serviceType}
              onChange={(e) => {
                const next = e.target.value as WatchServiceKind | "";
                setServiceType(next);
                if (selected && next && selected.serviceType !== next) {
                  onSelectedChange(null);
                }
              }}
            >
              <option value="">Any</option>
              {WATCH_SERVICE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 text-xs font-medium text-stone-600">
            <span className="mb-0.5 block">Package</span>
            <select
              id="srf-booking-package"
              className={fieldClass}
              value={selected?.id ?? ""}
              onChange={(e) => pickPackage(e.target.value)}
              disabled={!watchBrand.trim() || loading || options.length === 0}
              required
            >
              <option value="">
                {!watchBrand.trim()
                  ? "Select a brand first…"
                  : loading
                    ? "Loading packages…"
                    : options.length === 0
                      ? "No packages"
                      : "Select package…"}
              </option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
    </div>
  );
}
