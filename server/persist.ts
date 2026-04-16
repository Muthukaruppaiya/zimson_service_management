import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SeedRegion } from "../src/data/seed";
import type { CustomerRecord } from "../src/types/customer";
import type { DemoUser, SessionUser } from "../src/types/user";
import type { SrfJob } from "../src/types/srfJob";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_PATH = join(__dirname, "data", "state.json");

export type AppState = {
  version: 1;
  extraUsers: DemoUser[];
  regions: SeedRegion[] | null;
  customersExtra: CustomerRecord[];
  srfJobs: SrfJob[] | null;
};

const defaultState = (): AppState => ({
  version: 1,
  extraUsers: [],
  regions: null,
  customersExtra: [],
  srfJobs: null,
});

export function readState(): AppState {
  try {
    if (!existsSync(DATA_PATH)) return defaultState();
    const raw = readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as AppState;
    if (parsed && typeof parsed === "object" && parsed.version === 1) {
      return {
        ...defaultState(),
        ...parsed,
        extraUsers: Array.isArray(parsed.extraUsers) ? parsed.extraUsers : [],
        customersExtra: Array.isArray(parsed.customersExtra) ? parsed.customersExtra : [],
      };
    }
  } catch {
    /* ignore */
  }
  return defaultState();
}

export function writeState(next: AppState): void {
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  const tmp = `${DATA_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, DATA_PATH);
}

export function stripPassword(u: DemoUser): SessionUser {
  const { password: _p, ...rest } = u;
  return rest;
}
