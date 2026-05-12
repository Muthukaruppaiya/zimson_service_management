import { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { useRegions, type StoreUpsertPayload } from "../context/RegionsContext";
import type { SeedStore } from "../data/seed";
import { ApiError } from "../lib/api";

const inputClass =
  "mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2";

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
  /** Optional override for printed invoice numbers (e.g. CHN01); empty = use store name). */
  invoiceNumberStoreCode: string;
};

function emptyDraft(): StoreFormDraft {
  return {
    name: "",
    invoiceDisplayName: "",
    invoiceTagline: "",
    invoiceAddress: "",
    invoicePhone: "",
    invoiceEmail: "",
    invoiceGstin: "",
    invoiceLegalEntityName: "",
    invoiceTerms: "",
    invoiceNumberStoreCode: "",
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

function draftToCreatePayload(d: StoreFormDraft): StoreUpsertPayload {
  const name = d.name.trim();
  const t = (v: string) => v.trim();
  const out: StoreUpsertPayload = { name };
  if (t(d.invoiceDisplayName)) out.invoiceDisplayName = t(d.invoiceDisplayName);
  if (t(d.invoiceTagline)) out.invoiceTagline = t(d.invoiceTagline);
  if (t(d.invoiceAddress)) out.invoiceAddress = t(d.invoiceAddress);
  if (t(d.invoicePhone)) out.invoicePhone = t(d.invoicePhone);
  if (t(d.invoiceEmail)) out.invoiceEmail = t(d.invoiceEmail);
  if (t(d.invoiceGstin)) out.invoiceGstin = t(d.invoiceGstin);
  if (t(d.invoiceLegalEntityName)) out.invoiceLegalEntityName = t(d.invoiceLegalEntityName);
  if (t(d.invoiceTerms)) out.invoiceTerms = t(d.invoiceTerms);
  if (t(d.invoiceNumberStoreCode)) out.invoiceNumberStoreCode = t(d.invoiceNumberStoreCode);
  return out;
}

/** Full PATCH body so cleared fields persist as empty on the server. */
function draftToFullPatch(d: StoreFormDraft): Partial<StoreUpsertPayload> & Pick<StoreUpsertPayload, "name"> {
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
  idPrefix,
}: {
  draft: StoreFormDraft;
  onChange: (patch: Partial<StoreFormDraft>) => void;
  idPrefix: string;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-zimson-200/80 bg-zimson-50/30 p-3">
      <p className="text-xs font-semibold text-stone-700">Printed invoice — store details</p>
      <p className="text-xs text-stone-500">
        Shown on Quick Bill and Service bill headers for staff logged into this store. Terms: one paragraph per line.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium text-stone-600 sm:col-span-2">
          Invoice number store code (optional)
          <input
            id={`${idPrefix}-inv-store-code`}
            className={inputClass}
            value={draft.invoiceNumberStoreCode}
            onChange={(e) => onChange({ invoiceNumberStoreCode: e.target.value })}
            placeholder="e.g. CHN01 — if empty, derived from store code / name"
          />
        </label>
        <label className="text-xs font-medium text-stone-600 sm:col-span-2">
          Store name (invoice)
          <input
            id={`${idPrefix}-inv-name`}
            className={inputClass}
            value={draft.invoiceDisplayName}
            onChange={(e) => onChange({ invoiceDisplayName: e.target.value })}
            placeholder="e.g. ZIMSON - THE WATCH STORE"
          />
        </label>
        <label className="text-xs font-medium text-stone-600 sm:col-span-2">
          Tagline
          <input
            className={inputClass}
            value={draft.invoiceTagline}
            onChange={(e) => onChange({ invoiceTagline: e.target.value })}
            placeholder="e.g. THE WATCH STORE SINCE 1948"
          />
        </label>
        <label className="text-xs font-medium text-stone-600 sm:col-span-2">
          Address (multiline)
          <textarea
            className={inputClass}
            rows={3}
            value={draft.invoiceAddress}
            onChange={(e) => onChange({ invoiceAddress: e.target.value })}
            placeholder={"Street, area\nCity, State - PIN"}
          />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Phone
          <input className={inputClass} value={draft.invoicePhone} onChange={(e) => onChange({ invoicePhone: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Email
          <input
            type="email"
            className={inputClass}
            value={draft.invoiceEmail}
            onChange={(e) => onChange({ invoiceEmail: e.target.value })}
          />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Store GSTIN
          <input className={inputClass} value={draft.invoiceGstin} onChange={(e) => onChange({ invoiceGstin: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-stone-600 sm:col-span-2">
          Legal entity (&quot;For …&quot; footer)
          <input
            className={inputClass}
            value={draft.invoiceLegalEntityName}
            onChange={(e) => onChange({ invoiceLegalEntityName: e.target.value })}
            placeholder="e.g. ZIMSON TIMES PVT LTD"
          />
        </label>
        <label className="text-xs font-medium text-stone-600 sm:col-span-2">
          Terms &amp; conditions
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

export function RegionsPage() {
  const { user } = useAuth();
  const { regions, addRegion, addStore, patchStore } = useRegions();
  const [newRegionName, setNewRegionName] = useState("");
  const [createDraftByRegion, setCreateDraftByRegion] = useState<Record<string, StoreFormDraft>>({});
  const [editStoreId, setEditStoreId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<StoreFormDraft | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const visibleRegions = useMemo(() => {
    if (!user) return [];
    if (user.role === "super_admin") return regions;
    if (user.role === "regional_admin") {
      return regions.filter((r) => r.id === user.regionId);
    }
    if (user.role === "store_user" && user.regionId && user.storeId) {
      return regions
        .filter((r) => r.id === user.regionId)
        .map((r) => ({
          ...r,
          stores: r.stores.filter((s) => s.id === user.storeId),
        }));
    }
    return [];
  }, [user, regions]);

  const canAddRegion = user?.role === "super_admin";

  const canAddStore = (regionId: string) => {
    if (!user) return false;
    if (user.role === "super_admin") return true;
    if (user.role === "regional_admin") return user.regionId === regionId;
    return false;
  };

  const canEditStoreInvoice = (regionId: string) => canAddStore(regionId);

  function getCreateDraft(regionId: string): StoreFormDraft {
    return createDraftByRegion[regionId] ?? emptyDraft();
  }

  function patchCreateDraft(regionId: string, patch: Partial<StoreFormDraft>) {
    setCreateDraftByRegion((prev) => ({
      ...prev,
      [regionId]: { ...emptyDraft(), ...prev[regionId], ...patch },
    }));
  }

  function beginEditStore(store: SeedStore) {
    setActionError(null);
    setEditStoreId(store.id);
    setEditDraft(seedStoreToDraft(store));
  }

  async function saveEditStore() {
    if (!editStoreId || !editDraft) return;
    const name = editDraft.name.trim();
    if (!name) {
      setActionError("Store name is required.");
      return;
    }
    setSavingEdit(true);
    setActionError(null);
    try {
      await patchStore(editStoreId, draftToFullPatch(editDraft));
      setEditStoreId(null);
      setEditDraft(null);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not save store.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Regions & stores"
        description={
          user?.role === "store_user"
            ? "Your assigned store within your regional office."
            : "Regional hierarchy: Super Admin manages all offices; Regional Admins manage stores in their office only. Capture printed-invoice store details when creating or editing a store."
        }
      />

      {actionError ? (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{actionError}</p>
      ) : null}

      {canAddRegion ? (
        <Card
          title="Add regional office"
          subtitle="Only Super Admin can create new regional offices."
          className="mb-8"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="region-name" className="text-xs font-medium text-stone-600">
                Office name
              </label>
              <input
                id="region-name"
                value={newRegionName}
                onChange={(e) => setNewRegionName(e.target.value)}
                placeholder="e.g. Regional office — West"
                className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                addRegion(newRegionName);
                setNewRegionName("");
              }}
              className="rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            >
              Add region
            </button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {visibleRegions.map((region) => (
          <Card
            key={region.id}
            title={region.name}
            subtitle={`${region.stores.length} store(s)`}
            className="relative overflow-hidden"
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-zimson-200/40 blur-2xl" />
            <div className="relative space-y-4">
              {canAddStore(region.id) ? (
                <div className="rounded-xl border border-zimson-200/80 bg-white p-3">
                  <p className="text-xs font-semibold text-stone-800">New store</p>
                  <label htmlFor={`store-name-${region.id}`} className="mt-2 block text-xs font-medium text-stone-600">
                    Store code / name
                  </label>
                  <input
                    id={`store-name-${region.id}`}
                    value={getCreateDraft(region.id).name}
                    onChange={(e) => patchCreateDraft(region.id, { name: e.target.value })}
                    placeholder="e.g. CBE04"
                    className={inputClass}
                  />
                  <StoreInvoiceFields
                    draft={getCreateDraft(region.id)}
                    onChange={(patch) => patchCreateDraft(region.id, patch)}
                    idPrefix={`create-${region.id}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      const d = getCreateDraft(region.id);
                      if (!d.name.trim()) {
                        setActionError("Enter a store name.");
                        return;
                      }
                      addStore(region.id, draftToCreatePayload(d));
                      setCreateDraftByRegion((prev) => ({ ...prev, [region.id]: emptyDraft() }));
                    }}
                    className="mt-3 rounded-xl border border-zimson-400/80 bg-zimson-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
                  >
                    Add store
                  </button>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-zimson-200 bg-zimson-50/50 px-3 py-2 text-sm text-stone-600">
                  You can view this location but cannot add stores.
                </p>
              )}
              <ul className="space-y-2">
                {region.stores.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-zimson-300/80 bg-zimson-50/40 px-3 py-6 text-center text-sm text-stone-500">
                    No stores yet
                    {canAddStore(region.id) ? " — add the first one above." : "."}
                  </li>
                ) : (
                  region.stores.map((store) => (
                    <li
                      key={store.id}
                      className="rounded-xl border border-zimson-200/80 bg-white px-3 py-2.5 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-medium text-stone-800">{store.name}</span>
                          <span className="ml-2 text-xs text-stone-400">{store.id}</span>
                        </div>
                        {canEditStoreInvoice(region.id) ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (editStoreId === store.id) {
                                setEditStoreId(null);
                                setEditDraft(null);
                              } else {
                                beginEditStore(store);
                              }
                            }}
                            className="rounded-lg border border-zimson-300 px-2 py-1 text-xs font-semibold text-zimson-900 hover:bg-zimson-50"
                          >
                            {editStoreId === store.id ? "Close" : "Edit invoice details"}
                          </button>
                        ) : null}
                      </div>
                      {editStoreId === store.id && editDraft ? (
                        <div className="mt-3 border-t border-zimson-100 pt-3">
                          <label className="block text-xs font-medium text-stone-600">
                            Store code / name
                            <input
                              className={inputClass}
                              value={editDraft.name}
                              onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                            />
                          </label>
                          <StoreInvoiceFields
                            draft={editDraft}
                            onChange={(patch) => setEditDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
                            idPrefix={`edit-${store.id}`}
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={savingEdit}
                              onClick={() => void saveEditStore()}
                              className="rounded-xl bg-zimson-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {savingEdit ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              disabled={savingEdit}
                              onClick={() => {
                                setEditStoreId(null);
                                setEditDraft(null);
                              }}
                              className="rounded-xl border border-zimson-300 px-4 py-2 text-xs font-semibold text-zimson-900"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </Card>
        ))}
      </div>

      {visibleRegions.length === 0 ? (
        <Card title="No regions visible">
          <p className="text-sm text-stone-600">
            Your account is not linked to a region yet. Ask a Super Admin to assign you.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
