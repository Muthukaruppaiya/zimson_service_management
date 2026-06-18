import type { Pool } from "pg";
import { computeServiceBillGst } from "../../src/lib/serviceBillGst";
import {
  resolveCustomerSupplyStateCode,
  resolveSellerStateCode,
} from "../../src/lib/gstSupply";
import { customerPayableInr } from "../../src/lib/quickBillPayable";
import { billableLineAmount } from "../../src/lib/natureOfRepair";
import { isValidGstFormat } from "../../src/data/serviceSeed";
import { validateCustomerB2bGstin } from "../../src/lib/zimsonCompanyGst";
import type { TransferPrintMeta } from "../transferDocMeta";
import { transferPrintKindFromGstins } from "../transferDocMeta";
import {
  buildEinvoicePayload,
  buildEwayPayload,
  nominalEwayTotals,
  partyFromTransferBlock,
} from "./buildPayload";
import { generateEinvoice, generateEwayBill } from "./client";
import {
  getMastersIndiaEdocConfig,
  isValidGstin,
  resolveEdocEwayUserGstin,
  resolveEdocSellerGstin,
} from "./config";
import { defaultPincodeForState, gstinStateCode, parsePincode, stateNameFromCode } from "./gstState";
import { saveDeliveryChallanEdoc, saveQuickBillEdoc, saveSrfEdoc } from "./persist";
import type { EdocLine, EdocParty, EdocResult, EdocValueTotals } from "./types";

function skip(reason: string): EdocResult {
  return { ok: false, skipped: true, skipReason: reason };
}

async function loadTaxSettings(db: Pool) {
  const { rows } = await db.query<{
    gst_rate_percent: string;
    cgst_rate_percent: string;
    sgst_rate_percent: string;
    igst_rate_percent: string;
    default_sac_hsn: string;
    prices_tax_inclusive: boolean;
    invoice_store_gstin: string | null;
  }>(
    `SELECT gst_rate_percent::text, cgst_rate_percent::text, sgst_rate_percent::text,
            igst_rate_percent::text, default_sac_hsn, prices_tax_inclusive, invoice_store_gstin
     FROM service_tax_settings WHERE id = 1`,
  );
  return rows[0] ?? null;
}

function buildPartyFromBillFields(args: {
  gstin: string;
  legalName: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
}): EdocParty {
  const gstin = args.gstin.trim().toUpperCase();
  const stateCode = gstinStateCode(gstin);
  const addr = [args.address, args.city].filter(Boolean).join(", ") || "Billing address";
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    gstin,
    legalName: args.legalName.slice(0, 100) || "Customer",
    tradeName: args.legalName.slice(0, 100),
    address1: parts[0] ?? addr.slice(0, 90),
    address2: parts.slice(1).join(", ").slice(0, 90),
    location: args.city?.trim() || parts[parts.length - 1] || stateNameFromCode(stateCode),
    pincode: parsePincode(addr, defaultPincodeForState(stateCode)),
    stateCode,
    phone: args.phone ?? undefined,
    email: args.email ?? undefined,
  };
}

function totalsFromGstResult(
  gstResult: ReturnType<typeof computeServiceBillGst>,
  netPayable: number,
): EdocValueTotals {
  return {
    taxable: gstResult.grossTaxable,
    cgst: gstResult.cgst,
    sgst: gstResult.sgst,
    igst: gstResult.igst,
    total: netPayable,
    isInterstate: gstResult.isInterstate,
  };
}

