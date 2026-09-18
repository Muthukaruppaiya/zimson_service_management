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
import type { CreateSpareInput, SparePart, UpdateSparePatch } from "../types/spare";
import { normalizeAltName, normalizeAltSku, optionalMasterText, spareSkuBrandKey } from "../lib/spareIdentity";
import { useAuth } from "./AuthContext";

function loadSparesLocal(): SparePart[] {
  try {
    const raw = localStorage.getItem(STORAGE_SPARES);
    if (raw) {
      const parsed = JSON.parse(raw) as SparePart[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s) => ({
          ...s,
          brand: s.brand ?? "",
          altSku: s.altSku ?? null,
          altName: s.altName ?? null,
          modelNo: s.modelNo ?? null,
          caliber: s.caliber ?? null,
          subCategory: s.subCategory ?? null,
          size: s.size ?? null,
          colour: s.colour ?? null,
        }));
      }
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
  updateSpare: (id: string, patch: UpdateSparePatch) => Promise<{ ok: SparePart } | { error: string }>;
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
      const brand = input.brand.trim();
      const name = input.name.trim();
      const description = input.description.trim();
      const category = input.category.trim();
      if (!sku || !brand || !name || !description || !category) {
        return { error: "sku, brand, name, description and category are required." };
      }
      if (spares.some((s) => spareSkuBrandKey(s.sku, s.brand) === spareSkuBrandKey(sku, brand))) {
        return { error: "A spare with this part number and brand already exists." };
      }

      if (api) {
        try {
          const data = await apiJson<{ spare: SparePart }>("/api/spares", {
            method: "POST",
            json: {
              ...input,
              sku,
              brand,
              altSku: normalizeAltSku(input.altSku),
              name,
              altName: normalizeAltName(input.altName),
              description,
              category,
              isActive: input.isActive ?? true,
            },
          });
          setSpares((prev) => {
            const withoutDup = prev.filter((s) => s.id !== data.spare.id);
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
        brand,
        altSku: normalizeAltSku(input.altSku),
        name,
        altName: normalizeAltName(input.altName),
        description,
        category,
        modelNo: optionalMasterText(input.modelNo),
        caliber: optionalMasterText(input.caliber),
        subCategory: optionalMasterText(input.subCategory),
        size: optionalMasterText(input.size, 80),
        colour: optionalMasterText(input.colour, 80),
        hsn: input.hsn?.trim() || null,
        gstPercent: input.gstPercent ?? null,
        costPriceInr: input.costPriceInr ?? null,
        sellingPriceInr: input.sellingPriceInr ?? input.mrpInr ?? null,
        mrpInr: input.mrpInr ?? input.sellingPriceInr ?? null,
        isActive: input.isActive ?? true,
        customFields: input.customFields ?? {},
        createdAt: new Date().toISOString(),
      };
      const next = [row, ...spares];
      setSpares(next);
      saveSparesLocal(next);
      return { ok: row };
    },
    [spares, api],
  );

  const updateSpare = useCallback(
    async (id: string, patch: UpdateSparePatch): Promise<{ ok: SparePart } | { error: string }> => {
      if (patch.name !== undefined && !String(patch.name).trim()) {
        return { error: "Name is required." };
      }
      if (patch.category !== undefined && !String(patch.category).trim()) {
        return { error: "Category is required." };
      }
      if (patch.gstPercent != null && (patch.gstPercent < 0 || patch.gstPercent > 100)) {
        return { error: "GST % must be between 0 and 100." };
      }
      if (patch.costPriceInr != null && patch.costPriceInr < 0) {
        return { error: "Cost price must be a non-negative number." };
      }
      if (patch.sellingPriceInr != null && patch.sellingPriceInr < 0) {
        return { error: "Selling price must be a non-negative number." };
      }
      if (api) {
        try {
          const data = await apiJson<{ spare: SparePart }>(`/api/spares/${encodeURIComponent(id)}`, {
            method: "PATCH",
            json: patch,
          });
          setSpares((prev) => prev.map((s) => (s.id === id ? data.spare : s)));
          return { ok: data.spare };
        } catch (e) {
          const msg = e instanceof ApiError ? e.message : "Could not update spare.";
          return { error: msg };
        }
      }
      const existing = spares.find((s) => s.id === id);
      if (!existing) return { error: "Spare not found." };
      const nextBrand = patch.brand !== undefined ? String(patch.brand).trim() : existing.brand;
      if (
        nextBrand &&
        spares.some(
          (s) => s.id !== id && spareSkuBrandKey(s.sku, s.brand) === spareSkuBrandKey(existing.sku, nextBrand),
        )
      ) {
        return { error: "A spare with this part number and brand already exists." };
      }
      const nextSelling =
        patch.sellingPriceInr !== undefined ? patch.sellingPriceInr : existing.sellingPriceInr;
      const nextRow: SparePart = {
        ...existing,
        brand: nextBrand,
        altSku: patch.altSku !== undefined ? normalizeAltSku(patch.altSku) : existing.altSku,
        name: patch.name !== undefined ? String(patch.name).trim() : existing.name,
        altName: patch.altName !== undefined ? normalizeAltName(patch.altName) : existing.altName,
        description: patch.description !== undefined ? String(patch.description).trim() : existing.description,
        category: patch.category !== undefined ? String(patch.category).trim() : existing.category,
        modelNo: patch.modelNo !== undefined ? optionalMasterText(patch.modelNo) : existing.modelNo,
        caliber: patch.caliber !== undefined ? optionalMasterText(patch.caliber) : existing.caliber,
        subCategory: patch.subCategory !== undefined ? optionalMasterText(patch.subCategory) : existing.subCategory,
        size: patch.size !== undefined ? optionalMasterText(patch.size, 80) : existing.size,
        colour: patch.colour !== undefined ? optionalMasterText(patch.colour, 80) : existing.colour,
        hsn: patch.hsn !== undefined ? patch.hsn?.trim() || null : existing.hsn,
        gstPercent: patch.gstPercent !== undefined ? patch.gstPercent : existing.gstPercent,
        costPriceInr: patch.costPriceInr !== undefined ? patch.costPriceInr : existing.costPriceInr,
        sellingPriceInr: nextSelling,
        mrpInr:
          patch.mrpInr !== undefined
            ? patch.mrpInr
            : patch.sellingPriceInr !== undefined
              ? patch.sellingPriceInr
              : existing.mrpInr,
        isActive: patch.isActive !== undefined ? patch.isActive : existing.isActive,
      };
      const next = spares.map((s) => (s.id === id ? nextRow : s));
      setSpares(next);
      saveSparesLocal(next);
      return { ok: nextRow };
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
      updateSpare,
    }),
    [spares, activeSpares, addSpare, updateSpare],
  );

  return <SparesContext.Provider value={value}>{children}</SparesContext.Provider>;
}

export function useSpares() {
  const ctx = useContext(SparesContext);
  if (!ctx) throw new Error("useSpares must be used within SparesProvider");
  return ctx;
}
