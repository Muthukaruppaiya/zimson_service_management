# Zimson service management

React + TypeScript + Vite + Tailwind front end with a small **Node (Express) API** and **JSON file persistence** so the app behaves as software, not only a browser-only wireframe.

## Run in development

```bash
npm install
npm run dev
```

This starts:

- **API** on `http://127.0.0.1:4000` (session cookies, CRUD for regions, customers, SRF jobs, spares, user creation)
- **Vite** on `http://127.0.0.1:5173` with `/api` proxied to the API

Sign in with the seeded demo accounts (see login page table).

## Data

- **API mode (default):** state is stored under `server/data/state.json` (gitignored). Seeded users always come from `src/data/seed.ts`; extra users and mutations are merged on the server.
- **Legacy wireframe mode:** set `VITE_USE_API=false` in `.env.development` and run only `npm run dev:web` — the UI uses `localStorage` as before.

## Production build

```bash
npm run build
npm run start
```

With `NODE_ENV=production`, the API serves the built SPA from `dist/` and continues to persist to `server/data/state.json`. Use a reverse proxy (HTTPS, rate limits, real auth) before exposing to the internet.

## Scripts

| Script | Purpose |
|--------|--------|
| `npm run dev` | API + Vite together |
| `npm run dev:web` | Vite only |
| `npm run dev:api` | API only (watch) |
| `npm run build` | Typecheck client + Vite production bundle |
| `npm run start` | Production API + static `dist` |
| `npm run typecheck:server` | Typecheck `server/` |

## Next steps toward production

- Replace demo passwords with hashed credentials and a real session store.
- Move `state.json` to PostgreSQL/SQLite and add migrations.
- Add CSRF protection and stricter CORS for deployed origins.
# zimson_service_management
