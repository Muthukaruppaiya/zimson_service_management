import type { Pool } from "pg";

let cache: { bySpareId: Map<string, number>; expMs: number } | null = null;
const CACHE_TTL_MS = 60 * 1000;

/** GST % per spare id from Inventory catalogue (dynamic — not seeded). */
export async function loadSpareGstById(pool: Pool): Promise<Map<string, number>> {
  const now = Date.now();
  if (cache && cache.expMs > now) return cache.bySpareId;

  const { rows } = await pool.query<{ id: string; gst_percent: string | null }>(
    `SELECT id::text, gst_percent::text FROM spares WHERE gst_percent IS NOT NULL`,
  );
  const bySpareId = new Map<string, number>();
  for (const row of rows) {
    const pct = Number.parseFloat(row.gst_percent ?? "");
    if (Number.isFinite(pct)) bySpareId.set(row.id, pct);
  }
  cache = { bySpareId, expMs: now + CACHE_TTL_MS };
  return bySpareId;
}

export function clearSpareGstCache(): void {
  cache = null;
}
