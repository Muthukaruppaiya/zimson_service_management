import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { rebuildPrintMetaForChallan } from "../server/transferDocMeta.js";
import { buildEwayPayload, partyFromTransferBlock, nominalEwayTotals } from "../server/mastersIndiaEdoc/buildPayload.js";
import { getEdocAccessToken } from "../server/mastersIndiaEdoc/auth.js";

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

// Use real region GSTINs — no sandbox 09 override
const consignor = partyFromTransferBlock(printMeta.from, cfg.ewayUserGstin ?? "");
const consignee = partyFromTransferBlock(printMeta.to, consignor.gstin);
const interstate = consignor.stateCode !== consignee.stateCode;
const userGstin = cfg.ewayUserGstin || consignor.gstin;

const payload = buildEwayPayload({
  userGstin,
  documentNumber: printMeta.transferNumber || dc.dc_number,
  documentDate: new Date(dc.created_at),
  documentType: "Delivery Challan",
  consignor,
  consignee,
  ...nominalEwayTotals(60000, interstate),
  itemDescription: "Wrist watches",
  hsnSac: "9113",
  qty: 1,
  transportationDistanceKm: "250",
  vehicleNumber: "TN60AJ6268",
  transportationMode: "Road",
  subSupplyDescription: "Inter-HO repair dispatch",
});

console.log("userGstin", payload.userGstin);
console.log("consignor", payload.gstin_of_consignor, payload.pincode_of_consignor, payload.state_of_consignor);
console.log("consignee", payload.gstin_of_consignee, payload.pincode_of_consignee, payload.state_of_supply);

const token = await getEdocAccessToken(cfg);
const url = `${cfg.ewayApiBase.replace(/\/+$/, "")}${cfg.ewayPath}`;
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `JWT ${token}` },
  body: JSON.stringify(payload),
});
console.log("HTTP", res.status, (await res.text()).slice(0, 500));

await pool.end();