function linesFromGstResult(
  gstResult: ReturnType<typeof computeServiceBillGst>,
  descriptions: string[],
): EdocLine[] {
  return gstResult.lines.map((ln, i) => {
    const tax = round2(ln.tax);
    const interstate = gstResult.isInterstate;
    return {
      slNo: i + 1,
      description: descriptions[i] ?? `Line ${i + 1}`,
      hsnSac: ln.hsnSac,
      qty: 1,
      unitPrice: ln.taxable,
      taxable: ln.taxable,
      cgst: interstate ? 0 : round2(tax / 2),
      sgst: interstate ? 0 : round2(tax - round2(tax / 2)),
      igst: interstate ? tax : 0,
      total: ln.taxable + ln.tax,
      gstRatePercent: ln.ratePercent,
    };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function tryGenerateEinvoiceForQuickBill(
  pool: Pool,
  billId: string,
): Promise<EdocResult> {
  const cfg = getMastersIndiaEdocConfig();
  if (!cfg?.enabled) return skip("E-doc not configured");

  const billRes = await pool.query<{
    customer_type: string;
    gst: string | null;
    company: string | null;
    customer_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    customer_billing_state: string | null;
    invoice_number: string | null;
    bill_number: string;
    created_at: Date;
    store_id: string | null;
    nature_of_repair: string | null;
    total_inr: string;
    edoc_irn: string | null;
  }>(
    `SELECT customer_type, gst, company, customer_name, phone, email, address, city,
            customer_billing_state, invoice_number, bill_number, created_at, store_id,
            nature_of_repair, total_inr::text, edoc_irn
     FROM quick_bills WHERE id = $1::uuid`,
    [billId],
  );
  const bill = billRes.rows[0];
  if (!bill) return skip("Quick bill not found");
  if (bill.edoc_irn) return { ok: true, irn: bill.edoc_irn, skipped: true, skipReason: "IRN already exists" };
  if (bill.customer_type !== "B2B") {
    const r = skip("E-invoice applies to B2B only");
    await saveQuickBillEdoc(pool, billId, r);
    return r;
  }

  const buyerGst = String(bill.gst ?? "").trim().toUpperCase();
  if (!isValidGstFormat(buyerGst) || validateCustomerB2bGstin(buyerGst)) {
    const r = skip("Valid buyer GSTIN required for e-invoice");
    await saveQuickBillEdoc(pool, billId, r);
    return r;
  }

  const { rows: lineRows } = await pool.query<{
    description: string;
    amount_inr: string;
    spare_id: string | null;
  }>(
    `SELECT description, amount_inr::text, spare_id FROM quick_bill_lines WHERE quick_bill_id = $1::uuid ORDER BY line_no`,
    [billId],
  );

  const taxRow = await loadTaxSettings(pool);
  let storeGstin = "";
  if (bill.store_id) {
    const st = await pool.query<{ invoice_gstin: string | null }>(
      `SELECT invoice_gstin FROM stores WHERE id = $1::text`,
      [bill.store_id],
    );
    storeGstin = String(st.rows[0]?.invoice_gstin ?? "").trim();
  }
  if (!storeGstin) storeGstin = String(taxRow?.invoice_store_gstin ?? "").trim();

  const sellerGstin = resolveEdocSellerGstin(storeGstin, taxRow?.invoice_store_gstin, cfg);
  const configuredGst = Number(taxRow?.gst_rate_percent ?? 18);
  const defaultSacHsn = String(taxRow?.default_sac_hsn ?? "9987").trim() || "9987";
  const pricesTaxInclusive = Boolean(taxRow?.prices_tax_inclusive);
  const natureOfRepair = bill.nature_of_repair ?? "";

  /** Tax split must match the GSTIN on the e-invoice payload (may differ from store display GSTIN in sandbox). */
  const sellerStateCode = resolveSellerStateCode(sellerGstin);
  const customerStateCode = resolveCustomerSupplyStateCode({
    customerType: "B2B",
    customerGstin: buyerGst,
    billingStateName: bill.customer_billing_state,
    addressText: bill.address,
    cityText: bill.city,
    sellerStateCode,
  });

  const subtotalInr = lineRows.reduce(
    (s, ln) => s + billableLineAmount(natureOfRepair, Number(ln.amount_inr), ln.spare_id),
    0,
  );

  const gstResult = computeServiceBillGst({
    lines: lineRows.map((ln) => ({
      amountInr: billableLineAmount(natureOfRepair, Number(ln.amount_inr), ln.spare_id),
      spareId: ln.spare_id,
      hsnSac: defaultSacHsn,
    })),
    defaultHsnSac: defaultSacHsn,
    configuredGstPercent: configuredGst,
    cgstRatePercent: Number(taxRow?.cgst_rate_percent ?? configuredGst / 2),
    sgstRatePercent: Number(taxRow?.sgst_rate_percent ?? configuredGst / 2),
    igstRatePercent: Number(taxRow?.igst_rate_percent ?? configuredGst),
    pricesTaxInclusive,
    natureOfRepair,
    sellerStateCode,
    customerStateCode,
    billTotalInr: subtotalInr,
  });

  const netPayable = customerPayableInr(subtotalInr, gstResult.totalTax, pricesTaxInclusive);
  const totals = totalsFromGstResult(gstResult, netPayable);
  const descriptions = lineRows.map((l) => l.description);

  const st = await pool.query<{
    invoice_legal_entity_name: string | null;
    invoice_display_name: string | null;
    invoice_address: string | null;
    invoice_phone: string | null;
    invoice_email: string | null;
    name: string;
  }>(
    `SELECT invoice_legal_entity_name, invoice_display_name, invoice_address, invoice_phone, invoice_email, name
     FROM stores WHERE id = $1::text`,
    [bill.store_id ?? ""],
  );
  const store = st.rows[0];
  const sellerName =
    String(store?.invoice_legal_entity_name ?? "").trim() ||
    String(store?.invoice_display_name ?? "").trim() ||
    store?.name ||
    "Zimson";

  const seller = buildPartyFromBillFields({
    gstin: sellerGstin,
    legalName: sellerName,
    address: store?.invoice_address,
    phone: store?.invoice_phone,
    email: store?.invoice_email,
  });

  const buyer = buildPartyFromBillFields({
    gstin: buyerGst,
    legalName: String(bill.company ?? bill.customer_name ?? "Buyer").trim(),
    address: bill.address,
    city: bill.city,
    phone: bill.phone,
    email: bill.email,
  });

  const payload = buildEinvoicePayload({
    userGstin: sellerGstin,
    documentNumber: bill.invoice_number ?? bill.bill_number,
    documentDate: new Date(bill.created_at),
    seller,
    buyer,
    lines: linesFromGstResult(gstResult, descriptions),
    totals,
    placeOfSupplyStateCode: customerStateCode,
  });

  const result = await generateEinvoice(cfg, payload);
  await saveQuickBillEdoc(pool, billId, result);
  return result;
}

export async function tryGenerateEinvoiceForSrfClose(
  pool: Pool,
  srfId: string,
): Promise<EdocResult> {
  const cfg = getMastersIndiaEdocConfig();
  if (!cfg?.enabled) return skip("E-doc not configured");

  const jobRes = await pool.query<{
    customer_kind: string;
    company: string | null;
    customer_name: string;
    phone: string;
    invoice_number: string | null;
    reference: string;
    closed_at: Date | null;
    store_id: string;
    destination_store_id: string | null;
    store_billing_snapshot: unknown;
    nature_of_repair: string | null;
    edoc_irn: string | null;
  }>(
    `SELECT customer_kind, company, customer_name, phone, invoice_number, reference, closed_at,
            store_id, destination_store_id, store_billing_snapshot, nature_of_repair, edoc_irn
     FROM srf_jobs WHERE id = $1::uuid`,
    [srfId],
  );
  const job = jobRes.rows[0];
  if (!job) return skip("SRF not found");
  if (job.edoc_irn) return { ok: true, irn: job.edoc_irn, skipped: true, skipReason: "IRN already exists" };
  if (job.customer_kind !== "B2B") {
    const r = skip("E-invoice applies to B2B only");
    await saveSrfEdoc(pool, srfId, r);
    return r;
  }

  const phoneLast10 = job.phone.replace(/\D/g, "").slice(-10);
  const custRes = await pool.query<{
    gst: string | null;
    company: string | null;
    display_name: string;
    email: string;
    address: string | null;
    city: string | null;
    billing_address: unknown;
  }>(
    `SELECT gst, company, display_name, email, address, city, billing_address
     FROM customers WHERE phone_last10 = $1 LIMIT 1`,
    [phoneLast10],
  );
  const customer = custRes.rows[0];
  const buyerGst = String(customer?.gst ?? "").trim().toUpperCase();
  if (!isValidGstFormat(buyerGst) || validateCustomerB2bGstin(buyerGst)) {
    const r = skip("Valid buyer GSTIN required for e-invoice");
    await saveSrfEdoc(pool, srfId, r);
    return r;
  }

  const snapshot = job.store_billing_snapshot as { billLines?: { description: string; amountInr: number; hsnSac?: string }[] } | null;
  const billLines = Array.isArray(snapshot?.billLines) ? snapshot!.billLines! : [];
  if (billLines.length === 0) {
    const r = skip("No billing lines on SRF for e-invoice");
    await saveSrfEdoc(pool, srfId, r);
    return r;
  }

  const billingStoreId = String(job.destination_store_id ?? job.store_id ?? "").trim();
  const taxRow = await loadTaxSettings(pool);
  const st = await pool.query<{ invoice_gstin: string | null; invoice_legal_entity_name: string | null; invoice_display_name: string | null; invoice_address: string | null; invoice_phone: string | null; invoice_email: string | null; name: string }>(
    `SELECT invoice_gstin, invoice_legal_entity_name, invoice_display_name, invoice_address, invoice_phone, invoice_email, name
     FROM stores WHERE id = $1::text`,
    [billingStoreId],
  );
  const store = st.rows[0];
  const storeGstin = String(store?.invoice_gstin ?? "").trim();
  const sellerGstin = resolveEdocSellerGstin(storeGstin, taxRow?.invoice_store_gstin, cfg);
  const defaultSacHsn = String(taxRow?.default_sac_hsn ?? "9987").trim() || "9987";
  const configuredGst = Number(taxRow?.gst_rate_percent ?? 18);
  const pricesTaxInclusive = Boolean(taxRow?.prices_tax_inclusive);
  const natureOfRepair = job.nature_of_repair ?? "";

  const sellerStateCode = resolveSellerStateCode(sellerGstin);
  const billingState =
    customer?.billing_address && typeof customer.billing_address === "object"
      ? String((customer.billing_address as { state?: string }).state ?? "")
      : customer?.city ?? "";
  const customerStateCode = resolveCustomerSupplyStateCode({
    customerType: "B2B",
    customerGstin: buyerGst,
    billingStateName: billingState,
    addressText: customer?.address,
    cityText: customer?.city,
    sellerStateCode,
  });

  const subtotalInr = billLines.reduce((s, l) => s + Number(l.amountInr || 0), 0);
  const gstResult = computeServiceBillGst({
    lines: billLines.map((l) => ({
      amountInr: Number(l.amountInr),
      hsnSac: l.hsnSac ?? defaultSacHsn,
    })),
    defaultHsnSac: defaultSacHsn,
    configuredGstPercent: configuredGst,
    cgstRatePercent: Number(taxRow?.cgst_rate_percent ?? configuredGst / 2),
    sgstRatePercent: Number(taxRow?.sgst_rate_percent ?? configuredGst / 2),
    igstRatePercent: Number(taxRow?.igst_rate_percent ?? configuredGst),
    pricesTaxInclusive,
    natureOfRepair,
    sellerStateCode,
    customerStateCode,
    billTotalInr: subtotalInr,
  });
  const netPayable = customerPayableInr(subtotalInr, gstResult.totalTax, pricesTaxInclusive);
  const totals = totalsFromGstResult(gstResult, netPayable);

  const seller = buildPartyFromBillFields({
    gstin: sellerGstin,
    legalName:
      String(store?.invoice_legal_entity_name ?? "").trim() ||
      String(store?.invoice_display_name ?? "").trim() ||
      store?.name ||
      "Zimson",
    address: store?.invoice_address,
    phone: store?.invoice_phone,
    email: store?.invoice_email,
  });

  const buyer = buildPartyFromBillFields({
    gstin: buyerGst,
    legalName: String(customer?.company ?? job.company ?? customer?.display_name ?? job.customer_name).trim(),
    address: customer?.address,
    city: customer?.city,
    phone: job.phone,
    email: customer?.email,
  });

  const payload = buildEinvoicePayload({
    userGstin: sellerGstin,
    documentNumber: job.invoice_number ?? job.reference,
    documentDate: job.closed_at ? new Date(job.closed_at) : new Date(),
    seller,
    buyer,
    lines: linesFromGstResult(
      gstResult,
      billLines.map((l) => l.description),
    ),
    totals,
    placeOfSupplyStateCode: customerStateCode,
  });

  const result = await generateEinvoice(cfg, payload);
  await saveSrfEdoc(pool, srfId, result);
  return result;
}

export async function tryGenerateEwayForChallan(
  pool: Pool,
  dcId: string,
  printMeta: TransferPrintMeta,
  lineCount: number,
): Promise<EdocResult> {
  const cfg = getMastersIndiaEdocConfig();
  if (!cfg?.enabled) return skip("E-doc not configured");

  const dcRes = await pool.query<{ dc_number: string; created_at: Date; edoc_eway_bill_no: string | null }>(
    `SELECT dc_number, created_at, edoc_eway_bill_no FROM delivery_challans WHERE id = $1::uuid`,
    [dcId],
  );
  const dc = dcRes.rows[0];
  if (!dc) return skip("Challan not found");
  if (dc.edoc_eway_bill_no) {
    return { ok: true, ewayBillNo: dc.edoc_eway_bill_no, skipped: true, skipReason: "E-way already exists" };
  }

  const printKind = transferPrintKindFromGstins(printMeta.from.gstin, printMeta.to.gstin);
  if (printKind !== "dc") {
    const r = skip("Same GSTIN — delivery challan only (no e-way)");
    await saveDeliveryChallanEdoc(pool, dcId, r);
    return r;
  }

  const consignor = partyFromTransferBlock(printMeta.from, resolveEdocEwayUserGstin("", cfg));
  const consignee = partyFromTransferBlock(printMeta.to, consignor.gstin);
  if (!isValidGstin(consignor.gstin) || !isValidGstin(consignee.gstin)) {
    const r = skip("Consignor and consignee GSTIN required for e-way");
    await saveDeliveryChallanEdoc(pool, dcId, r);
    return r;
  }

  const userGstin = resolveEdocEwayUserGstin(consignor.gstin, cfg);
  const interstate = consignor.stateCode !== consignee.stateCode;
  const nominal = nominalEwayTotals(cfg.ewayNominalValueInr, interstate);

  const payload = buildEwayPayload({
    userGstin,
    documentNumber: printMeta.transferNumber || dc.dc_number,
    documentDate: new Date(dc.created_at),
    consignor,
    consignee,
    ...nominal,
    itemDescription: `Watches / goods — ${lineCount} item(s) — ${printMeta.flow}`,
    hsnSac: "9113",
    qty: Math.max(1, lineCount),
    transportationDistanceKm: "100",
  });

  const result = await generateEwayBill(cfg, payload);
  await saveDeliveryChallanEdoc(pool, dcId, result);
  return result;
}

export function edocEnabled(): boolean {
  const cfg = getMastersIndiaEdocConfig();
  return Boolean(cfg?.enabled);
}

export function edocEwayAutoEnabled(): boolean {
  const cfg = getMastersIndiaEdocConfig();
  return Boolean(cfg?.enabled && cfg.ewayAutoEnabled);
}

export function edocFailOpen(): boolean {
  const cfg = getMastersIndiaEdocConfig();
  return cfg?.failOpen !== false;
}
