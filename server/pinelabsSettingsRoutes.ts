import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import type { PinelabsStoreSettingsDb } from "./pinelabsSettingsStore";
import {
  listPinelabsStoreSettings,
  normalizePinelabsEnvironment,
  PinelabsSettingsConflictError,
  savePinelabsStoreSettings,
} from "./pinelabsSettingsStore";

type Authed = Request & { userId: string };

function parseBool(raw: unknown): boolean | undefined {
  if (raw === true || raw === "true") return true;
  if (raw === false || raw === "false") return false;
  return undefined;
}

export function registerPinelabsSettingsRoutes(
  app: Express,
  _pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/settings/pinelabs", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (actor.role !== "super_admin") {
      res.status(403).json({ error: "Only super admin can view Pine Labs settings." });
      return;
    }
    try {
      const stores = await listPinelabsStoreSettings();
      res.json({ stores });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load Pine Labs settings." });
    }
  });

  app.put("/api/settings/pinelabs/:storeId", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (actor.role !== "super_admin") {
      res.status(403).json({ error: "Only super admin can update Pine Labs settings." });
      return;
    }
    const storeId = String(req.params.storeId ?? "").trim();
    if (!storeId) {
      res.status(400).json({ error: "Store is required." });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Partial<PinelabsStoreSettingsDb> = {};
    const enabled = parseBool(body.enabled);
    if (enabled !== undefined) patch.enabled = enabled;
    if (body.environment !== undefined) patch.environment = normalizePinelabsEnvironment(body.environment);
    if (body.merchantId !== undefined) patch.merchantId = String(body.merchantId ?? "").trim().slice(0, 40);
    if (body.securityToken !== undefined) patch.securityToken = String(body.securityToken ?? "").trim().slice(0, 200);
    if (body.pineLabsStoreId !== undefined) patch.pineLabsStoreId = String(body.pineLabsStoreId ?? "").trim().slice(0, 40);
    if (body.clientId !== undefined) patch.clientId = String(body.clientId ?? "").trim().slice(0, 40);
    if (body.imei !== undefined) patch.imei = String(body.imei ?? "").replace(/\D/g, "").slice(0, 20);
    try {
      const settings = await savePinelabsStoreSettings(storeId, patch, actor.displayName?.trim() || actor.email);
      res.json({ settings });
    } catch (e) {
      if (e instanceof PinelabsSettingsConflictError) {
        res.status(400).json({ error: e.message });
        return;
      }
      const msg = e instanceof Error ? e.message : "";
      if (msg === "Store not found.") {
        res.status(404).json({ error: "Store not found." });
        return;
      }
      console.error(e);
      res.status(500).json({ error: "Could not save Pine Labs settings." });
    }
  });
}
