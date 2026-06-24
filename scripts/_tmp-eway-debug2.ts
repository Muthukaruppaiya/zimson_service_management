import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { rebuildPrintMetaForChallan } from "../server/transferDocMeta.js";
import { buildEwayPayload, partyFromTransferBlock, nominalEwayTotals } from "../server/mastersIndiaEdoc/buildPayload.js";
import { getEdocAccessToken } from "../server/mastersIndiaEdoc/auth.js";
import { alignSandboxEdocEwayParties, resolveEdocEwayUserGstin } from "../server/mastersIndiaEdoc/config.js";
import { tryGenerateEwayForChallanId } from "../server/mastersIndiaEdoc/hooks.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});

await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;
const dcId = "1b042eb1-8497-4337-b4a5-1e703c8ab2e8";

const rebuilt = await rebuildPrintMetaForChallan(pool, dcId);
const dcRes = await pool.query(
  "SELECT dc_number, created_at FROM delivery_challans WHERE id = $1::uuid",
  [dcId],
);
const dc = dcRes.rows[0]!;
const printMeta = rebuilt!.printMeta;
let consignor = partyFromTransferBlock(printMeta.from, resolveEdocEwayUserGstin("", cfg));
let consignee = partyFromTransferBlock(printMeta.to, consignor.gstin);
({ consignor, consignee } = alignSandboxEdocEwayParties(consignor, consignee, cfg));
const interstate = consignor.stateCode !== consignee.stateCode;
const nominal = nominalEwayTotals(60000, interstate);
const payload = buildEwayPayload({
  userGstin: resolveEdocEwayUserGstin(consignor.gstin, cfg),
  documentNumber: printMeta.transferNumber || dc.dc_number,
  documentDate: new Date(dc.created_at),
  documentType: "Delivery Challan",
  consignor,
  consignee,
  ...nominal,
  itemDescription: "Wrist watches",
  hsnSac: "9113",
  qty: 1,
  transportationDistanceKm: "250",
  vehicleNumber: "TN60AJ6268",
  transportationMode: "Road",
  subSupplyDescription: "Inter-HO repair dispatch",
});

console.log("userGstin", payload.userGstin);

const token = await getEdocAccessToken(cfg);
const url = `${cfg.ewayApiBase.replace(/\/+$/, "")}${cfg.ewayPath}`;
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `JWT ${token}` },
  body: JSON.stringify(payload),
});
const text = await res.text();
console.log("HTTP", res.status, "body length", text.length);
console.log("body:", text.slice(0, 2500));

const result = await tryGenerateEwayForChallanId(pool, dcId, {
  taxableAmountInr: 60000,
  vehicleNumber: "TN60AJ6268",
  transportationDistanceKm: "250",
  transportationMode: "Road",
  forceRegenerate: true,
});
console.log("hook result:", JSON.stringify(result, null, 2));

await pool.end();
