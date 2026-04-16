import { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { useRegions } from "../context/RegionsContext";

export function RegionsPage() {
  const { user } = useAuth();
  const { regions, addRegion, addStore } = useRegions();
  const [newRegionName, setNewRegionName] = useState("");
  const [storeNames, setStoreNames] = useState<Record<string, string>>({});

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

  return (
    <div>
      <PageHeader
        title="Regions & stores"
        description={
          user?.role === "store_user"
            ? "Your assigned store within your regional office."
            : "Regional hierarchy: Super Admin manages all offices; Regional Admins manage stores in their office only."
        }
      />

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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label
                      htmlFor={`store-${region.id}`}
                      className="text-xs font-medium text-stone-600"
                    >
                      New store under this region
                    </label>
                    <input
                      id={`store-${region.id}`}
                      value={storeNames[region.id] ?? ""}
                      onChange={(e) =>
                        setStoreNames((prev) => ({ ...prev, [region.id]: e.target.value }))
                      }
                      placeholder="Store name"
                      className="mt-1 w-full rounded-xl border border-zimson-300/80 bg-zimson-50/50 px-3 py-2 text-sm outline-none ring-zimson-400/40 placeholder:text-stone-400 focus:ring-2"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      addStore(region.id, storeNames[region.id] ?? "");
                      setStoreNames((prev) => ({ ...prev, [region.id]: "" }));
                    }}
                    className="rounded-xl border border-zimson-400/80 bg-white px-3 py-2 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50"
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
                      className="flex items-center justify-between rounded-xl border border-zimson-200/80 bg-white px-3 py-2.5 text-sm"
                    >
                      <span className="font-medium text-stone-800">{store.name}</span>
                      <span className="text-xs text-stone-400">{store.id}</span>
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
