import { initEdocSettings, getResolvedEdocConfig } from "../server/edocSettingsStore.js";
import { getEdocAccessToken } from "../server/mastersIndiaEdoc/auth.js";
import { SANDBOX_EDOC_TEST_GSTIN } from "../server/mastersIndiaEdoc/config.js";

import pg from "pg";
const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});
await initEdocSettings(pool);
const cfg = getResolvedEdocConfig()!;
const token = await getEdocAccessToken(cfg);
const base = cfg.apiBase.replace(/\/+$/, "");
const docNo = `CHN0226-27005`;

const minimal = {
  user_gstin: SANDBOX_EDOC_TEST_GSTIN,
  data_source: "erp",
  transaction_details: { supply_type: "B2B", charge_type: "N", igst_on_intra: "N" },
  document_details: { document_type: "INV", document_number: docNo, document_date: "23/06/2026" },
  seller_details: {
    gstin: SANDBOX_EDOC_TEST_GSTIN,
    legal_name: "MastersIndia UP",
    trade_name: "Test",
    address1: "45",
    address2: "",
    location: "Noida",
    pincode: 201301,
    state_code: "09",
    phone_number: "9876543231",
    email: "test@test.com",
  },
  buyer_details: {
    gstin: "33AACCA4475G1ZW",
    legal_name: "ABT Business",
    trade_name: "ABT",
    address1: "Addr",
    address2: "",
    location: "Chennai",
    pincode: 600017,
    state_code: "33",
    place_of_supply: "33",
    phone_number: "",
    email: "",
  },
  item_list: [
    {
      item_serial_number: "1",
      product_description: "Service",
      is_service: "Y",
      hsn_code: "9987",
      quantity: 1,
      free_quantity: 0,
      unit: "NOS",
      unit_price: 100,
      total_amount: 100,
      discount: 0,
      assessable_value: 84.75,
      gst_rate: 18,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 15.25,
      total_item_value: 100,
    },
  ],
  value_details: {
    total_assessable_value: 84.75,
    total_cgst_value: 0,
    total_sgst_value: 0,
    total_igst_value: 15.25,
    total_invoice_value: 100,
    total_cess_value: 0,
    total_discount: 0,
    round_off_amount: 0,
  },
};

const res = await fetch(`${base}${cfg.einvoicePath}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `JWT ${token}` },
  body: JSON.stringify(minimal),
});
console.log("doc", docNo, "HTTP", res.status, (await res.text()).slice(0, 600));
await pool.end();
