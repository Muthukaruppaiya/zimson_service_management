import type { Pool } from "pg";

export const CUSTOM_FIELD_ENTITY_KEYS = ["customer", "supplier", "spare", "srf"] as const;
export type CustomFieldEntityKey = (typeof CUSTOM_FIELD_ENTITY_KEYS)[number];
export const CUSTOM_FIELD_TYPES = ["text", "textarea", "number", "date", "dropdown", "checkbox", "phone", "email"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export type CustomFieldDefinitionRow = {
  id: string;
  entityKey: CustomFieldEntityKey;
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
  options: string[];
  required: boolean;
  showInList: boolean;
  searchable: boolean;
  helpText: string;
  sortOrder: number;
  isActive: boolean;
};

export type CustomFieldValues = Record<string, string | number | boolean | null>;

export function isCustomFieldEntity(v: string): v is CustomFieldEntityKey {
  return (CUSTOM_FIELD_ENTITY_KEYS as readonly string[]).includes(v);
}

export function isCustomFieldType(v: string): v is CustomFieldType {
  return (CUSTOM_FIELD_TYPES as readonly string[]).includes(v);
}

export function slugifyFieldKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || "field";
}

function rowToDef(r: Record<string, unknown>): CustomFieldDefinitionRow {
  const opts = r.options;
  let options: string[] = [];
  if (Array.isArray(opts)) options = opts.map((x) => String(x ?? "").trim()).filter(Boolean);
  else if (typeof opts === "string") {
    try {
      const p = JSON.parse(opts) as unknown;
      if (Array.isArray(p)) options = p.map((x) => String(x ?? "").trim()).filter(Boolean);
    } catch {
      options = [];
    }
  }
  return {
    id: String(r.id),
    entityKey: r.entityKey as CustomFieldEntityKey,
    fieldKey: String(r.fieldKey),
    label: String(r.label),
    fieldType: r.fieldType as CustomFieldType,
    options,
    required: Boolean(r.required),
    showInList: Boolean(r.showInList),
    searchable: Boolean(r.searchable),
    helpText: String(r.helpText ?? ""),
    sortOrder: Number(r.sortOrder ?? 0),
    isActive: Boolean(r.isActive),
  };
}

const DEF_SELECT = `id,
  entity_key AS "entityKey",
  field_key AS "fieldKey",
  label,
  field_type AS "fieldType",
  options,
  required,
  show_in_list AS "showInList",
  searchable,
  help_text AS "helpText",
  sort_order AS "sortOrder",
  is_active AS "isActive"`;

export async function loadCustomFieldDefs(
  pool: Pool,
  entity: CustomFieldEntityKey,
  activeOnly = true,
): Promise<CustomFieldDefinitionRow[]> {
  const { rows } = await pool.query(
    `SELECT ${DEF_SELECT}
     FROM custom_field_definitions
     WHERE entity_key = $1 ${activeOnly ? "AND is_active = true" : ""}
     ORDER BY sort_order ASC, created_at ASC`,
    [entity],
  );
  return rows.map((r) => rowToDef(r as Record<string, unknown>));
}

export function parseCustomFieldValues(raw: unknown): CustomFieldValues {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: CustomFieldValues = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k.trim()) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v == null) {
      out[k] = v;
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

export function sanitizeCustomFieldValues(
  defs: CustomFieldDefinitionRow[],
  raw: unknown,
): { ok: true; values: CustomFieldValues } | { ok: false; error: string } {
  const incoming = parseCustomFieldValues(raw);
  const values: CustomFieldValues = {};
  for (const def of defs) {
    if (!def.isActive) continue;
    const v = incoming[def.fieldKey];
    if (def.fieldType === "checkbox") {
      values[def.fieldKey] = v === true || v === "true" || v === 1;
      continue;
    }
    if (v == null || String(v).trim() === "") {
      if (def.required) return { ok: false, error: `${def.label} is required.` };
      values[def.fieldKey] = def.fieldType === "number" ? null : "";
      continue;
    }
    if (def.fieldType === "number") {
      const n = Number(v);
      if (Number.isNaN(n)) return { ok: false, error: `${def.label} must be a number.` };
      values[def.fieldKey] = n;
      continue;
    }
    if (def.fieldType === "email") {
      const email = String(v).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: `${def.label} must be a valid email.` };
      values[def.fieldKey] = email;
      continue;
    }
    if (def.fieldType === "dropdown" && def.options.length > 0 && !def.options.includes(String(v))) {
      return { ok: false, error: `${def.label} must be one of the allowed options.` };
    }
    values[def.fieldKey] = String(v).trim();
  }
  return { ok: true, values };
}

export async function validateEntityCustomFields(
  pool: Pool,
  entity: CustomFieldEntityKey,
  raw: unknown,
  opts?: { optionalIfMissing?: boolean },
): Promise<{ ok: true; values: CustomFieldValues } | { ok: false; error: string }> {
  const defs = await loadCustomFieldDefs(pool, entity, true);
  if (defs.length === 0) return { ok: true, values: {} };
  if (opts?.optionalIfMissing && (raw === undefined || raw === null)) return { ok: true, values: {} };
  return sanitizeCustomFieldValues(defs, raw ?? {});
}
