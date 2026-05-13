import { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import {
  useRegions,
  type RegionAddressBlock,
  type RegionUpsertPayload,
  type StoreUpsertPayload,
  type WarehouseUpsertPayload,
} from "../context/RegionsContext";
import type { SeedRegion, SeedStore, SeedWarehouse } from "../data/seed";
import { ApiError } from "../lib/api";

const inputClass =
  "mt-1 w-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-rlx-green focus:ring-1 focus:ring-rlx-green placeholder:text-stone-400";

const labelClass = "block text-xs font-semibold uppercase tracking-wide text-stone-500";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-rlx-green">
      <span className="h-px flex-1 bg-rlx-rule" />
      {children}
      <span className="h-px flex-1 bg-rlx-rule" />
    </p>
  );
}

// ── Region form ──────────────────────────────────────────────────────────────

type RegionDraft = {
  name: string;
  regionCode: string;
  gst: string;
  pan: string;
  email: string;
  phone: string;
  // Structured address fields
  addrDoorNo: string;
  addrStreet: string;
  addrCity: string;
  addrDistrict: string;
  addrState: string;
  addrCountry: string;
  addrPincode: string;
};

function emptyRegionDraft(): RegionDraft {
  return {
    name: "", regionCode: "", gst: "", pan: "", email: "", phone: "",
    addrDoorNo: "", addrStreet: "", addrCity: "",
    addrDistrict: "", addrState: "", addrCountry: "India", addrPincode: "",
  };
}

function addressBlockFromDraft(d: RegionDraft): RegionAddressBlock {
  return {
    doorNo: d.addrDoorNo.trim(),
    street: d.addrStreet.trim(),
    city: d.addrCity.trim(),
    district: d.addrDistrict.trim(),
    state: d.addrState.trim(),
    country: d.addrCountry.trim() || "India",
    pincode: d.addrPincode.trim(),
  };
}

function composeAddressText(a: RegionAddressBlock): string {
  return [a.doorNo, a.street, a.city, a.district, a.state, a.country, a.pincode]
    .filter(Boolean).join(", ");
}

function regionToDraft(r: SeedRegion): RegionDraft {
  const a = r.addressJson;
  return {
    name: r.name,
    regionCode: r.regionCode ?? "",
    gst: r.gst ?? "",
    pan: r.pan ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    addrDoorNo: a?.doorNo ?? "",
    addrStreet: a?.street ?? "",
    addrCity: a?.city ?? "",
    addrDistrict: a?.district ?? "",
    addrState: a?.state ?? "",
    addrCountry: a?.country ?? "India",
    addrPincode: a?.pincode ?? "",
  };
}

function draftToRegionPayload(d: RegionDraft): RegionUpsertPayload {
  const addressJson = addressBlockFromDraft(d);
  const address = composeAddressText(addressJson);
  return {
    name: d.name.trim(),
    regionCode: d.regionCode.trim().toUpperCase() || undefined,
    address: address || undefined,
    addressJson,
    gst: d.gst.trim().toUpperCase() || undefined,
    pan: d.pan.trim().toUpperCase() || undefined,
    email: d.email.trim() || undefined,
    phone: d.phone.trim() || undefined,
  };
}

// India Post PIN lookup response shape
type PinApiPostOffice = {
  Name: string;
  District: string;
  State: string;
  Country: string;
  Block: string;
  Region: string;
};
type PinApiResult = { Status: string; PostOffice: PinApiPostOffice[] | null };

async function fetchPincodeData(pin: string): Promise<PinApiPostOffice[]> {
  const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
  if (!res.ok) throw new Error("Network error");
  const data = (await res.json()) as PinApiResult[];
  const result = data[0];
  if (!result || result.Status !== "Success" || !result.PostOffice?.length) {
    throw new Error("PIN code not found");
  }
  return result.PostOffice;
}

