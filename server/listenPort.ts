/**
 * Listen port for the Node server.
 * - `npm start` (NODE_ENV=production): 5173 so the browser UI matches Vite.
 * - `npm run dev:api`: 4000 so Vite can occupy 5173 and proxy /api.
 * Override with PORT= in .env.
 */
export function listenPort(): number {
  const raw = String(process.env.PORT ?? "").trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return process.env.NODE_ENV === "production" ? 5173 : 4000;
}
