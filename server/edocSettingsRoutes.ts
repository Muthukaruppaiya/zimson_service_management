import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import {
  refreshEdocSettingsCache,
  saveEdocSettings,
  toPublicEdocSettings,
  normalizeEwayPath,
  type EdocSettingsDb,
} from "./edocSettingsStore";

type Authed = Request & { userId: string };

function parseBool(raw: unknown): boolean | undefined {
  if (raw === true || raw === "true") return true;
  if (raw === false || raw === "false") return false;
  return undefined;
}

function bodyToDb(body: Record<string, unknown>): EdocSettingsDb {
  const nominalRaw = body.ewayNominalValueInr;
  const nominal =
    nominalRaw === undefined || nominalRaw === ""
      ? undefined
      : Math.max(1, Math.round(Number(nominalRaw)) || 1000);

  return {
    enabled: parseBool(body.enabled),
    failOpen: parseBool(body.failOpen),
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
    ewayNominalValueInr: nominal,
    ewayAutoEnabled: parseBool(body.ewayAutoEnabled),
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
      res.json({ settings: toPublicEdocSettings() });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load e-doc settings." });
    }
  });

  app.put("/api/settings/edoc", requireAuth, async (req, res) => {
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
      const settings = await saveEdocSettings(bodyToDb(req.body as Record<string, unknown>), actor.displayName?.trim() || actor.email);
      res.json({ settings });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not save e-doc settings." });
    }
  });
}
