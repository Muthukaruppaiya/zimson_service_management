import type {
  CustomFieldDefinition,
  CustomFieldType,
  CustomFieldValue,
  CustomFieldValues,
} from "../types/customField";

export function slugifyFieldKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || "field";
}

export function isCustomFieldType(v: string): v is CustomFieldType {
  return (
    v === "text" ||
    v === "textarea" ||
    v === "number" ||
    v === "date" ||
    v === "dropdown" ||
    v === "checkbox" ||
    v === "phone" ||
    v === "email"
  );
}

export function parseCustomFieldValues(raw: unknown): CustomFieldValues {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: CustomFieldValues = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k.trim()) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v == null) {
      out[k] = v as CustomFieldValue;
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

export function formatCustomFieldDisplay(def: CustomFieldDefinition, values: CustomFieldValues | undefined): string {
  const v = values?.[def.fieldKey];
  if (v == null || v === "") return "—";
  if (def.fieldType === "checkbox") return v === true || v === "true" || v === 1 ? "Yes" : "No";
  return String(v);
}

export function customFieldsMatchSearch(
  values: CustomFieldValues | undefined,
  defs: CustomFieldDefinition[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const bag = values ?? {};
  for (const def of defs) {
    if (!def.isActive || !def.searchable) continue;
    const shown = formatCustomFieldDisplay(def, bag);
    if (shown.toLowerCase().includes(q)) return true;
  }
  return false;
}

export function listCustomFieldDefs(defs: CustomFieldDefinition[]): CustomFieldDefinition[] {
  return defs.filter((d) => d.isActive && d.showInList).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function requiredCustomFieldError(defs: CustomFieldDefinition[], values: CustomFieldValues): string | null {
  for (const def of defs.filter((d) => d.isActive && d.required)) {
    const v = values[def.fieldKey];
    if (def.fieldType === "checkbox") continue;
    if (v == null || String(v).trim() === "") return `${def.label} is required.`;
    if (def.fieldType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())) {
      return `${def.label} must be a valid email.`;
    }
    if (def.fieldType === "number" && Number.isNaN(Number(v))) {
      return `${def.label} must be a number.`;
    }
    if (def.fieldType === "dropdown" && def.options.length > 0 && !def.options.includes(String(v))) {
      return `${def.label} must be one of the allowed options.`;
    }
  }
  return null;
}

export function customFieldTypeLabel(t: CustomFieldType): string {
  if (t === "textarea") return "Long text";
  if (t === "dropdown") return "Dropdown";
  if (t === "checkbox") return "Yes / No";
  if (t === "phone") return "Phone";
  if (t === "email") return "Email";
  if (t === "number") return "Number";
  if (t === "date") return "Date";
  return "Text";
}
