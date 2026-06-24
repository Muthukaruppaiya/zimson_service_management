import pg from "pg";
import { initEdocSettings, getResolvedEdocConfig, saveEdocSettings } from "../server/edocSettingsStore.js";
import { getEdocAccessToken, clearEdocTokenCache } from "../server/mastersIndiaEdoc/auth.js";
import { SANDBOX_EDOC_TEST_GSTIN } from "../server/mastersIndiaEdoc/config.js";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5433/zimson_service_management",
});

await initEdocSettings(pool);

async function testGenerate(label: string, base: string, userGstin: string, docNo: string) {
  clearEdocTokenCache();
  const cfg = getResolvedEdocConfig()!;
  const testCfg = { ...cfg, apiBase: base, ewayApiBase: base, tokenUrl: `${base}/api/v1/token-auth/` };
  const token = await getEdocAccessToken(testCfg);
  const payload = {
    user_gstin: userGstin,
    data_source: "erp",
    transaction_details: { supply_type: "B2B", charge_type: "N", igst_on_intra: "N", ecommerce_gstin: "" },
    document_details: { document_type: "INV", document_number: docNo, document_date: "23/06/2026" },
    seller_details: {
      gstin: userGstin,
      legal_name: userGstin === SANDBOX_EDOC_TEST_GSTIN ? "MastersIndia UP" : "Zimson Watch Care",
      trade_name: "Zimson",
      address1: userGstin === SANDBOX_EDOC_TEST_GSTIN ? "45" : "Chennai Address",
      address2: "",
      location: userGstin === SANDBOX_EDOC_TEST_GSTIN ? "Noida" : "Chennai",
      pincode: userGstin === SANDBOX_EDOC_TEST_GSTIN ? 201301 : 600017,
      state_code: userGstin.startsWith("33") ? "33" : "09",
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
        cgst_amount: 7.63,
        sgst_amount: 7.62,
        igst_amount: 0,
        total_item_value: 100,
      },
    ],
    value_details: {
      total_assessable_value: 84.75,
      total_cgst_value: 7.63,
      total_sgst_value: 7.62,
      total_igst_value: 0,
      total_invoice_value: 100,
      total_cess_value: 0,
      total_discount: 0,
      round_off_amount: 0,
    },
  };
  const res = await fetch(`${base}/api/v1/einvoice/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `JWT ${token}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log(`\n=== ${label} doc=${docNo} gstin=${userGstin} ===`);
  console.log("HTTP", res.status, text.slice(0, 900));
}

const ts = Date.now().toString().slice(-6);
await testGenerate("SANDBOX 09", "https://sandb-api.mastersindia.co", SANDBOX_EDOC_TEST_GSTIN, `TST09${ts}`);
await testGenerate("PROD 33", "https://router.mastersindia.co", "33AAACZ0566D1ZN", `TST33${ts}`);
await testGenerate("PROD 09", "https://router.mastersindia.co", SANDBOX_EDOC_TEST_GSTIN, `TSTP09${ts}`);

// restore sandbox in DB (prod test script may have changed it)
await saveEdocSettings(
  {
    apiBase: "https://sandb-api.mastersindia.co",
    ewayApiBase: "https://sandb-api.mastersindia.co",
    tokenUrl: "https://sandb-api.mastersindia.co/api/v1/token-auth/",
  },
  "restore-sandbox",
);

await pool.end();