function RegionFormFields({
  draft,
  onChange,
}: {
  draft: RegionDraft;
  onChange: (patch: Partial<RegionDraft>) => void;
}) {
  const [pinStatus, setPinStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [pinError, setPinError] = useState("");

  function handlePincodeChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    onChange({ addrPincode: digits });
    if (digits.length === 6) {
      setPinStatus("loading");
      setPinError("");
      fetchPincodeData(digits)
        .then((offices) => {
          const po = offices[0];
          onChange({
            addrCity: po.Block !== "NA" ? po.Block : po.Region,
            addrDistrict: po.District,
            addrState: po.State,
            addrCountry: po.Country,
          });
          setPinStatus("ok");
        })
        .catch((e: unknown) => {
          setPinError(e instanceof Error ? e.message : "Could not fetch PIN data");
          setPinStatus("error");
        });
    } else {
      setPinStatus("idle");
      setPinError("");
    }
  }

  return (
    <div className="space-y-4">
      {/* Name + Code */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Region / Office Name *
          <input
            className={inputClass}
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Chennai Regional Office"
          />
        </label>
        <label className={labelClass}>
          Region Code *
          <input
            className={inputClass}
            value={draft.regionCode}
            onChange={(e) => onChange({ regionCode: e.target.value.toUpperCase() })}
            placeholder="e.g. CHN, CBE, BLR"
            maxLength={10}
          />
        </label>
      </div>

      {/* GST + PAN */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          GST Number
          <input
            className={inputClass}
            value={draft.gst}
            onChange={(e) => onChange({ gst: e.target.value.toUpperCase() })}
            placeholder="15-character GSTIN"
            maxLength={15}
          />
        </label>
        <label className={labelClass}>
          PAN Number
          <input
            className={inputClass}
            value={draft.pan}
            onChange={(e) => onChange({ pan: e.target.value.toUpperCase() })}
            placeholder="10-character PAN"
            maxLength={10}
          />
        </label>
      </div>

      {/* Email + Phone */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Email ID
          <input
            type="email"
            className={inputClass}
            value={draft.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="office@zimson.com"
          />
        </label>
        <label className={labelClass}>
          Telephone / Phone
          <input
            className={inputClass}
            value={draft.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="+91 44 0000 0000"
          />
        </label>
      </div>

      {/* ── Structured Address ─────────────────────────────────────── */}
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-rlx-green">
          Office Address
        </p>
        <div className="border border-rlx-rule bg-stone-50 p-3 space-y-3">
          {/* Door No + Street */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Door / Flat No
              <input
                className={inputClass}
                value={draft.addrDoorNo}
                onChange={(e) => onChange({ addrDoorNo: e.target.value })}
                placeholder="12 / A"
              />
            </label>
            <label className={labelClass}>
              Street / Area
              <input
                className={inputClass}
                value={draft.addrStreet}
                onChange={(e) => onChange({ addrStreet: e.target.value })}
                placeholder="T. Nagar, Mount Road…"
              />
            </label>
          </div>

          {/* PIN — placed before city/district/state so auto-fill is visible */}
          <div>
            <label className={`${labelClass} relative`}>
              <span className="flex items-center gap-2">
                PIN / Postal Code
                {pinStatus === "loading" && (
                  <span className="text-[10px] font-normal text-stone-400 animate-pulse">Fetching location…</span>
                )}
                {pinStatus === "ok" && (
                  <span className="text-[10px] font-semibold text-rlx-green">✓ Location filled</span>
                )}
                {pinStatus === "error" && (
                  <span className="text-[10px] font-semibold text-red-500">{pinError}</span>
                )}
              </span>
              <input
                className={`${inputClass} ${pinStatus === "loading" ? "opacity-60" : ""}`}
                value={draft.addrPincode}
                onChange={(e) => handlePincodeChange(e.target.value)}
                placeholder="600017  — auto-fills city, district, state"
                maxLength={10}
              />
            </label>
          </div>

          {/* City + District — auto-filled from PIN */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              City / Town
              <input
                className={inputClass}
                value={draft.addrCity}
                onChange={(e) => onChange({ addrCity: e.target.value })}
                placeholder="Chennai"
              />
            </label>
            <label className={labelClass}>
              District
              <input
                className={inputClass}
                value={draft.addrDistrict}
                onChange={(e) => onChange({ addrDistrict: e.target.value })}
                placeholder="Chennai"
              />
            </label>
          </div>

          {/* State + Country — auto-filled from PIN */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              State
              <input
                className={inputClass}
                value={draft.addrState}
                onChange={(e) => onChange({ addrState: e.target.value })}
                placeholder="Tamil Nadu"
              />
            </label>
            <label className={labelClass}>
              Country
              <input
                className={inputClass}
                value={draft.addrCountry}
                onChange={(e) => onChange({ addrCountry: e.target.value })}
                placeholder="India"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Store form ───────────────────────────────────────────────────────────────

type StoreFormDraft = {
  name: string;
  invoiceDisplayName: string;
  invoiceTagline: string;
  invoiceAddress: string;
  invoicePhone: string;
  invoiceEmail: string;
  invoiceGstin: string;
  invoiceLegalEntityName: string;
  invoiceTerms: string;
  invoiceNumberStoreCode: string;
};

function emptyStoreDraft(): StoreFormDraft {
  return {
    name: "", invoiceDisplayName: "", invoiceTagline: "", invoiceAddress: "",
    invoicePhone: "", invoiceEmail: "", invoiceGstin: "", invoiceLegalEntityName: "",
    invoiceTerms: "", invoiceNumberStoreCode: "",
  };
}

function seedStoreToDraft(s: SeedStore): StoreFormDraft {
  return {
    name: s.name,
    invoiceDisplayName: s.invoiceDisplayName ?? "",
    invoiceTagline: s.invoiceTagline ?? "",
    invoiceAddress: s.invoiceAddress ?? "",
    invoicePhone: s.invoicePhone ?? "",
    invoiceEmail: s.invoiceEmail ?? "",
    invoiceGstin: s.invoiceGstin ?? "",
    invoiceLegalEntityName: s.invoiceLegalEntityName ?? "",
    invoiceTerms: s.invoiceTerms ?? "",
    invoiceNumberStoreCode: s.invoiceNumberStoreCode ?? "",
  };
}

function draftToStorePatch(d: StoreFormDraft): Partial<StoreUpsertPayload> & Pick<StoreUpsertPayload, "name"> {
  const t = (v: string) => v.trim();
  return {
    name: t(d.name),
    invoiceDisplayName: t(d.invoiceDisplayName),
    invoiceTagline: t(d.invoiceTagline),
    invoiceAddress: t(d.invoiceAddress),
    invoicePhone: t(d.invoicePhone),
    invoiceEmail: t(d.invoiceEmail),
    invoiceGstin: t(d.invoiceGstin),
    invoiceLegalEntityName: t(d.invoiceLegalEntityName),
    invoiceTerms: t(d.invoiceTerms),
    invoiceNumberStoreCode: t(d.invoiceNumberStoreCode),
  };
}

function StoreInvoiceFields({
  draft,
  onChange,
  regionGst,
}: {
  draft: StoreFormDraft;
  onChange: (patch: Partial<StoreFormDraft>) => void;
  regionGst?: string;
}) {
  return (
    <div className="mt-3 space-y-3 border border-rlx-rule bg-rlx-bg p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-rlx-green">Printed invoice — store details</p>
      {regionGst && (
        <p className="text-xs text-stone-500">
          GST / PAN inherited from region: <span className="font-mono font-semibold text-stone-700">{regionGst}</span>
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={`${labelClass} sm:col-span-2`}>
          Invoice store code
          <input
            className={inputClass}
            value={draft.invoiceNumberStoreCode}
            onChange={(e) => onChange({ invoiceNumberStoreCode: e.target.value })}
            placeholder="e.g. CHN01 — used in invoice numbers"
          />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Store name (invoice)
          <input
            className={inputClass}
            value={draft.invoiceDisplayName}
            onChange={(e) => onChange({ invoiceDisplayName: e.target.value })}
            placeholder="e.g. ZIMSON - THE WATCH STORE"
          />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Tagline
          <input
            className={inputClass}
            value={draft.invoiceTagline}
            onChange={(e) => onChange({ invoiceTagline: e.target.value })}
            placeholder="e.g. THE WATCH STORE SINCE 1948"
          />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Store Address (if different from region)
          <textarea
            className={inputClass}
            rows={3}
            value={draft.invoiceAddress}
            onChange={(e) => onChange({ invoiceAddress: e.target.value })}
            placeholder={"Street, area\nCity, State - PIN"}
          />
        </label>
        <label className={labelClass}>
          Phone
          <input className={inputClass} value={draft.invoicePhone} onChange={(e) => onChange({ invoicePhone: e.target.value })} />
        </label>
        <label className={labelClass}>
          Email
          <input type="email" className={inputClass} value={draft.invoiceEmail} onChange={(e) => onChange({ invoiceEmail: e.target.value })} />
        </label>
        <label className={labelClass}>
          Store GSTIN (override)
          <input className={inputClass} value={draft.invoiceGstin} onChange={(e) => onChange({ invoiceGstin: e.target.value })} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Legal entity ("For …" footer)
          <input
            className={inputClass}
            value={draft.invoiceLegalEntityName}
            onChange={(e) => onChange({ invoiceLegalEntityName: e.target.value })}
            placeholder="e.g. ZIMSON TIMES PVT LTD"
          />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Terms &amp; conditions (one point per line)
          <textarea
            className={inputClass}
            rows={5}
            value={draft.invoiceTerms}
            onChange={(e) => onChange({ invoiceTerms: e.target.value })}
            placeholder="One point per line (numbered on print)"
          />
        </label>
      </div>
    </div>
  );
}

// ── Warehouse form ───────────────────────────────────────────────────────────

type WarehouseDraft = { name: string; address: string; phone: string; email: string };

function emptyWarehouseDraft(): WarehouseDraft {
  return { name: "", address: "", phone: "", email: "" };
}

function warehouseToDraft(w: SeedWarehouse): WarehouseDraft {
  return { name: w.name, address: w.address ?? "", phone: w.phone ?? "", email: w.email ?? "" };
}

function draftToWarehousePayload(d: WarehouseDraft): WarehouseUpsertPayload {
  return {
    name: d.name.trim(),
    address: d.address.trim() || undefined,
    phone: d.phone.trim() || undefined,
    email: d.email.trim() || undefined,
  };
}

// ── Main page ────────────────────────────────────────────────────────────────

export function RegionsPage() {
  const { user } = useAuth();
  const { regions, addRegion, patchRegion, addStore, patchStore, addWarehouse, patchWarehouse } = useRegions();
  const { success, error: toastError } = useToast();

  // Region creation
  const [newRegionDraft, setNewRegionDraft] = useState<RegionDraft>(emptyRegionDraft());
  const [addingRegion, setAddingRegion] = useState(false);
  const [regionSaving, setRegionSaving] = useState(false);

  // Region editing
  const [editRegionId, setEditRegionId] = useState<string | null>(null);
  const [editRegionDraft, setEditRegionDraft] = useState<RegionDraft | null>(null);
  const [regionEditSaving, setRegionEditSaving] = useState(false);

  // Store creation drafts per region
  const [createStoreDraftByRegion, setCreateStoreDraftByRegion] = useState<Record<string, StoreFormDraft>>({});
  const [addingStoreForRegion, setAddingStoreForRegion] = useState<string | null>(null);

  // Store editing
  const [editStoreId, setEditStoreId] = useState<string | null>(null);
  const [editStoreDraft, setEditStoreDraft] = useState<StoreFormDraft | null>(null);
  const [storeSaving, setStoreSaving] = useState(false);

  // Warehouse creation drafts per region
  const [createWhDraftByRegion, setCreateWhDraftByRegion] = useState<Record<string, WarehouseDraft>>({});
  const [addingWhForRegion, setAddingWhForRegion] = useState<string | null>(null);

  // Warehouse editing
  const [editWhId, setEditWhId] = useState<string | null>(null);
  const [editWhDraft, setEditWhDraft] = useState<WarehouseDraft | null>(null);
  const [whSaving, setWhSaving] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  function closeModal() {
    setSelectedRegionId(null);
    setEditRegionId(null);
    setEditRegionDraft(null);
    setAddingStoreForRegion(null);
    setAddingWhForRegion(null);
    setEditStoreId(null);
    setEditStoreDraft(null);
    setEditWhId(null);
    setEditWhDraft(null);
    setActionError(null);
  }

  const visibleRegions = useMemo(() => {
    if (!user) return [];
    if (user.role === "super_admin") return regions;
    if (user.role === "admin") return regions.filter((r) => r.id === user.regionId);
    if (user.role === "store_user" && user.regionId && user.storeId) {
      return regions
        .filter((r) => r.id === user.regionId)
        .map((r) => ({ ...r, stores: r.stores.filter((s) => s.id === user.storeId) }));
    }
    return [];
  }, [user, regions]);

  const canAddRegion = user?.role === "super_admin";
  const canManageRegion = (regionId: string) => {
    if (!user) return false;
    return user.role === "super_admin" || (user.role === "admin" && user.regionId === regionId);
  };

  // ── Region handlers ──────────────────────────────────────────────
  async function handleAddRegion() {
    const name = newRegionDraft.name.trim();
    if (!name) { setActionError("Region name is required."); return; }
    setActionError(null);
    setRegionSaving(true);
    try {
      await addRegion(draftToRegionPayload(newRegionDraft));
      setNewRegionDraft(emptyRegionDraft());
      setAddingRegion(false);
      success("Region created", `"${name}" has been added successfully.`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not create region.";
      setActionError(msg);
      toastError("Region creation failed", msg);
    } finally {
      setRegionSaving(false);
    }
  }

  async function handleSaveRegionEdit() {
    if (!editRegionId || !editRegionDraft) return;
    const name = editRegionDraft.name.trim();
    if (!name) { setActionError("Region name is required."); return; }
    setActionError(null);
    setRegionEditSaving(true);
    try {
      await patchRegion(editRegionId, draftToRegionPayload(editRegionDraft));
      setEditRegionId(null);
      setEditRegionDraft(null);
      success("Region updated", `"${name}" details have been saved.`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not update region.";
      setActionError(msg);
      toastError("Update failed", msg);
    } finally {
      setRegionEditSaving(false);
    }
  }

  // ── Store handlers ───────────────────────────────────────────────
  function getStoreDraft(regionId: string) {
    return createStoreDraftByRegion[regionId] ?? emptyStoreDraft();
  }
  function patchStoreDraft(regionId: string, patch: Partial<StoreFormDraft>) {
    setCreateStoreDraftByRegion((prev) => ({ ...prev, [regionId]: { ...emptyStoreDraft(), ...prev[regionId], ...patch } }));
  }

  async function handleSaveStoreEdit() {
    if (!editStoreId || !editStoreDraft) return;
    const name = editStoreDraft.name.trim();
    if (!name) { setActionError("Store name is required."); return; }
    setActionError(null);
    setStoreSaving(true);
    try {
      await patchStore(editStoreId, draftToStorePatch(editStoreDraft));
      setEditStoreId(null);
      setEditStoreDraft(null);
      success("Store updated", `"${name}" details have been saved.`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not save store.";
      setActionError(msg);
      toastError("Store update failed", msg);
    } finally {
      setStoreSaving(false);
    }
  }

  // ── Warehouse handlers ───────────────────────────────────────────
  function getWhDraft(regionId: string) {
    return createWhDraftByRegion[regionId] ?? emptyWarehouseDraft();
  }
  function patchWhDraft(regionId: string, patch: Partial<WarehouseDraft>) {
    setCreateWhDraftByRegion((prev) => ({ ...prev, [regionId]: { ...emptyWarehouseDraft(), ...prev[regionId], ...patch } }));
  }

  async function handleSaveWhEdit() {
    if (!editWhId || !editWhDraft) return;
    const name = editWhDraft.name.trim();
    if (!name) { setActionError("Warehouse name is required."); return; }
    setActionError(null);
    setWhSaving(true);
    try {
      await patchWarehouse(editWhId, draftToWarehousePayload(editWhDraft));
      setEditWhId(null);
      setEditWhDraft(null);
      success("Warehouse updated", `"${name}" details have been saved.`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not save warehouse.";
      setActionError(msg);
      toastError("Warehouse update failed", msg);
    } finally {
      setWhSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Regions & Stores"
        description="Manage regional offices, their stores and warehouses. GST / PAN are set at the region level; stores inherit them."
      />

      {actionError && (
        <p className="mb-4 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{actionError}</p>
      )}

      {/* ── Add New Region ── */}
      {canAddRegion && (
        <Card title="Add Regional Office" subtitle="Only Super Admin can create regional offices" className="mb-8">
          {!addingRegion ? (
            <button
              type="button"
              onClick={() => setAddingRegion(true)}
              className="border border-rlx-green bg-rlx-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rlx-green/90"
            >
              + New Regional Office
            </button>
          ) : (
            <div className="space-y-4">
              <RegionFormFields draft={newRegionDraft} onChange={(p) => setNewRegionDraft((prev) => ({ ...prev, ...p }))} />
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={regionSaving}
                  onClick={() => void handleAddRegion()}
                  className="bg-rlx-green px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {regionSaving ? "Saving…" : "Create Region"}
                </button>
                <button
                  type="button"
                  disabled={regionSaving}
                  onClick={() => { setAddingRegion(false); setNewRegionDraft(emptyRegionDraft()); setActionError(null); }}
                  className="border border-rlx-rule px-5 py-2 text-sm font-semibold text-stone-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Created Regions Summary ── */}
      {visibleRegions.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500">
              Regional Offices
            </h2>
            <span className="bg-rlx-green px-2 py-0.5 text-[10px] font-bold text-white">
              {visibleRegions.length}
            </span>
          </div>
          <div className="overflow-x-auto border border-rlx-rule bg-white shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-rlx-green text-white">
                  <th className="px-4 py-2.5 text-left font-semibold tracking-wide">#</th>
                  <th className="px-4 py-2.5 text-left font-semibold tracking-wide">Region / HO Name</th>
                  <th className="px-4 py-2.5 text-left font-semibold tracking-wide">Code</th>
                  <th className="px-4 py-2.5 text-left font-semibold tracking-wide">GST</th>
                  <th className="px-4 py-2.5 text-left font-semibold tracking-wide">PAN</th>
                  <th className="px-4 py-2.5 text-left font-semibold tracking-wide">City</th>
                  <th className="px-4 py-2.5 text-center font-semibold tracking-wide">Stores</th>
                  <th className="px-4 py-2.5 text-center font-semibold tracking-wide">Warehouses</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {visibleRegions.map((region, idx) => (
                  <tr
                    key={region.id}
                    className={`border-b border-rlx-rule cursor-pointer transition-colors hover:bg-rlx-green/5 ${idx % 2 === 0 ? "bg-white" : "bg-stone-50"}`}
                    onClick={() => setSelectedRegionId(region.id)}
                    title="Click to view / manage"
                  >
                    <td className="px-4 py-2.5 text-stone-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-semibold text-stone-800">{region.name}</td>
                    <td className="px-4 py-2.5">
                      {region.regionCode
                        ? <span className="border border-rlx-gold/50 px-1.5 py-0.5 font-mono font-bold text-rlx-green">{region.regionCode}</span>
                        : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-stone-600">{region.gst || <span className="text-stone-300">—</span>}</td>
                    <td className="px-4 py-2.5 font-mono text-stone-600">{region.pan || <span className="text-stone-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-stone-600">
                      {region.addressJson?.city || region.addressJson?.district || (region.address ? region.address.split(",")[0] : <span className="text-stone-300">—</span>)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-block min-w-[1.5rem] bg-rlx-green/10 px-1.5 py-0.5 font-bold text-rlx-green">
                        {region.stores.length}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-block min-w-[1.5rem] bg-stone-100 px-1.5 py-0.5 font-bold text-stone-600">
                        {(region.warehouses ?? []).length}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-stone-300 text-base">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {visibleRegions.length === 0 && (
        <Card title="No regions visible">
          <p className="text-sm text-stone-600">
            Your account is not linked to a region yet. Ask a Super Admin to assign you.
          </p>
        </Card>
      )}

      {/* ── Region Detail Modal ── */}
      {(() => {
        const region = visibleRegions.find((r) => r.id === selectedRegionId);
        if (!region) return null;
        const isEditingRegion = editRegionId === region.id;
        return (
          <div
            className="fixed inset-0 z-50 flex items-stretch justify-end"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeModal();
            }}
          >
            <div
              className="flex w-full max-w-2xl flex-col bg-white shadow-2xl overflow-hidden"
              style={{ maxHeight: "100dvh" }}
            >
              {/* Modal header */}
              <div className="flex shrink-0 items-start justify-between gap-4 bg-rlx-green px-6 py-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white">{region.name}</h2>
                    {region.regionCode && (
                      <span className="border border-rlx-gold/70 px-2 py-0.5 text-[10px] font-bold tracking-widest text-rlx-gold">
                        {region.regionCode}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-white/60">
                    {region.stores.length} store(s) · {(region.warehouses ?? []).length} warehouse(s)
                    {region.gst ? ` · GST: ${region.gst}` : ""}
                    {region.pan ? ` · PAN: ${region.pan}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canManageRegion(region.id) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditingRegion) { setEditRegionId(null); setEditRegionDraft(null); }
                        else { setEditRegionId(region.id); setEditRegionDraft(regionToDraft(region)); }
                        setActionError(null);
                      }}
                      className="border border-white/30 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10 transition"
                    >
                      {isEditingRegion ? "Cancel Edit" : "✎ Edit Region"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex h-7 w-7 items-center justify-center border border-white/30 text-white hover:bg-white/10 text-lg leading-none transition"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Modal body — scrollable */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                {/* Edit form */}
                {isEditingRegion && editRegionDraft && (
                  <div className="border border-rlx-gold/40 bg-rlx-bg p-4">
                    <SectionHeading>Edit Region Details</SectionHeading>
                    <RegionFormFields
                      draft={editRegionDraft}
                      onChange={(p) => setEditRegionDraft((prev) => prev ? { ...prev, ...p } : prev)}
                    />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={regionEditSaving}
                        onClick={() => void handleSaveRegionEdit()}
                        className="bg-rlx-green px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {regionEditSaving ? "Saving…" : "Save Region"}
                      </button>
                      <button
                        type="button"
                        disabled={regionEditSaving}
                        onClick={() => { setEditRegionId(null); setEditRegionDraft(null); }}
                        className="border border-rlx-rule px-5 py-2 text-sm font-semibold text-stone-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Info summary */}
                {!isEditingRegion && (
                  <div className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2 border border-rlx-rule bg-rlx-bg px-4 py-3">
                    {(() => {
                      const a = region.addressJson;
                      const display = a
                        ? [a.doorNo, a.street, a.city, a.district, a.state, a.pincode ? `– ${a.pincode}` : "", a.country].filter(Boolean).join(", ")
                        : (region.address ?? "");
                      return display ? (
                        <div className="sm:col-span-2">
                          <span className="font-semibold text-stone-500">Address: </span>
                          <span className="text-stone-700">{display}</span>
                        </div>
                      ) : null;
                    })()}
                    {region.phone && <div><span className="font-semibold text-stone-500">Phone: </span><span className="text-stone-700">{region.phone}</span></div>}
                    {region.email && <div><span className="font-semibold text-stone-500">Email: </span><span className="text-stone-700">{region.email}</span></div>}
                    {region.gst && <div><span className="font-semibold text-stone-500">GST: </span><span className="font-mono text-stone-700">{region.gst}</span></div>}
                    {region.pan && <div><span className="font-semibold text-stone-500">PAN: </span><span className="font-mono text-stone-700">{region.pan}</span></div>}
                  </div>
                )}

                {/* ── Stores ── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <SectionHeading>Stores</SectionHeading>
                    {canManageRegion(region.id) && addingStoreForRegion !== region.id && (
                      <button
                        type="button"
                        onClick={() => setAddingStoreForRegion(region.id)}
                        className="border border-rlx-green px-3 py-1 text-xs font-semibold text-rlx-green hover:bg-rlx-green hover:text-white transition"
                      >
                        + Add Store
                      </button>
                    )}
                  </div>

                  {/* Add store form */}
                  {canManageRegion(region.id) && addingStoreForRegion === region.id && (
                    <div className="border border-rlx-rule bg-rlx-bg p-3 mb-3">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-600">New Store</p>
                      <label className={labelClass}>
                        Store Code / Name *
                        <input
                          className={inputClass}
                          value={getStoreDraft(region.id).name}
                          onChange={(e) => patchStoreDraft(region.id, { name: e.target.value })}
                          placeholder="e.g. CHN01"
                        />
                      </label>
                      <StoreInvoiceFields
                        draft={getStoreDraft(region.id)}
                        onChange={(patch) => patchStoreDraft(region.id, patch)}
                        regionGst={region.gst}
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            const d = getStoreDraft(region.id);
                            const sname = d.name.trim();
                            if (!sname) { setActionError("Enter a store name."); return; }
                            addStore(region.id, draftToStorePatch(d) as StoreUpsertPayload);
                            setCreateStoreDraftByRegion((prev) => ({ ...prev, [region.id]: emptyStoreDraft() }));
                            setAddingStoreForRegion(null);
                            success("Store added", `"${sname}" has been added successfully.`);
                          }}
                          className="bg-rlx-green px-4 py-2 text-xs font-semibold text-white"
                        >
                          Add Store
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAddingStoreForRegion(null); setActionError(null); }}
                          className="border border-rlx-rule px-4 py-2 text-xs font-semibold text-stone-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {region.stores.length === 0 ? (
                    <p className="border border-dashed border-stone-300 px-3 py-4 text-center text-sm text-stone-400">
                      No stores yet{canManageRegion(region.id) ? " — click + Add Store above." : "."}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {region.stores.map((store) => (
                        <li key={store.id} className="border border-rlx-rule bg-white px-3 py-2.5 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold text-stone-800">{store.name}</span>
                              {store.invoiceGstin && <span className="ml-2 text-xs text-stone-400">GST: {store.invoiceGstin}</span>}
                              {store.invoiceNumberStoreCode && (
                                <span className="ml-2 border border-stone-200 px-1.5 py-0.5 text-[10px] font-mono text-stone-500">{store.invoiceNumberStoreCode}</span>
                              )}
                            </div>
                            {canManageRegion(region.id) && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (editStoreId === store.id) { setEditStoreId(null); setEditStoreDraft(null); }
                                  else { setEditStoreId(store.id); setEditStoreDraft(seedStoreToDraft(store)); }
                                  setActionError(null);
                                }}
                                className="border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                              >
                                {editStoreId === store.id ? "Close" : "Edit"}
                              </button>
                            )}
                          </div>
                          {editStoreId === store.id && editStoreDraft && (
                            <div className="mt-3 border-t border-rlx-rule pt-3">
                              <label className={labelClass}>
                                Store Code / Name *
                                <input className={inputClass} value={editStoreDraft.name} onChange={(e) => setEditStoreDraft((p) => p ? { ...p, name: e.target.value } : p)} />
                              </label>
                              <StoreInvoiceFields
                                draft={editStoreDraft}
                                onChange={(patch) => setEditStoreDraft((p) => p ? { ...p, ...patch } : p)}
                                regionGst={region.gst}
                              />
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" disabled={storeSaving} onClick={() => void handleSaveStoreEdit()} className="bg-rlx-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                                  {storeSaving ? "Saving…" : "Save"}
                                </button>
                                <button type="button" disabled={storeSaving} onClick={() => { setEditStoreId(null); setEditStoreDraft(null); }} className="border border-rlx-rule px-4 py-2 text-xs font-semibold text-stone-600">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* ── Warehouses ── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <SectionHeading>Warehouses</SectionHeading>
                    {canManageRegion(region.id) && addingWhForRegion !== region.id && (
                      <button
                        type="button"
                        onClick={() => setAddingWhForRegion(region.id)}
                        className="border border-rlx-green px-3 py-1 text-xs font-semibold text-rlx-green hover:bg-rlx-green hover:text-white transition"
                      >
                        + Add Warehouse
                      </button>
                    )}
                  </div>

                  {canManageRegion(region.id) && addingWhForRegion === region.id && (
                    <div className="border border-rlx-rule bg-rlx-bg p-3 mb-3 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-stone-600">New Warehouse</p>
                      <label className={labelClass}>
                        Warehouse Name *
                        <input className={inputClass} value={getWhDraft(region.id).name} onChange={(e) => patchWhDraft(region.id, { name: e.target.value })} placeholder="e.g. Chennai Central Warehouse" />
                      </label>
                      <label className={labelClass}>
                        Address
                        <textarea className={inputClass} rows={2} value={getWhDraft(region.id).address} onChange={(e) => patchWhDraft(region.id, { address: e.target.value })} placeholder={"Street, Area\nCity, State - PIN"} />
                      </label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className={labelClass}>Phone<input className={inputClass} value={getWhDraft(region.id).phone} onChange={(e) => patchWhDraft(region.id, { phone: e.target.value })} /></label>
                        <label className={labelClass}>Email<input type="email" className={inputClass} value={getWhDraft(region.id).email} onChange={(e) => patchWhDraft(region.id, { email: e.target.value })} /></label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            const d = getWhDraft(region.id);
                            const wname = d.name.trim();
                            if (!wname) { setActionError("Enter a warehouse name."); return; }
                            addWarehouse(region.id, draftToWarehousePayload(d));
                            setCreateWhDraftByRegion((prev) => ({ ...prev, [region.id]: emptyWarehouseDraft() }));
                            setAddingWhForRegion(null);
                            success("Warehouse added", `"${wname}" has been added successfully.`);
                          }}
                          className="bg-rlx-green px-4 py-2 text-xs font-semibold text-white"
                        >
                          Add Warehouse
                        </button>
                        <button type="button" onClick={() => { setAddingWhForRegion(null); setActionError(null); }} className="border border-rlx-rule px-4 py-2 text-xs font-semibold text-stone-600">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {(region.warehouses ?? []).length === 0 ? (
                    <p className="border border-dashed border-stone-300 px-3 py-4 text-center text-sm text-stone-400">
                      No warehouses yet{canManageRegion(region.id) ? " — click + Add Warehouse above." : "."}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {(region.warehouses ?? []).map((wh) => (
                        <li key={wh.id} className="border border-rlx-rule bg-white px-3 py-2.5 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold text-stone-800">{wh.name}</span>
                              {wh.address && <span className="ml-2 text-xs text-stone-400">{wh.address.split("\n")[0]}</span>}
                            </div>
                            {canManageRegion(region.id) && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (editWhId === wh.id) { setEditWhId(null); setEditWhDraft(null); }
                                  else { setEditWhId(wh.id); setEditWhDraft(warehouseToDraft(wh)); }
                                  setActionError(null);
                                }}
                                className="border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                              >
                                {editWhId === wh.id ? "Close" : "Edit"}
                              </button>
                            )}
                          </div>
                          {editWhId === wh.id && editWhDraft && (
                            <div className="mt-3 border-t border-rlx-rule pt-3 space-y-3">
                              <label className={labelClass}>Warehouse Name *<input className={inputClass} value={editWhDraft.name} onChange={(e) => setEditWhDraft((p) => p ? { ...p, name: e.target.value } : p)} /></label>
                              <label className={labelClass}>Address<textarea className={inputClass} rows={2} value={editWhDraft.address} onChange={(e) => setEditWhDraft((p) => p ? { ...p, address: e.target.value } : p)} /></label>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <label className={labelClass}>Phone<input className={inputClass} value={editWhDraft.phone} onChange={(e) => setEditWhDraft((p) => p ? { ...p, phone: e.target.value } : p)} /></label>
                                <label className={labelClass}>Email<input type="email" className={inputClass} value={editWhDraft.email} onChange={(e) => setEditWhDraft((p) => p ? { ...p, email: e.target.value } : p)} /></label>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" disabled={whSaving} onClick={() => void handleSaveWhEdit()} className="bg-rlx-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{whSaving ? "Saving…" : "Save"}</button>
                                <button type="button" disabled={whSaving} onClick={() => { setEditWhId(null); setEditWhDraft(null); }} className="border border-rlx-rule px-4 py-2 text-xs font-semibold text-stone-600">Cancel</button>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
