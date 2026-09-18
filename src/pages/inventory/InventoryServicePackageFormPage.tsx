import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { SearchableCombobox } from "../../components/service/SearchableCombobox";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useBrands } from "../../context/BrandsContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { formatInr } from "../../lib/formatInr";
import { sanitizeDecimalInput } from "../../lib/inputSanitize";
import {
  DEFAULT_PACKAGE_TYPES,
  packageTypeLabel,
  watchServiceKindLabel,
  WATCH_SERVICE_KINDS,
} from "../../lib/servicePackage";
import type { ServicePackage, ServicePackageSpare, WatchServiceKind } from "../../types/servicePackage";
import type { SparePart } from "../../types/spare";

const inputCls =
  "mt-1 w-full border border-rlx-rule bg-white px-3 py-2.5 text-sm text-stone-800 outline-none transition-colors focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/30";
const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-stone-500";

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-rlx-rule bg-rlx-green px-5 py-4">
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-[11px] text-white/55">{subtitle}</p> : null}
    </div>
  );
}

export function InventoryServicePackageFormPage() {
  const { id: editId } = useParams<{ id?: string }>();
  const isEdit = Boolean(editId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const api = useApiMode();
  const { brands } = useBrands();
  const canManage = user?.role === "super_admin" || user?.role === "admin";

  const [brand, setBrand] = useState("");
  const [serviceType, setServiceType] = useState<WatchServiceKind>("quartz");
  const [packageType, setPackageType] = useState("complete");
  const [customType, setCustomType] = useState("");
  const [price, setPrice] = useState("");
  const [spares, setSpares] = useState<ServicePackageSpare[]>([]);
  const [sparePick, setSparePick] = useState("");
  const [brandSpares, setBrandSpares] = useState<SparePart[]>([]);
  const [brandSparesLoading, setBrandSparesLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  const typeSelectValue = DEFAULT_PACKAGE_TYPES.includes(packageType as (typeof DEFAULT_PACKAGE_TYPES)[number])
    ? packageType
    : "custom";
  const resolvedType = typeSelectValue === "custom" ? customType : packageType;

  useEffect(() => {
    if (!isEdit || !editId || !api) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void apiJson<{ package: ServicePackage }>(`/api/catalog/service-packages/${encodeURIComponent(editId)}`)
      .then((data) => {
        if (cancelled) return;
        const pkg = data.package;
        setBrand(pkg.brand);
        setServiceType(pkg.serviceType);
        if (DEFAULT_PACKAGE_TYPES.includes(pkg.packageType as (typeof DEFAULT_PACKAGE_TYPES)[number])) {
          setPackageType(pkg.packageType);
          setCustomType("");
        } else {
          setPackageType("custom");
          setCustomType(pkg.packageType);
        }
        setPrice(String(pkg.priceInr ?? ""));
        setSpares(pkg.spares ?? []);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof ApiError ? e.message : "Could not load package.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, editId, isEdit]);

  useEffect(() => {
    const selected = brand.trim();
    if (!selected || !api) {
      setBrandSpares([]);
      setBrandSparesLoading(false);
      return;
    }
    let cancelled = false;
    setBrandSparesLoading(true);
    void apiJson<{ spares: SparePart[] }>(
      `/api/catalog/spares-by-brand?brand=${encodeURIComponent(selected)}`,
    )
      .then((data) => {
        if (!cancelled) setBrandSpares(data.spares ?? []);
      })
      .catch(() => {
        if (!cancelled) setBrandSpares([]);
      })
      .finally(() => {
        if (!cancelled) setBrandSparesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, brand]);

  const brandOptions = useMemo(
    () => brands.filter((b) => b.isActive).map((b) => ({ value: b.name, label: b.name })),
    [brands],
  );
  const spareOptions = useMemo(
    () =>
      brandSpares
        .filter((s) => !spares.some((x) => x.spareId === s.id))
        .map((s) => ({
          value: s.id,
          label: `${s.sku}${s.altSku ? ` / ${s.altSku}` : ""}${s.brand ? ` · ${s.brand}` : ""} — ${s.name}${s.altName ? ` (${s.altName})` : ""}`,
        })),
    [brandSpares, spares],
  );

  function addSpare(spareId: string) {
    const spare = brandSpares.find((s) => s.id === spareId);
    if (!spare) return;
    setSpares((prev) =>
      prev.some((x) => x.spareId === spare.id)
        ? prev
        : [...prev, { spareId: spare.id, name: spare.name, sku: spare.sku, qty: 1 }],
    );
    setSparePick("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setErr(null);
    if (!brand.trim()) {
      setErr("Brand is required.");
      return;
    }
    if (!resolvedType.trim()) {
      setErr("Package type is required.");
      return;
    }
    const priceInr = Number.parseFloat(price);
    if (!Number.isFinite(priceInr) || priceInr <= 0) {
      setErr("Enter a valid package price greater than 0.");
      return;
    }
    if (spares.length === 0) {
      setErr("Add at least one spare — a package is a collection of spares.");
      return;
    }
    if (spares.some((s) => !Number.isFinite(s.qty) || s.qty < 1)) {
      setErr("Each package spare needs quantity 1 or more.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        brand: brand.trim(),
        serviceType,
        packageType: resolvedType,
        priceInr,
        spares: spares.map((s) => ({ spareId: s.spareId, qty: s.qty || 1 })),
      };
      if (isEdit && editId) {
        await apiJson(`/api/catalog/service-packages/${encodeURIComponent(editId)}`, {
          method: "PATCH",
          json: payload,
        });
        navigate("/inventory/service-packages", { state: { saved: "updated" } });
      } else {
        await apiJson("/api/catalog/service-packages", { method: "POST", json: payload });
        navigate("/inventory/service-packages", { state: { saved: "created" } });
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not save package.");
    } finally {
      setBusy(false);
    }
  }

  const previewPrice = Number.parseFloat(price);
  const previewOk = Number.isFinite(previewPrice) && previewPrice > 0;

  if (!canManage) {
    return (
      <div>
        <InventoryBreadcrumb current="Service packages" />
        <p className="text-sm text-stone-600">Only HO admins can add or edit service packages.</p>
      </div>
    );
  }

  return (
    <div>
      <InventoryBreadcrumb
        current={isEdit ? "Edit package" : "Add package"}
        parent={{ label: "Service packages", to: "/inventory/service-packages" }}
      />
      <PageHeader
        title={isEdit ? "Edit service package" : "Add service package"}
        description="Brand, Quartz/Mechanical, Complete/Partial, spare list, and one package price."
        actions={
          <Link
            to="/inventory/service-packages"
            className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 transition hover:bg-stone-50"
          >
            ← Back to list
          </Link>
        }
      />

      {err ? <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">✕ {err}</div> : null}

      {loading ? (
        <div className="border border-rlx-rule bg-white px-5 py-10 text-center text-sm text-stone-400">Loading…</div>
      ) : (
        <form onSubmit={(e) => void save(e)} noValidate className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-5">
            <section className="border border-rlx-rule bg-white shadow-sm">
              <SectionHeader title="Package details" subtitle="Same columns as the brand rate card." />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <label className={labelCls}>
                  Brand *
                  <select
                    className={inputCls}
                    value={brand}
                    onChange={(e) => {
                      setBrand(e.target.value);
                      setSpares([]);
                      setSparePick("");
                    }}
                  >
                    <option value="">Select brand…</option>
                    {brandOptions.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>
                  Service type *
                  <select
                    className={inputCls}
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value as WatchServiceKind)}
                  >
                    {WATCH_SERVICE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>
                  Package type *
                  <select
                    className={inputCls}
                    value={typeSelectValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "custom") setPackageType("custom");
                      else {
                        setPackageType(v);
                        setCustomType("");
                      }
                    }}
                  >
                    {DEFAULT_PACKAGE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {packageTypeLabel(t)}
                      </option>
                    ))}
                    <option value="custom">Custom type…</option>
                  </select>
                </label>
                {typeSelectValue === "custom" ? (
                  <label className={labelCls}>
                    Custom type *
                    <input
                      className={inputCls}
                      value={customType}
                      onChange={(e) => setCustomType(e.target.value)}
                      placeholder="e.g. overhaul"
                    />
                  </label>
                ) : null}
                <label className={labelCls}>
                  Package price (₹) *
                  <input
                    className={inputCls}
                    value={price}
                    onChange={(e) => setPrice(sanitizeDecimalInput(e.target.value))}
                    placeholder="15000"
                  />
                </label>
              </div>
            </section>

            <section className="border border-rlx-rule bg-white shadow-sm">
              <SectionHeader
                title="Spare details"
                subtitle={
                  brand.trim()
                    ? `Only spares priced for ${brand} in the catalogue.`
                    : "Choose a brand first. Only that brand’s catalogue spares will appear."
                }
              />
              <div className="p-5">
                <div className="max-w-xl">
                  <SearchableCombobox
                    id="pkg-spare-pick"
                    value={sparePick}
                    options={spareOptions}
                    placeholder={
                      !brand.trim()
                        ? "Select a brand first…"
                        : brandSparesLoading
                          ? `Loading ${brand} spares…`
                          : spareOptions.length === 0
                            ? `No ${brand} spares left to add`
                            : "Search spare by SKU or name…"
                    }
                    inputClass={inputCls}
                    required={false}
                    disabled={!brand.trim() || brandSparesLoading}
                    onChange={(id) => {
                      if (id) addSpare(id);
                    }}
                  />
                </div>
                {spares.length === 0 ? (
                  <p className="mt-4 border border-dashed border-rlx-rule bg-stone-50 px-4 py-8 text-center text-sm text-stone-400">
                    No spares in this package yet.
                  </p>
                ) : (
                  <ul className="mt-4 divide-y divide-rlx-rule border border-rlx-rule">
                    {spares.map((s, idx) => (
                      <li key={s.spareId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className="w-6 text-[11px] font-bold text-stone-400">{idx + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-stone-800">{s.name}</span>
                          <span className="font-mono text-[11px] text-stone-400">{s.sku}</span>
                        </span>
                        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-stone-400">
                          Qty
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="w-16 border border-rlx-rule px-2 py-1.5 text-sm text-stone-800 outline-none focus:border-rlx-green"
                            value={s.qty}
                            onChange={(e) => {
                              const n = Math.max(1, Math.round(Number(e.target.value) || 1));
                              setSpares((prev) => prev.map((x) => (x.spareId === s.spareId ? { ...x, qty: n } : x)));
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="text-[11px] font-semibold uppercase tracking-widest text-rose-700 hover:underline"
                          onClick={() => setSpares((prev) => prev.filter((x) => x.spareId !== s.spareId))}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy}
                className="bg-rlx-green px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-rlx-green/90 disabled:opacity-50"
              >
                {busy ? "Saving…" : isEdit ? "Update package" : "Save package"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/inventory/service-packages")}
                className="border border-rlx-rule bg-white px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-stone-600 transition hover:bg-stone-50"
              >
                Cancel
              </button>
            </div>
          </div>

          <aside className="h-fit border border-rlx-rule bg-white shadow-sm xl:sticky xl:top-4">
            <SectionHeader title="Rate card preview" subtitle="How this package will appear." />
            <div className="p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Brand</p>
              <p className="mt-1 text-lg font-semibold text-stone-900">{brand || "—"}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Service type</p>
                  <p className="mt-1 text-sm font-semibold">{watchServiceKindLabel(serviceType)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Package</p>
                  <p className="mt-1 text-sm font-semibold">{packageTypeLabel(resolvedType) || "—"}</p>
                </div>
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Spare details</p>
              {spares.length === 0 ? (
                <p className="mt-2 text-sm text-stone-400">None added</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {spares.map((s) => (
                    <li key={s.spareId} className="flex justify-between gap-2 text-sm text-stone-700">
                      <span>{s.name}</span>
                      <span className="tabular-nums text-stone-400">×{s.qty}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-5 border-t border-rlx-rule pt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Package price</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-rlx-green">
                  {previewOk ? formatInr(previewPrice) : "—"}
                </p>
              </div>
            </div>
          </aside>
        </form>
      )}
    </div>
  );
}
