import type { Express, Request, Response } from "express";
import type { Pool } from "pg";

const COUNTRIES_NOW = "https://countriesnow.space/api/v0.1";

/** Fallback when DB has no countries row (e.g. early boot). */
const ISO_COUNTRY_NAME: Record<string, string> = {
  IN: "India",
  AE: "United Arab Emirates",
  SG: "Singapore",
  US: "United States",
  GB: "United Kingdom",
  AU: "Australia",
  MY: "Malaysia",
  LK: "Sri Lanka",
};

async function countryDisplayName(pool: Pool | null, countryId: string): Promise<string> {
  if (pool) {
    try {
      const { rows } = await pool.query<{ name: string }>(`SELECT name FROM countries WHERE id = $1 LIMIT 1`, [
        countryId,
      ]);
      if (rows[0]?.name?.trim()) return rows[0].name.trim();
    } catch {
      /* ignore */
    }
  }
  return ISO_COUNTRY_NAME[countryId] ?? countryId;
}

function parseStatesPayload(json: unknown): string[] {
  const root = json as { data?: { states?: unknown[] }; error?: boolean; msg?: string };
  if (root?.error || !root?.data?.states) return [];
  const out: string[] = [];
  for (const s of root.data.states) {
    if (typeof s === "string") out.push(s);
    else if (s && typeof s === "object" && "name" in s && typeof (s as { name: string }).name === "string") {
      out.push((s as { name: string }).name.trim());
    }
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

function parseCitiesPayload(json: unknown): string[] {
  const root = json as { data?: unknown[]; error?: boolean };
  if (root?.error || !Array.isArray(root.data)) return [];
  const out: string[] = [];
  for (const c of root.data) {
    if (typeof c === "string") out.push(c);
    else if (c && typeof c === "object" && "name" in c && typeof (c as { name: string }).name === "string") {
      out.push((c as { name: string }).name.trim());
    }
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

export function registerGeoRoutes(app: Express, dbPool: Pool | null) {
  app.get("/api/geo/states", async (req: Request, res: Response) => {
    const countryId = String(req.query.countryId ?? "").trim();
    if (!countryId) {
      res.status(400).json({ error: "countryId is required." });
      return;
    }
    try {
      const countryName = await countryDisplayName(dbPool, countryId);
      const r = await fetch(`${COUNTRIES_NOW}/countries/states`, {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ country: countryName }),
      });
      const json: unknown = await r.json().catch(() => ({}));
      if (!r.ok) {
        res.status(502).json({ error: "Could not load states from location service." });
        return;
      }
      const states = parseStatesPayload(json);
      res.json({ states });
    } catch (e) {
      console.error("[geo/states]", e);
      res.status(502).json({ error: "Could not load states." });
    }
  });

  app.get("/api/geo/districts", async (req: Request, res: Response) => {
    const countryId = String(req.query.countryId ?? "").trim();
    const stateName = String(req.query.state ?? "").trim();
    if (!countryId || !stateName) {
      res.status(400).json({ error: "countryId and state are required." });
      return;
    }
    try {
      const countryName = await countryDisplayName(dbPool, countryId);
      const r = await fetch(`${COUNTRIES_NOW}/countries/state/cities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ country: countryName, state: stateName }),
      });
      const json: unknown = await r.json().catch(() => ({}));
      if (!r.ok) {
        res.status(502).json({ error: "Could not load districts from location service." });
        return;
      }
      const districts = parseCitiesPayload(json);
      res.json({ districts });
    } catch (e) {
      console.error("[geo/districts]", e);
      res.status(502).json({ error: "Could not load districts." });
    }
  });

  /** India PIN → state / district / post offices (public India Post data via api.postalpincode.in). */
  app.get("/api/geo/pin-lookup-in", async (req: Request, res: Response) => {
    const pin = String(req.query.pincode ?? "").replace(/\D/g, "");
    if (pin.length !== 6) {
      res.status(400).json({ error: "Enter a 6-digit Indian PIN code." });
      return;
    }
    try {
      const r = await fetch(`https://api.postalpincode.in/pincode/${encodeURIComponent(pin)}`, {
        headers: { accept: "application/json" },
      });
      const json = (await r.json()) as {
        Status?: string;
        Message?: string;
        PostOffice?: Array<{ Name?: string; District?: string; State?: string; Block?: string }>;
      };
      if (json.Status !== "Success" || !Array.isArray(json.PostOffice) || json.PostOffice.length === 0) {
        res.status(404).json({ error: json.Message ?? "PIN code not found." });
        return;
      }
      const offices = json.PostOffice;
      const states = [...new Set(offices.map((o) => (o.State ?? "").trim()).filter(Boolean))];
      const districts = [...new Set(offices.map((o) => (o.District ?? "").trim()).filter(Boolean))];
      const state = states[0] ?? "";
      const district = districts[0] ?? "";
      const citySuggestion = (offices[0]?.Name ?? "").trim();
      res.json({
        state,
        district,
        districts,
        states,
        postOffices: offices.map((o) => ({
          name: (o.Name ?? "").trim(),
          district: (o.District ?? "").trim(),
          state: (o.State ?? "").trim(),
          block: (o.Block ?? "").trim(),
        })),
        citySuggestion,
      });
    } catch (e) {
      console.error("[geo/pin-lookup-in]", e);
      res.status(502).json({ error: "Could not look up PIN code." });
    }
  });
}
