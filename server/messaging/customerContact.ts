import type { Pool } from "pg";

export function phoneLast10(v: string): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function isValidCustomerEmail(value: string): boolean {
  const s = String(value).trim().toLowerCase();
  if (!s || s.length > 240) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Prefer explicit email from the form; otherwise look up customer master by mobile. */
export async function resolveCustomerEmail(
  pool: Pool,
  phone: string,
  explicitEmail?: string | null,
): Promise<string | null> {
  const fromForm = String(explicitEmail ?? "").trim().toLowerCase();
  if (fromForm && isValidCustomerEmail(fromForm)) return fromForm;

  const p10 = phoneLast10(phone);
  if (p10.length !== 10) return null;

  const { rows } = await pool.query<{ email: string }>(
    `SELECT email FROM customers
     WHERE RIGHT(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $1
       AND trim(COALESCE(email, '')) <> ''
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1`,
    [p10],
  );
  const em = rows[0]?.email?.trim().toLowerCase() ?? "";
  return isValidCustomerEmail(em) ? em : null;
}
