import type { PoolClient } from "pg";

type Queryable = {
  query: (
    sql: string,
    values?: unknown[],
  ) => Promise<{ rows: Array<{ last_value: number }> }>;
};

/** SUP2610001 / CUST2610001 / PRT2610001 */
export async function nextYearlyCode(
  client: Queryable,
  prefix: string,
  pad = 5,
  startAt = 1001,
): Promise<string> {
  const yy = String(new Date().getFullYear()).slice(-2);
  const seq = await client.query(
    `INSERT INTO number_sequences (prefix, scope_code, year_2, last_value)
     VALUES ($1, 'GLOBAL', $2, $3)
     ON CONFLICT (prefix, scope_code, year_2)
     DO UPDATE SET last_value = number_sequences.last_value + 1
     RETURNING last_value`,
    [prefix, yy, startAt],
  );
  const num = String(seq.rows[0]!.last_value).padStart(pad, "0");
  return `${prefix}${yy}${num}`;
}

export function nextSupplierCode(client: Queryable): Promise<string> {
  return nextYearlyCode(client, "SUP", 5);
}

export function nextCustomerCode(client: Queryable): Promise<string> {
  return nextYearlyCode(client, "CUST", 5);
}

export function nextPartNumber(client: Queryable): Promise<string> {
  return nextYearlyCode(client, "PRT", 5);
}

export type WritableClient = Pick<PoolClient, "query">;
