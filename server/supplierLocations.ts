import { randomUUID } from "node:crypto";

export type SupplierLocationRow = {
  id: string;
  branchName: string;
  branchCode: string;
  contactName: string;
  phone: string;
  email: string;
  doorNo: string;
  street: string;
  place: string;
  district: string;
  state: string;
  pinCode: string;
};

const ADDRESS_KEYS = ["doorNo", "street", "place", "district", "state", "pinCode"] as const;

function str(v: unknown): string {
  return String(v ?? "").trim();
}

export function normalizeLocations(raw: unknown): SupplierLocationRow[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((x) => {
      const row = typeof x === "object" && x !== null ? (x as Record<string, unknown>) : {};
      let id = str(row.id);
      if (!id || seen.has(id)) id = randomUUID();
      seen.add(id);
      return {
        id,
        branchName: str(row.branchName),
        branchCode: str(row.branchCode).toUpperCase(),
        contactName: str(row.contactName),
        phone: str(row.phone),
        email: str(row.email),
        doorNo: str(row.doorNo),
        street: str(row.street),
        place: str(row.place),
        district: str(row.district),
        state: str(row.state),
        pinCode: str(row.pinCode),
      };
    })
    .filter((r) => r.branchName || r.branchCode || ADDRESS_KEYS.some((k) => r[k]));
}

export function toLegacyAddress(locations: SupplierLocationRow[]): string | null {
  if (locations.length === 0) return null;
  const first = locations[0]!;
  const parts = ADDRESS_KEYS.map((k) => first[k]).filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function locationKey(l: SupplierLocationRow): string {
  if (l.branchCode) return `code:${l.branchCode}`;
  if (l.branchName) return `name:${l.branchName.toUpperCase()}`;
  return `addr:${ADDRESS_KEYS.map((k) => l[k].toUpperCase()).join("|")}`;
}

/** Merge incoming branches into existing ones; matching branches keep their id so old POs/GRNs still resolve. */
export function mergeLocations(existing: SupplierLocationRow[], incoming: SupplierLocationRow[]): SupplierLocationRow[] {
  const out = existing.map((l) => ({ ...l }));
  const index = new Map(out.map((l, i) => [locationKey(l), i]));
  for (const inc of incoming) {
    const key = locationKey(inc);
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push({ ...inc });
      continue;
    }
    const cur = out[at]!;
    const merged: SupplierLocationRow = { ...cur };
    for (const k of Object.keys(inc) as Array<keyof SupplierLocationRow>) {
      if (k === "id") continue;
      if (inc[k]) merged[k] = inc[k];
    }
    out[at] = merged;
  }
  return out;
}

/**
 * Splits names like "TITAN CO LTD LBKA" / "TITAN CO LTD CCPT" into a shared base
 * ("TITAN CO LTD") and per-row branch suffixes ("LBKA", "CCPT").
 */
export function splitBranchNames(names: string[]): { base: string; suffixes: string[] } {
  const cleaned = names.map((n) => n.trim().replace(/\s+/g, " "));
  if (cleaned.length === 0) return { base: "", suffixes: [] };
  const tokenLists = cleaned.map((n) => n.split(" "));
  let common = 0;
  const minLen = Math.min(...tokenLists.map((t) => t.length));
  while (
    common < minLen &&
    tokenLists.every((t) => t[common]!.toUpperCase() === tokenLists[0]![common]!.toUpperCase())
  ) {
    common += 1;
  }
  if (cleaned.length === 1 || common === 0) {
    return { base: cleaned[0]!, suffixes: cleaned.map((n, i) => (i === 0 ? "" : n)) };
  }
  const base = tokenLists[0]!.slice(0, common).join(" ").replace(/[\s\-–,/]+$/, "");
  const suffixes = tokenLists.map((t) => t.slice(common).join(" ").replace(/^[\s\-–,/()]+|[\s)]+$/g, ""));
  return { base: base || cleaned[0]!, suffixes };
}

/** Accepts supplier_branch_id only if it matches one of the supplier's locations. */
export async function resolveSupplierBranchId(
  db: { query: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  supplierId: string,
  raw: unknown,
): Promise<string | null> {
  const id = str(raw);
  if (!id || !supplierId) return null;
  const { rows } = await db.query(`SELECT locations_json FROM suppliers WHERE id = $1::uuid`, [supplierId]);
  const locs = normalizeLocationsStable(rows[0]?.locations_json);
  return locs.some((l) => l.id === id) ? id : null;
}

/** Like normalizeLocations but never invents ids (for reading stored rows). */
function normalizeLocationsStable(raw: unknown): Array<{ id: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "object" && x !== null ? { id: str((x as Record<string, unknown>).id) } : { id: "" }))
    .filter((x) => x.id);
}
