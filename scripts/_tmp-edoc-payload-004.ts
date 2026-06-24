import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { getEdocAccessToken } from "../server/mastersIndiaEdoc/auth.js";
import { buildEinvoicePayload } from "../server/mastersIndiaEdoc/buildPayload.js";
import { alignSandboxEdocSellerParty, resolveEdocSellerGstin } from "../server/mastersIndiaEdoc/config.js";
import { formatDocumentDate } from "../server/mastersIndiaEdoc/gstState.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});
await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;

const bill = await pool.query(
  `SELECT qb.*, array_agg(json_build_object('description',qbl.description,'amount_inr',qbl.amount_inr::text)) as lines
   FROM quick_bills qb
   LEFT JOIN quick_bill_lines qbl ON qbl.quick_bill_id = qb.id
   WHERE qb.bill_number = 'QB26CHN02004'
   GROUP BY qb.id`,
);
console.log("bill:", bill.rows[0]);

const ok = await pool.query(`SELECT * FROM quick_bills WHERE bill_number = 'QB26CHN02001'`);
console.log("001 created:", ok.rows[0]?.created_at, "inv:", ok.rows[0]?.invoice_number);

const token = await getEdocAccessToken(cfg);
const sellerGstin = resolveEdocSellerGstin("33AAACZ0566D1ZN", "33AAACZ0566D1ZN", cfg);
const seller = alignSandboxEdocSellerParty(
  {
    gstin: sellerGstin,
    legalName: "Zimson Watch Care",
    address1: "Chennai",
    location: "Chennai",
    pincode: 600017,
    stateCode: "33",
  },
  cfg,
);
const payload = buildEinvoicePayload({
  userGstin: seller.gstin,
  documentNumber: "CHN0226-27005",
  documentDate: new Date(bill.rows[0]?.created_at ?? Date.now()),
  seller,
  buyer: {
    gstin: String(bill.rows[0]?.gst),
    legalName: String(bill.rows[0]?.company ?? "Buyer"),
    address1: "Addr",
    location: "Chennai",
    pincode: 600017,
    stateCode: "33",
  },
  lines: [{ slNo: 1, description: "Service", hsnSac: "9987", qty: 1, unitPrice: 4237.29, taxable: 4237.29, cgst: 381.36, sgst: 381.35, igst: 0, total: 5000, gstRatePercent: 18, isService: true }],
  totals: { taxable: 4237.29, cgst: 381.36, sgst: 381.35, igst: 0, total: 5000 },
  placeOfSupplyStateCode: "33",
});
console.log("\nPayload doc date:", (payload.document_details as {document_date:string}).document_date);
console.log("user_gstin:", payload.user_gstin);

const base = cfg.apiBase.replace(/\/+$/, "");
const res = await fetch(`${base}${cfg.einvoicePath}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `JWT ${token}` },
  body: JSON.stringify(payload),
});
console.log("\nHTTP", res.status, (await res.text()).slice(0, 800));

await pool.end();
