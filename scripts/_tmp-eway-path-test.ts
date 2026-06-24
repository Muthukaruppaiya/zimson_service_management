import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { getEdocAccessToken } from "../server/mastersIndiaEdoc/auth.js";
import { rebuildPrintMetaForChallan } from "../server/transferDocMeta.js";
import { buildEwayPayload, partyFromTransferBlock, nominalEwayTotals } from "../server/mastersIndiaEdoc/buildPayload.js";
import { alignSandboxEdocEwayParties, resolveEdocEwayUserGstin } from "../server/mastersIndiaEdoc/config.js";

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

let consignor = partyFromTransferBlock(rebuilt!.printMeta.from, resolveEdocEwayUserGstin("", cfg));
let consignee = partyFromTransferBlock(rebuilt!.printMeta.to, consignor.gstin);
({ consignor, consignee } = alignSandboxEdocEwayParties(consignor, consignee, cfg));
const nominal = nominalEwayTotals(60000, false);
const payload = buildEwayPayload({
  userGstin: resolveEdocEwayUserGstin(consignor.gstin, cfg),
  documentNumber: rebuilt!.printMeta.transferNumber || dc.dc_number,
  documentDate: new Date(dc.created_at),
  documentType: "Tax Invoice",
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

const token = await getEdocAccessToken(cfg);
const base = cfg.ewayApiBase.replace(/\/+$/, "");
console.log("DB ewayPath:", cfg.ewayPath);
console.log("Payload userGstin:", payload.userGstin);
console.log("Payload consignor:", payload.gstin_of_consignor, payload.pincode_of_consignor);
console.log("Payload consignee:", payload.gstin_of_consignee, payload.pincode_of_consignee);

for (const path of ["/api/v1/ewayBillsGenerate/", "/api/v1/ewayBillGenerate/"]) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `JWT ${token}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log("\nPATH", path);
  console.log("HTTP", res.status, text.slice(0, 300));
}

await pool.end();
