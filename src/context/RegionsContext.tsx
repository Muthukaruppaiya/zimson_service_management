import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { type RegionAddressBlock, type SeedRegion, type SeedStore, type SeedWarehouse } from "../data/seed";
export type { RegionAddressBlock };
import { apiJson, useApiMode } from "../lib/api";
import { createId } from "../lib/id";
import { STORAGE_REGIONS } from "../lib/storageKeys";
import { useAuth } from "./AuthContext";

export type RegionUpsertPayload = {
  name: string;
  regionCode?: string;
  /** Plain-text address (composed from addressJson for display). */
  address?: string;
  /** Structured address — preferred for round-trip editing. */
  addressJson?: RegionAddressBlock;
  gst?: string;
  pan?: string;
  email?: string;
  phone?: string;
};

/** Create or update a store including printed-invoice fields (Regions & stores). */
export type StoreUpsertPayload = Pick<SeedStore, "name"> &
  Partial<
    Pick<
      SeedStore,
      | "invoiceDisplayName"
      | "invoiceTagline"
      | "invoiceAddress"
      | "invoicePhone"
      | "invoiceEmail"
      | "invoiceGstin"
      | "invoiceLegalEntityName"
      | "invoiceTerms"
      | "invoiceNumberStoreCode"
    >
  >;

export type WarehouseUpsertPayload = {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
};

type RegionsContextValue = {
  regions: SeedRegion[];
  addRegion: (payload: RegionUpsertPayload) => Promise<void>;
  patchRegion: (regionId: string, payload: Partial<RegionUpsertPayload>) => Promise<void>;
  addStore: (regionId: string, payload: StoreUpsertPayload) => void;
  patchStore: (storeId: string, payload: Partial<StoreUpsertPayload>) => Promise<void>;
  addWarehouse: (regionId: string, payload: WarehouseUpsertPayload) => void;
  patchWarehouse: (warehouseId: string, payload: Partial<WarehouseUpsertPayload>) => Promise<void>;
};

const RegionsContext = createContext<RegionsContextValue | null>(null);

