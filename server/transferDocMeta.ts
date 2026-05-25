import type { PoolClient } from "pg";

export type TransferPrintKind = "dc" | "transfer";

export type TransferFlow =
  | "store_to_ho"
  | "ho_to_store"
  | "ho_to_ho_dispatch"
  | "ho_to_ho_return";

export type TransferPartyBlock = {
  locationLabel: string;
  legalName: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
};

export type TransferPrintMeta = {
  printKind: TransferPrintKind;
  flow: TransferFlow;
  transferNumber: string;
  from: TransferPartyBlock;
  to: TransferPartyBlock;
};

function normalizeGstin(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function transferPrintKindFromGstins(fromGstin: string, toGstin: string): TransferPrintKind {
  const from = normalizeGstin(fromGstin);
  const to = normalizeGstin(toGstin);
  if (!from || !to) return "dc";
  return from === to ? "transfer" : "dc";
}

function formatAddressJson(raw: unknown, fallback: string): string {
  if (raw && typeof raw === "object") {
    const j = raw as Record<string, unknown>;
    const parts = [j.line1, j.city, j.state, j.pincode].map((x) => String(x ?? "").trim()).filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  return fallback.trim() || "—";
}

async function regionGstin(client: PoolClient, regionId: string): Promise<string> {
  const { rows } = await client.query<{ gst: string | null }>(
    `SELECT COALESCE(gst, '') AS gst FROM regions WHERE id = $1::text`,
    [regionId],
  );
  return String(rows[0]?.gst ?? "").trim();
}

async function loadStoreParty(client: PoolClient, storeId: string): Promise<TransferPartyBlock> {
  const { rows } = await client.query<{
    name: string;
    invoice_display_name: string | null;
    invoice_legal_entity_name: string | null;
    invoice_address: string | null;
    invoice_phone: string | null;
    invoice_email: string | null;
    invoice_gstin: string | null;
    region_id: string;
  }>(
    `SELECT s.name, s.invoice_display_name, s.invoice_legal_entity_name, s.invoice_address,
            s.invoice_phone, s.invoice_email, s.invoice_gstin, s.region_id
     FROM stores s WHERE s.id = $1::text`,
    [storeId],
  );
  const row = rows[0];
  if (!row) {
    return {
      locationLabel: `Store: ${storeId}`,
      legalName: storeId,
      address: "—",
      phone: "—",
      email: "—",
      gstin: "—",
    };
  }
  let address = String(row.invoice_address ?? "").trim();
  if (!address) {
    const { rows: regRows } = await client.query<{ address: string | null; address_json: unknown }>(
      `SELECT address, address_json FROM regions WHERE id = $1::text`,
      [row.region_id],
    );
    address = formatAddressJson(regRows[0]?.address_json, String(regRows[0]?.address ?? ""));
  }
  const display = String(row.invoice_display_name ?? "").trim() || row.name;
  return {
    locationLabel: `Store: ${display}`,
    legalName: String(row.invoice_legal_entity_name ?? "").trim() || display,
    address: address || "—",
    phone: String(row.invoice_phone ?? "").trim() || "—",
    email: String(row.invoice_email ?? "").trim() || "—",
    gstin: String(row.invoice_gstin ?? "").trim() || "—",
  };
}

async function loadRegionHoParty(client: PoolClient, regionId: string): Promise<TransferPartyBlock> {
  const { rows } = await client.query<{
    name: string;
    address: string | null;
    address_json: unknown;
    phone: string | null;
    email: string | null;
    gst: string | null;
  }>(
    `SELECT name, address, address_json, phone, email, gst FROM regions WHERE id = $1::text`,
    [regionId],
  );
  const row = rows[0];
  if (!row) {
    return {
      locationLabel: `HO: ${regionId}`,
      legalName: regionId,
      address: "—",
      phone: "—",
      email: "—",
      gstin: "—",
    };
  }
  return {
    locationLabel: `HO / Service Centre: ${row.name}`,
    legalName: row.name,
    address: formatAddressJson(row.address_json, String(row.address ?? "")) || "—",
    phone: String(row.phone ?? "").trim() || "—",
    email: String(row.email ?? "").trim() || "—",
    gstin: String(row.gst ?? "").trim() || "—",
  };
}

export async function buildStoreToHoPrintMeta(
  client: PoolClient,
  storeId: string,
  regionId: string,
  transferNumber: string,
): Promise<TransferPrintMeta> {
  const from = await loadStoreParty(client, storeId);
  const to = await loadRegionHoParty(client, regionId);
  return {
    printKind: "transfer",
    flow: "store_to_ho",
    transferNumber,
    from,
    to,
  };
}

export async function buildHoOutwardPrintMeta(
  client: PoolClient,
  args: {
    fromRegionId: string;
    destinationStoreId: string;
    transferNumber: string;
    isInterHoBatch: boolean;
    interHoTargetRegionId: string | null;
    isReturnLeg: boolean;
  },
): Promise<TransferPrintMeta> {
  const from = await loadRegionHoParty(client, args.fromRegionId);
  if (args.isInterHoBatch && args.interHoTargetRegionId) {
    const to = await loadRegionHoParty(client, args.interHoTargetRegionId);
    return {
      printKind: "dc",
      flow: args.isReturnLeg ? "ho_to_ho_return" : "ho_to_ho_dispatch",
      transferNumber: args.transferNumber,
      from,
      to,
    };
  }
  const to = await loadStoreParty(client, args.destinationStoreId);
  return {
    printKind: "transfer",
    flow: "ho_to_store",
    transferNumber: args.transferNumber,
    from,
    to,
  };
}
