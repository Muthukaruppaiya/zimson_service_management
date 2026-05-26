import type { Express, Request, Response } from "express";
import type { Pool } from "pg";
import type { DemoUser } from "../src/types/user";
import { SEED_WATCH_CASE_TYPES, SEED_WATCH_STRAP_CHAIN_TYPES } from "../src/data/watchCatalogSeed";

type Authed = Request & { userId: string };

function registerCatalogRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: () => void) => void,
  getUserById: (id: string) => DemoUser | null,
  table: "watch_case_types_catalog" | "watch_strap_chain_types_catalog",
  path: string,
) {
  app.get(path, requireAuth, async (req, res) => {
    if (!getUserById((req as Authed).userId)) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const q = String(req.query.q ?? "").trim().toLowerCase();
    try {
      const params: string[] = [];
      let where = "WHERE is_active = true";
      if (q) {
        params.push(`%${q}%`);
        where += ` AND name_norm LIKE $1`;
      }
      const { rows } = await pool.query<{ id: string; name: string }>(
        `SELECT id::text AS id, name
         FROM ${table}
         ${where}
         ORDER BY sort_order ASC, name ASC`,
        params,
      );
      res.json({ items: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not load catalog." });
    }
  });

  app.post(path, requireAuth, async (req, res) => {
    const actor = getUserById((req as Authed).userId);
    if (!actor) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    const name = String(req.body?.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "name is required." });
      return;
    }
    if (name.length > 200) {
      res.status(400).json({ error: "name is too long." });
      return;
    }
    const nameNorm = name.toLowerCase();
    try {
      const ins = await pool.query<{ id: string }>(
        `INSERT INTO ${table} (name, name_norm, created_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (name_norm) DO NOTHING
         RETURNING id::text AS id`,
        [name, nameNorm, actor.id],
      );
      let id = ins.rows[0]?.id;
      if (!id) {
        const sel = await pool.query<{ id: string }>(
          `SELECT id::text AS id FROM ${table} WHERE name_norm = $1`,
          [nameNorm],
        );
        id = sel.rows[0]?.id;
      }
      res.json({ ok: true, id: id ?? null, wasNew: Boolean(ins.rows[0]) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not save catalog entry." });
    }
  });
}

export function registerWatchCatalogRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: Request, res: Response, next: () => void) => void,
  getUserById: (id: string) => DemoUser | null,
) {
  registerCatalogRoutes(
    app,
    pool,
    requireAuth,
    getUserById,
    "watch_case_types_catalog",
    "/api/service/watch-case-types",
  );
  registerCatalogRoutes(
    app,
    pool,
    requireAuth,
    getUserById,
    "watch_strap_chain_types_catalog",
    "/api/service/watch-strap-chain-types",
  );
}

export async function seedWatchCatalogTables(pool: Pool): Promise<void> {
  let order = 0;
  for (const name of SEED_WATCH_CASE_TYPES) {
    await pool.query(
      `INSERT INTO watch_case_types_catalog (name, name_norm, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (name_norm) DO NOTHING`,
      [name, name.toLowerCase(), order++],
    );
  }
  order = 0;
  for (const name of SEED_WATCH_STRAP_CHAIN_TYPES) {
    await pool.query(
      `INSERT INTO watch_strap_chain_types_catalog (name, name_norm, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (name_norm) DO NOTHING`,
      [name, name.toLowerCase(), order++],
    );
  }
}