function loadRegionsLocal(): SeedRegion[] {
  try {
    const raw = localStorage.getItem(STORAGE_REGIONS);
    if (raw) {
      const parsed = JSON.parse(raw) as SeedRegion[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function RegionsProvider({ children }: { children: ReactNode }) {
  const api = useApiMode();
  const { user, authReady } = useAuth();
  const [regions, setRegions] = useState<SeedRegion[]>(() =>
    api ? [] : loadRegionsLocal(),
  );

  useEffect(() => {
    if (!api || !authReady || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<{ regions: SeedRegion[] }>("/api/regions");
        if (!cancelled) setRegions(data.regions);
      } catch {
        /* keep current */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, authReady, user?.id]);

  useEffect(() => {
    if (api) return;
    localStorage.setItem(STORAGE_REGIONS, JSON.stringify(regions));
  }, [api, regions]);

  const addRegion = useCallback(
    async (payload: RegionUpsertPayload): Promise<void> => {
      const trimmed = payload.name.trim();
      if (!trimmed) return;
      if (api) {
        const data = await apiJson<{ region: SeedRegion }>("/api/regions", {
          method: "POST",
          json: payload,
        });
        setRegions((prev) => [...prev, data.region]);
        return;
      }
      const row: SeedRegion = {
        id: createId("region"),
        name: trimmed,
        regionCode: payload.regionCode?.trim(),
        address: payload.address?.trim(),
        addressJson: payload.addressJson,
        gst: payload.gst?.trim(),
        pan: payload.pan?.trim(),
        email: payload.email?.trim(),
        phone: payload.phone?.trim(),
        stores: [],
        warehouses: [],
      };
      setRegions((prev) => [...prev, row]);
    },
    [api],
  );

  const patchRegion = useCallback(
    async (regionId: string, payload: Partial<RegionUpsertPayload>) => {
      if (api) {
        await apiJson<{ region: SeedRegion }>(`/api/regions/${encodeURIComponent(regionId)}`, {
          method: "PATCH",
          json: payload,
        });
        const data = await apiJson<{ regions: SeedRegion[] }>("/api/regions");
        setRegions(data.regions);
        return;
      }
      setRegions((prev) =>
        prev.map((r) =>
          r.id === regionId
            ? {
                ...r,
                ...(payload.name?.trim() ? { name: payload.name.trim() } : {}),
                regionCode: payload.regionCode !== undefined ? payload.regionCode.trim() : r.regionCode,
                address: payload.address !== undefined ? payload.address.trim() : r.address,
                gst: payload.gst !== undefined ? payload.gst.trim() : r.gst,
                pan: payload.pan !== undefined ? payload.pan.trim() : r.pan,
                email: payload.email !== undefined ? payload.email.trim() : r.email,
                phone: payload.phone !== undefined ? payload.phone.trim() : r.phone,
              }
            : r,
        ),
      );
    },
    [api],
  );

  const addStore = useCallback(
    (regionId: string, payload: StoreUpsertPayload) => {
      const trimmed = payload.name.trim();
      if (!trimmed) return;
      const { name: _n, ...invoiceRest } = payload;
      if (api) {
        void (async () => {
          const data = await apiJson<{ store: SeedStore }>(`/api/regions/${encodeURIComponent(regionId)}/stores`, {
            method: "POST",
            json: { name: trimmed, ...invoiceRest },
          });
          setRegions((prev) =>
            prev.map((r) => (r.id === regionId ? { ...r, stores: [...r.stores, data.store] } : r)),
          );
        })();
        return;
      }
      const store: SeedStore = { id: createId("store"), name: trimmed, ...invoiceRest };
      setRegions((prev) =>
        prev.map((r) => (r.id === regionId ? { ...r, stores: [...r.stores, store] } : r)),
      );
    },
    [api],
  );

  const patchStore = useCallback(
    async (storeId: string, payload: Partial<StoreUpsertPayload>) => {
      if (!api) {
        setRegions((prev) =>
          prev.map((r) => ({
            ...r,
            stores: r.stores.map((st) => {
              if (st.id !== storeId) return st;
              const next: SeedStore = { ...st };
              if (payload.name !== undefined) {
                const nm = payload.name.trim();
                if (nm) next.name = nm;
              }
              const invKeys: (keyof Pick<
                SeedStore,
                | "invoiceDisplayName"
                | "invoiceTagline"
                | "invoiceAddress"
                | "invoicePhone"
                | "invoiceEmail"
                | "invoiceGstin"
                | "invoiceLegalEntityName"
                | "invoiceTerms"
                | "invoiceNumberStoreCode"
              >)[] = [
                "invoiceDisplayName",
                "invoiceTagline",
                "invoiceAddress",
                "invoicePhone",
                "invoiceEmail",
                "invoiceGstin",
                "invoiceLegalEntityName",
                "invoiceTerms",
                "invoiceNumberStoreCode",
              ];
              for (const k of invKeys) {
                if (payload[k] !== undefined) (next as Record<string, unknown>)[k] = payload[k];
              }
              return next;
            }),
          })),
        );
        return;
      }
      await apiJson<{ store: SeedStore }>(`/api/stores/${encodeURIComponent(storeId)}`, {
        method: "PATCH",
        json: payload,
      });
      const data = await apiJson<{ regions: SeedRegion[] }>("/api/regions");
      setRegions(data.regions);
    },
    [api],
  );

  const addWarehouse = useCallback(
    (regionId: string, payload: WarehouseUpsertPayload) => {
      const trimmed = payload.name.trim();
      if (!trimmed) return;
      if (api) {
        void (async () => {
          const data = await apiJson<{ warehouse: SeedWarehouse }>(
            `/api/regions/${encodeURIComponent(regionId)}/warehouses`,
            { method: "POST", json: payload },
          );
          setRegions((prev) =>
            prev.map((r) =>
              r.id === regionId ? { ...r, warehouses: [...(r.warehouses ?? []), data.warehouse] } : r,
            ),
          );
        })();
        return;
      }
      const warehouse: SeedWarehouse = {
        id: createId("wh"),
        name: trimmed,
        address: payload.address?.trim(),
        phone: payload.phone?.trim(),
        email: payload.email?.trim(),
      };
      setRegions((prev) =>
        prev.map((r) =>
          r.id === regionId ? { ...r, warehouses: [...(r.warehouses ?? []), warehouse] } : r,
        ),
      );
    },
    [api],
  );

  const patchWarehouse = useCallback(
    async (warehouseId: string, payload: Partial<WarehouseUpsertPayload>) => {
      if (api) {
        await apiJson(`/api/warehouses/${encodeURIComponent(warehouseId)}`, {
          method: "PATCH",
          json: payload,
        });
        const data = await apiJson<{ regions: SeedRegion[] }>("/api/regions");
        setRegions(data.regions);
        return;
      }
      setRegions((prev) =>
        prev.map((r) => ({
          ...r,
          warehouses: (r.warehouses ?? []).map((w) =>
            w.id !== warehouseId
              ? w
              : {
                  ...w,
                  ...(payload.name?.trim() ? { name: payload.name.trim() } : {}),
                  address: payload.address !== undefined ? payload.address.trim() : w.address,
                  phone: payload.phone !== undefined ? payload.phone.trim() : w.phone,
                  email: payload.email !== undefined ? payload.email.trim() : w.email,
                },
          ),
        })),
      );
    },
    [api],
  );

  const value = useMemo(
    () => ({ regions, addRegion, patchRegion, addStore, patchStore, addWarehouse, patchWarehouse }),
    [regions, addRegion, patchRegion, addStore, patchStore, addWarehouse, patchWarehouse],
  );

  return <RegionsContext.Provider value={value}>{children}</RegionsContext.Provider>;
}

export function useRegions() {
  const ctx = useContext(RegionsContext);
  if (!ctx) throw new Error("useRegions must be used within RegionsProvider");
  return ctx;
}
