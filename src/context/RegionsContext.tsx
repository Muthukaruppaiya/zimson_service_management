import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SEED_REGIONS, type SeedRegion, type SeedStore } from "../data/seed";
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
  return structuredClone(SEED_REGIONS);
}

export function RegionsProvider({ children }: { children: ReactNode }) {
  const api = useApiMode();
  const { user, authReady } = useAuth();
  const [regions, setRegions] = useState<SeedRegion[]>(() =>
    api ? structuredClone(SEED_REGIONS) : loadRegionsLocal(),
  );

  useEffect(() => {
    if (!api || !authReady || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<{ regions: SeedRegion[] }>("/api/regions");
        if (!cancelled) setRegions(data.regions);
      } catch {
        /* keep seed clone */
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

  const persistApi = useCallback(async (next: SeedRegion[]) => {
    await apiJson("/api/regions", { method: "PUT", json: { regions: next } });
    setRegions(next);
  }, []);

  const addRegion = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const row: SeedRegion = { id: createId("region"), name: trimmed, stores: [] };
      const next = [...regions, row];
      if (api) void persistApi(next);
      else setRegions(next);
    },
    [regions, api, persistApi],
  );

  const addStore = useCallback(
    (regionId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const store: SeedStore = { id: createId("store"), name: trimmed };
      const next = regions.map((r) =>
        r.id === regionId ? { ...r, stores: [...r.stores, store] } : r,
      );
      if (api) void persistApi(next);
      else setRegions(next);
    },
    [regions, api, persistApi],
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
