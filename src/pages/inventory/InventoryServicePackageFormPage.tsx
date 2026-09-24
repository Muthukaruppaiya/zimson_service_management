import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { InventoryBreadcrumb } from "../../components/inventory/InventoryBreadcrumb";
import { SearchableCombobox } from "../../components/service/SearchableCombobox";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProcessSuccessModal } from "../../components/ui/ProcessSuccessModal";
import { useAuth } from "../../context/AuthContext";
import { useBrands } from "../../context/BrandsContext";
import { useSpares } from "../../context/SparesContext";
import { ApiError, apiJson, useApiMode } from "../../lib/api";
import { formatInr } from "../../lib/formatInr";
import { sanitizeDecimalInput } from "../../lib/inputSanitize";
import {
  DEFAULT_PACKAGE_TYPES,
  isValidPackageName,
  packageTypeLabel,
  packageTypesMatch,
  sanitizePackageNameInput,
  watchServiceKindLabel,
  WATCH_SERVICE_KINDS,
} from "../../lib/servicePackage";
import type { ServicePackage, ServicePackageSpare, ServicePackageType, WatchServiceKind } from "../../types/servicePackage";

const inputCls =
  "mt-1 w-full border border-rlx-rule bg-white px-3 py-2.5 text-sm text-stone-800 outline-none transition-colors focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/30";
const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-stone-500";
const SPARE_UOM = "Nos";
const spareFieldCls =
  "mt-1 w-full border border-rlx-rule bg-white px-2.5 py-2 text-sm font-semibold tabular-nums text-stone-800 outline-none transition-colors focus:border-rlx-green focus:ring-1 focus:ring-rlx-green/30";

function spareCatalogPrice(spare: { sellingPriceInr?: number | null; mrpInr?: number | null }): number {
  return Number(spare.sellingPriceInr ?? spare.mrpInr ?? 0) || 0;
}

function spareMrp(spare: { mrpInr?: number | null; sellingPriceInr?: number | null }): number {
  return Number(spare.mrpInr ?? spare.sellingPriceInr ?? 0) || 0;
}

function SpecCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">{label}</p>
      <p className={`mt-0.5 truncate text-sm text-stone-800 ${mono ? "font-mono" : "font-semibold"}`}>
        {value.trim() || "—"}
      </p>
    </div>
  );
}

