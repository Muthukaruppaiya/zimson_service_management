import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { watchBrands } from "../data/serviceSeed";
import { apiJson, useApiMode } from "../lib/api";
import type { BrandRow } from "../types/brand";
import { useAuth } from "./AuthContext";

type BrandsContextValue = {
  /** Active brands from the API (or demo seed when API mode is off), sorted for display. */
  brands: BrandRow[];
  refreshBrands: () => Promise<void>;
};

const BrandsContext = createContext<BrandsContextValue | null>(null);

function seedBrandsFromDemo(): BrandRow[] {
  const names = watchBrands();
  const now = new Date(0).toISOString();
  return names.map((name, i) => ({
    id: `demo-brand-${i}`,
    code: name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32) || `B${i}`,
    name,
    sortOrder: i,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }));
}

export function BrandsProvider({ children }: { children: ReactNode }) {
  const api = useApiMode();
  const { user, authReady } = useAuth();
  const [brands, setBrands] = useState<BrandRow[]>(() => (api ? [] : seedBrandsFromDemo()));

  const refreshBrands = useCallback(async () => {
    if (!api || !user) return;
    try {
      const data = await apiJson<{ brands: BrandRow[] }>("/api/brands");
      setBrands(data.brands);
    } catch {
      /* keep list as-is */
    }
  }, [api, user]);

  useEffect(() => {
    if (!api) {
      setBrands(seedBrandsFromDemo());
      return;
    }
    if (!authReady || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<{ brands: BrandRow[] }>("/api/brands");
        if (!cancelled) setBrands(data.brands);
      } catch {
        if (!cancelled) setBrands([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, authReady, user?.id]);

  const sorted = useMemo(() => {
    return [...brands].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [brands]);

  const value = useMemo(() => ({ brands: sorted, refreshBrands }), [sorted, refreshBrands]);

  return <BrandsContext.Provider value={value}>{children}</BrandsContext.Provider>;
}

export function useBrands() {
  const ctx = useContext(BrandsContext);
  if (!ctx) throw new Error("useBrands must be used within BrandsProvider");
  return ctx;
}
