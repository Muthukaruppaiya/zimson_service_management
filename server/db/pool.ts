import pg from "pg";

export type DbPool = pg.Pool;

/** Returns null when no DB configured (JSON fallback for other domains). */
export function createPool(): DbPool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    return new pg.Pool({ connectionString: url, max: 15 });
  }
  if (process.env.PGHOST || process.env.PGDATABASE) {
    return new pg.Pool({
      host: process.env.PGHOST ?? "localhost",
      port: Number(process.env.PGPORT ?? 5433),
      database: process.env.PGDATABASE ?? "zimson_service_management",
      user: process.env.PGUSER ?? "postgres",
      password: process.env.PGPASSWORD ?? "",
    });
  }
  return null;
}