function SectionHeader({ title }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-rlx-rule bg-rlx-green px-5 py-4">
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">{title}</h3>
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
  const { activeSpares } = useSpares();
  const canManage = user?.role === "super_admin" || user?.role === "admin";
  const canManageTypes = user?.role === "super_admin";

  const [brand, setBrand] = useState("");
  const [serviceType, setServiceType] = useState<WatchServiceKind>("quartz");
  const [packageName, setPackageName] = useState("");
  const [packageType, setPackageType] = useState("");
  const [packageTypes, setPackageTypes] = useState<ServicePackageType[]>([]);
  const [price, setPrice] = useState("");
  const [spares, setSpares] = useState<ServicePackageSpare[]>([]);
  const [sparePick, setSparePick] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [createdAck, setCreatedAck] = useState<{ name: string; brand: string } | null>(null);

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
        setPackageName(sanitizePackageNameInput(pkg.name || ""));
        setPackageType(pkg.packageType);
        setPrice(String(pkg.priceInr ?? ""));
        setSpares(
          (pkg.spares ?? []).map((s) => ({
            ...s,
            qty: Number(s.qty) || 1,
            salePriceInr: Number(s.salePriceInr) || 0,
          })),
        );
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
    if (!api) return;
    let cancelled = false;
    void apiJson<{ types: ServicePackageType[] }>("/api/catalog/service-package-types")
      .then((data) => {
        if (cancelled) return;
        const types = data.types ?? [];
        setPackageTypes(types);
        setPackageType((current) => {
          if (!current) return current;
          const match = types.find((t) => packageTypesMatch(t.name, current));
          return match?.name ?? current;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setPackageTypes(
          DEFAULT_PACKAGE_TYPES.map((t, i) => ({
            id: `fallback-${i}`,
            name: packageTypeLabel(t),
            isActive: true,
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const brandOptions = useMemo(
    () => brands.filter((b) => b.isActive).map((b) => ({ value: b.name, label: b.name })),
    [brands],
  );
  const spareById = useMemo(() => new Map(activeSpares.map((s) => [s.id, s])), [activeSpares]);
  const spareOptions = useMemo(
    () =>
      activeSpares
        .filter((s) => !spares.some((x) => x.spareId === s.id))
        .map((s) => {
          const price = spareCatalogPrice(s);
          const mrp = spareMrp(s);
          const hintParts = [
            s.brand?.trim(),
            s.sku,
            s.altSku ? `alt ${s.altSku}` : "",
            s.description?.trim(),
            `UOM ${SPARE_UOM}`,
            mrp ? `MRP ${formatInr(mrp)}` : "",
            price ? `Price ${formatInr(price)}` : "",
          ].filter(Boolean);
          return {
            value: s.id,
            label: s.name + (s.altName ? ` (${s.altName})` : ""),
            hint: hintParts.join(" · "),
            searchText: [
              s.sku,
              s.altSku,
              s.name,
              s.altName,
              s.brand,
              s.description,
              s.category,
              s.modelNo,
              s.caliber,
              SPARE_UOM,
              String(s.mrpInr ?? ""),
              String(s.sellingPriceInr ?? ""),
            ]
              .filter(Boolean)
              .join(" "),
          };
        }),
    [activeSpares, spares],
  );

  function addSpare(spareId: string) {
    const spare = activeSpares.find((s) => s.id === spareId);
    if (!spare) return;
    setSpares((prev) =>
      prev.some((x) => x.spareId === spare.id)
        ? prev
        : [...prev, {
            spareId: spare.id,
            name: spare.name,
            sku: spare.sku,
            qty: 1,
            salePriceInr: Number(spare.sellingPriceInr ?? spare.mrpInr ?? 0) || 0,
          }],
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
    const title = sanitizePackageNameInput(packageName).trim();
    if (!isValidPackageName(title)) {
      setErr("Package name is required. Use letters and numbers only, with no special characters.");
      return;
    }
    if (!packageType.trim()) {
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
    if (spares.some((s) => !Number.isFinite(s.salePriceInr) || s.salePriceInr < 0)) {
      setErr("Each spare needs a sale price of 0 or more.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        brand: brand.trim(),
        serviceType,
        name: title,
        packageType,
        priceInr,
        spares: spares.map((s) => ({
          spareId: s.spareId,
          qty: s.qty || 1,
          salePriceInr: Number(s.salePriceInr) || 0,
        })),
      };
      if (isEdit && editId) {
        await apiJson(`/api/catalog/service-packages/${encodeURIComponent(editId)}`, {
          method: "PATCH",
          json: payload,
        });
        navigate("/inventory/service-packages", { state: { saved: "updated" } });
      } else {
        await apiJson("/api/catalog/service-packages", { method: "POST", json: payload });
        setCreatedAck({ name: title, brand: brand.trim() });
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
        description=""
        actions={
          <div className="flex flex-wrap gap-2">
            {canManageTypes ? (
              <Link
                to="/inventory/service-package-types"
                className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 transition hover:bg-stone-50"
              >
                Package types
              </Link>
            ) : null}
            <Link
              to="/inventory/service-packages"
              className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 transition hover:bg-stone-50"
            >
              ← Back to list
            </Link>
          </div>
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
                <label className={`${labelCls} sm:col-span-2`}>
                  Package name *
                  <input
                    className={inputCls}
                    value={packageName}
                    maxLength={80}
                    onChange={(e) => setPackageName(sanitizePackageNameInput(e.target.value))}
                    placeholder="Title for this package"
                  />
                </label>
                <label className={labelCls}>
                  Brand *
                  <select
                    className={inputCls}
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
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
                    value={
                      packageTypes.find((t) => packageTypesMatch(t.name, packageType))?.name ?? packageType
                    }
                    onChange={(e) => setPackageType(e.target.value)}
                  >
                    <option value="">Select package type…</option>
                    {packageTypes.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                    {packageType && !packageTypes.some((t) => packageTypesMatch(t.name, packageType)) ? (
                      <option value={packageType}>{packageTypeLabel(packageType)}</option>
                    ) : null}
                  </select>
                </label>
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
              <SectionHeader title="Spare details" />
              <div className="p-5">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <label className={`${labelCls} min-w-0 flex-1`}>
                    Add spare
                    <SearchableCombobox
                      id="pkg-spare-pick"
                      value={sparePick}
                      options={spareOptions}
                      placeholder={
                        spareOptions.length === 0
                          ? "No spares left to add"
                          : "Search by name, SKU, brand, description, MRP or price…"
                      }
                      inputClass={inputCls}
                      required={false}
                      onChange={(id) => {
                        if (id) addSpare(id);
                      }}
                    />
                  </label>
                  <p className="mb-2.5 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-stone-400">
                    {spares.length} spare{spares.length === 1 ? "" : "s"}
                  </p>
                </div>
                {spares.length === 0 ? (
                  <p className="border border-dashed border-rlx-rule bg-stone-50 px-4 py-8 text-center text-sm text-stone-400">
                    No spares in this package yet. Search and add from the catalogue.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {spares.map((s, idx) => {
                      const catalog = spareById.get(s.spareId);
                      const brandName = catalog?.brand?.trim() || "";
                      const description = catalog?.description?.trim() || "";
                      const mrp = catalog ? spareMrp(catalog) : 0;
                      const catalogPrice = catalog ? spareCatalogPrice(catalog) : 0;
                      return (
                        <div key={s.spareId} className="overflow-hidden border border-rlx-rule bg-white">
                          <div className="flex flex-wrap items-end gap-3 px-4 py-3">
                            <div className="mb-px flex h-10 w-9 shrink-0 items-center justify-center bg-rlx-green text-sm font-bold text-white">
                              {idx + 1}
                            </div>
                            <div className="min-w-[12rem] flex-1">
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">Spare</p>
                              <p className="mt-1 truncate text-sm font-semibold text-stone-900">{s.name}</p>
                              <p className="font-mono text-[11px] text-stone-400">{s.sku || "—"}</p>
                            </div>
                            <label className="w-20 shrink-0">
                              <span className="block text-[10px] font-semibold uppercase tracking-widest text-stone-400">Qty</span>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                className={spareFieldCls}
                                value={s.qty}
                                onChange={(e) => {
                                  const n = Math.max(1, Math.round(Number(e.target.value) || 1));
                                  setSpares((prev) => prev.map((x) => (x.spareId === s.spareId ? { ...x, qty: n } : x)));
                                }}
                              />
                            </label>
                            <label className="w-28 shrink-0">
                              <span className="block text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                                Sale price
                              </span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                className={spareFieldCls}
                                value={Number.isFinite(s.salePriceInr) ? s.salePriceInr : ""}
                                onChange={(e) => {
                                  const n = Number.parseFloat(e.target.value);
                                  setSpares((prev) =>
                                    prev.map((x) =>
                                      x.spareId === s.spareId
                                        ? { ...x, salePriceInr: Number.isFinite(n) && n >= 0 ? n : 0 }
                                        : x,
                                    ),
                                  );
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              className="mb-px h-10 shrink-0 px-3 text-[11px] font-semibold uppercase tracking-widest text-stone-400 hover:text-rose-700"
                              onClick={() => setSpares((prev) => prev.filter((x) => x.spareId !== s.spareId))}
                            >
                              Remove
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-rlx-rule bg-stone-50/90 px-4 py-3 sm:grid-cols-3 lg:grid-cols-5">
                            <SpecCell label="Brand" value={brandName} />
                            <SpecCell label="Description" value={description} />
                            <SpecCell label="UOM" value={SPARE_UOM} />
                            <SpecCell label="MRP" value={mrp ? formatInr(mrp) : ""} />
                            <SpecCell label="Price" value={catalogPrice ? formatInr(catalogPrice) : ""} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Package name</p>
              <p className="mt-1 text-lg font-semibold text-stone-900">{packageName.trim() || "—"}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Brand</p>
                  <p className="mt-1 text-sm font-semibold">{brand || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Service type</p>
                  <p className="mt-1 text-sm font-semibold">{watchServiceKindLabel(serviceType)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Package type</p>
                  <p className="mt-1 text-sm font-semibold">{packageType ? packageTypeLabel(packageType) : "—"}</p>
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
                      <span className="shrink-0 tabular-nums text-stone-500">
                        ×{s.qty} · {formatInr(s.salePriceInr || 0)}
                      </span>
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

      {createdAck ? (
        <ProcessSuccessModal
          open
          title="Package created"
          description={`${createdAck.brand} · ${createdAck.name}`}
          onBackdropClick={() => setCreatedAck(null)}
          actions={
            <>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-rlx-rule bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 sm:w-auto"
                onClick={() => navigate("/inventory/service-packages")}
              >
                View list
              </button>
              <button
                type="button"
                className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-rlx-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rlx-green/90 sm:w-auto"
                onClick={() => {
                  setCreatedAck(null);
                  setSpares([]);
                  setSparePick("");
                  setPrice("");
                  setErr(null);
                }}
              >
                Create another
              </button>
            </>
          }
        >
          <div className="rounded-xl border-2 border-rlx-green/30 bg-rlx-green/5 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rlx-green">Package name</p>
            <p className="mt-1 font-mono text-2xl font-bold text-stone-900">{createdAck.name}</p>
          </div>
        </ProcessSuccessModal>
      ) : null}
    </div>
  );
}
