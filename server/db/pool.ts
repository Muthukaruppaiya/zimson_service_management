import fs from "node:fs";
import path from "node:path";
import pg from "pg";

export type DbPool = pg.Pool;

function resolvePgSsl(): pg.ConnectionConfig["ssl"] {
  const mode = (process.env.PGSSLMODE ?? "").trim().toLowerCase();
  if (mode === "disable" || mode === "false") return false;

  const url = process.env.DATABASE_URL ?? "";
  const urlWantsSsl =
    /sslmode=(require|verify-full|verify-ca|prefer)/i.test(url) ||
    /ssl=true/i.test(url);

  if (!mode && !urlWantsSsl && process.env.PGSSLROOTCERT === undefined) {
    return undefined;
  }

  const certPath =
    process.env.PGSSLROOTCERT?.trim() ||
    path.join(process.cwd(), "certs", "global-bundle.pem");

  if (fs.existsSync(certPath)) {
    return { rejectUnauthorized: true, ca: fs.readFileSync(certPath) };
  }

  if (mode === "verify-full" || /sslmode=verify-full/i.test(url)) {
    console.warn(
      "[db] PGSSLMODE=verify-full but RDS CA bundle not found at",
      certPath,
      "— run: npm run certs:rds",
    );
  }

  return { rejectUnauthorized: true };
}

/** Returns null when no DB configured (JSON fallback for other domains). */
export function createPool(): DbPool | null {
  const ssl = resolvePgSsl();
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    return new pg.Pool({ connectionString: url, max: Number(process.env.PGPOOL_MAX ?? 15), ssl });
  }
  if (process.env.PGHOST || process.env.PGDATABASE) {
    return new pg.Pool({
      host: process.env.PGHOST ?? "localhost",
      port: Number(process.env.PGPORT ?? 5433),
      database: process.env.PGDATABASE ?? "zimson_service_management",
      user: process.env.PGUSER ?? "postgres",
      password: process.env.PGPASSWORD ?? "",
      ssl,
      max: Number(process.env.PGPOOL_MAX ?? 15),
    });
  }
  return null;
}
