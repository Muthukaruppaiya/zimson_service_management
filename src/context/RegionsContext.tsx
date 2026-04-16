import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { type SeedRegion, type SeedStore } from "../data/seed";
import { apiJson, useApiMode } from "../lib/api";
import { createId } from "../lib/id";
import { STORAGE_REGIONS } from "../lib/storageKeys";
import { useAuth } from "./AuthContext";

type RegionsContextValue = {
  regions: SeedRegion[];
  addRegion: (name: string) => void;
  addStore: (regionId: string, name: string) => void;
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
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (api) {
        void (async () => {
          const data = await apiJson<{ region: SeedRegion }>("/api/regions", {
            method: "POST",
            json: { name: trimmed },
          });
          setRegions((prev) => [...prev, data.region]);
        })();
        return;
      }
      const row: SeedRegion = { id: createId("region"), name: trimmed, stores: [] };
      const next = [...regions, row];
      setRegions(next);
    },
    [regions, api],
  );

  const addStore = useCallback(
    (regionId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (api) {
        void (async () => {
          const data = await apiJson<{ store: SeedStore }>(`/api/regions/${encodeURIComponent(regionId)}/stores`, {
            method: "POST",
            json: { name: trimmed },
          });
          setRegions((prev) =>
            prev.map((r) => (r.id === regionId ? { ...r, stores: [...r.stores, data.store] } : r)),
          );
        })();
        return;
      }
      const store: SeedStore = { id: createId("store"), name: trimmed };
      const next = regions.map((r) =>
        r.id === regionId ? { ...r, stores: [...r.stores, store] } : r,
      );
      setRegions(next);
    },
    [regions, api],
  );

  const value = useMemo(
    () => ({ regions, addRegion, addStore }),
    [regions, addRegion, addStore],
  );

  return <RegionsContext.Provider value={value}>{children}</RegionsContext.Provider>;
}

export function useRegions() {
  const ctx = useContext(RegionsContext);
  if (!ctx) throw new Error("useRegions must be used within RegionsProvider");
  return ctx;
}
