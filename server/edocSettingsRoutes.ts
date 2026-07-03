import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import {
  refreshEdocSettingsCache,
  saveEdocGlobalSettings,
  saveRegionEdocSettings,
  toPublicGlobalEdocSettings,
  listRegionEdocSettingsPublic,
  normalizeEwayPath,
  toPublicEdocSettings,
  type EdocRegionCredentialsDb,
  type EdocGlobalSettingsDb,
} from "./edocSettingsStore";

type Authed = Request & { userId: string };

function parseBool(raw: unknown): boolean | undefined {
  if (raw === true || raw === "true") return true;
  if (raw === false || raw === "false") return false;
  return undefined;
}

function bodyToRegionCredentials(body: Record<string, unknown>): EdocRegionCredentialsDb {
  return {
    enabled: parseBool(body.enabled),
    username: String(body.username ?? "").trim().slice(0, 200) || undefined,
    password: String(body.password ?? "").trim().slice(0, 500) || undefined,
    ewayUsername: String(body.ewayUsername ?? "").trim().slice(0, 200) || undefined,
    ewayPassword: String(body.ewayPassword ?? "").trim().slice(0, 500) || undefined,
    apiBase: String(body.apiBase ?? "").trim().slice(0, 500) || undefined,
    ewayApiBase: String(body.ewayApiBase ?? "").trim().slice(0, 500) || undefined,
    tokenUrl: String(body.tokenUrl ?? "").trim().slice(0, 500) || undefined,
    einvoicePath: String(body.einvoicePath ?? "").trim().slice(0, 120) || undefined,
    ewayPath: normalizeEwayPath(String(body.ewayPath ?? "").trim()).slice(0, 120) || undefined,
    sellerGstinOverride: String(body.sellerGstinOverride ?? "").trim().toUpperCase().slice(0, 15) || undefined,
    ewayUserGstin: String(body.ewayUserGstin ?? "").trim().toUpperCase().slice(0, 15) || undefined,
  };
}

function bodyToGlobalSettings(body: Record<string, unknown>): EdocGlobalSettingsDb {
  const nominalRaw = body.ewayNominalValueInr;
  const nominal =
    nominalRaw === undefined || nominalRaw === ""
      ? undefined
      : Math.max(1, Math.round(Number(nominalRaw)) || 1000);
  return {
    failOpen: parseBool(body.failOpen),
    ewayAutoEnabled: parseBool(body.ewayAutoEnabled),
    ewayNominalValueInr: nominal,
  };
}

export function registerEdocSettingsRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  getUserById: (id: string) => DemoUser | null,
): void {
  app.get("/api/settings/edoc", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (actor.role !== "super_admin") {
      res.status(403).json({ error: "Only super admin can view e-doc settings." });
      return;
    }
    try {
      await refreshEdocSettingsCache();
      const global = toPublicGlobalEdocSettings();
      const regions = await listRegionEdocSettingsPublic();
      res.json({ global, regions, settings: toPublicEdocSettings() });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load e-doc settings." });
    }
  });

  app.put("/api/settings/edoc/global", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (actor.role !== "super_admin") {
      res.status(403).json({ error: "Only super admin can update e-doc settings." });
      return;
    }
    try {
      const global = await saveEdocGlobalSettings(bodyToGlobalSettings(req.body as Record<string, unknown>), actor.displayName?.trim() || actor.email);
      res.json({ global });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not save global e-doc settings." });
    }
  });

  app.put("/api/settings/edoc/regions/:regionId", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    if (actor.role !== "super_admin") {
      res.status(403).json({ error: "Only super admin can update e-doc settings." });
      return;
    }
    try {
      const row = await saveRegionEdocSettings(
        String(req.params.regionId ?? ""),
        bodyToRegionCredentials(req.body as Record<string, unknown>),
        actor.displayName?.trim() || actor.email,
      );
      res.json({ row });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: e instanceof Error ? e.message : "Could not save region e-doc settings." });
    }
  });

  /** @deprecated Use PUT /api/settings/edoc/global and /regions/:regionId */
  app.put("/api/settings/edoc", requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor || actor.role !== "super_admin") {
      res.status(403).json({ error: "Only super admin can update e-doc settings." });
      return;
    }
    try {
      const global = await saveEdocGlobalSettings(bodyToGlobalSettings(req.body as Record<string, unknown>), actor.displayName?.trim() || actor.email);
      res.json({ settings: global });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not save e-doc settings." });
    }
  });
}
