import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, apiJson, useApiMode } from "../lib/api";
import { createId } from "../lib/id";
import { STORAGE_SPARES } from "../lib/storageKeys";
import type { CreateSpareInput, SparePart } from "../types/spare";
import { useAuth } from "./AuthContext";

function loadSparesLocal(): SparePart[] {
  try {
    const raw = localStorage.getItem(STORAGE_SPARES);
    if (raw) {
      const parsed = JSON.parse(raw) as SparePart[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

function saveSparesLocal(rows: SparePart[]) {
  localStorage.setItem(STORAGE_SPARES, JSON.stringify(rows));
}

type SparesContextValue = {
  spares: SparePart[];
  activeSpares: SparePart[];
  addSpare: (input: CreateSpareInput) => Promise<{ ok: SparePart } | { error: string }>;
};

const SparesContext = createContext<SparesContextValue | null>(null);

export function SparesProvider({ children }: { children: ReactNode }) {
  const api = useApiMode();
  const { user, authReady } = useAuth();
  const [spares, setSpares] = useState<SparePart[]>(() => (api ? [] : loadSparesLocal()));

  useEffect(() => {
    if (!api || !authReady || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<{ spares: SparePart[] }>("/api/spares");
        if (!cancelled) setSpares(data.spares);
      } catch {
        if (!cancelled) setSpares([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, authReady, user?.id]);

  const addSpare = useCallback(
    async (input: CreateSpareInput): Promise<{ ok: SparePart } | { error: string }> => {
      const sku = input.sku.trim().toUpperCase();
      const name = input.name.trim();
      const category = input.category.trim();
      const uom = input.uom.trim() || "PCS";
      if (!sku) return { error: "SKU is required." };
      if (!name) return { error: "Description is required." };
      if (!category) return { error: "Category is required." };
      if (spares.some((s) => s.sku.trim().toUpperCase() === sku)) {
        return { error: "A spare with this SKU already exists." };
      }

      if (api) {
        try {
          const data = await apiJson<{ spare: SparePart }>("/api/spares", {
            method: "POST",
            json: { ...input, sku, name, category, uom },
          });
          setSpares((prev) => {
            const withoutDup = prev.filter((s) => s.sku.toUpperCase() !== data.spare.sku.toUpperCase());
            return [data.spare, ...withoutDup];
          });
          return { ok: data.spare };
        } catch (e) {
          const msg = e instanceof ApiError ? e.message : "Could not add spare.";
          return { error: msg };
        }
      }

      const row: SparePart = {
        id: createId("spare"),
        sku,
        name,
        category,
        uom,
        hsn: input.hsn?.trim() || null,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      const next = [row, ...spares];
      setSpares(next);
      saveSparesLocal(next);
      return { ok: row };
    },
    [spares, api],
  );

  const activeSpares = useMemo(
    () => spares.filter((s) => s.isActive).sort((a, b) => a.sku.localeCompare(b.sku)),
    [spares],
  );

  const value = useMemo(
    () => ({
      spares: [...spares].sort((a, b) => a.sku.localeCompare(b.sku)),
      activeSpares,
      addSpare,
    }),
    [spares, activeSpares, addSpare],
  );

  return <SparesContext.Provider value={value}>{children}</SparesContext.Provider>;
}

export function useSpares() {
  const ctx = useContext(SparesContext);
  if (!ctx) throw new Error("useSpares must be used within SparesProvider");
  return ctx;
}
