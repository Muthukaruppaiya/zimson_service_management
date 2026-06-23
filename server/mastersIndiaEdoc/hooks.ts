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
import { transferPrintKindFromGstins, rebuildPrintMetaForChallan } from "../transferDocMeta";
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
import { loadSpareGstById } from "../hsnGstRates";
import {
  isServiceSacCode,
  resolveEdocHsnSac,
  defaultUqcForEdocLine,
} from "./hsnSac";
import { saveDeliveryChallanEdoc, saveInterHoSpareOrderEwayEdoc, saveQuickBillEdoc, saveServiceInvoiceEdoc, saveSrfEdoc, saveSrfEwayEdoc } from "./persist";
import type { EdocLine, EdocParty, EdocResult, EdocValueTotals, EwayGenerateInput, EwayPrefill } from "./types";

function skip(reason: string): EdocResult {
  return { ok: false, skipped: true, skipReason: reason };
}

export function parseEwayGenerateInput(body: unknown): EwayGenerateInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const num = (key: string) => {
    const n = Number(b[key]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const str = (key: string) => {
    const s = String(b[key] ?? "").trim();
    return s || undefined;
  };
  return {
    taxableAmountInr: num("taxableAmountInr"),
    totalInvoiceValueInr: num("totalInvoiceValueInr"),
    vehicleNumber: str("vehicleNumber"),
    transportationDistanceKm: str("transportationDistanceKm"),
    transportationMode: str("transportationMode"),
    transporterName: str("transporterName"),
    forceRegenerate: b.forceRegenerate === true,
    consigneeGstin: str("consigneeGstin"),
    consigneeLegalName: str("consigneeLegalName"),
    consigneeAddress: str("consigneeAddress"),
    consigneePlace: str("consigneePlace"),
    consigneePincode: str("consigneePincode"),
  };
}

function resolveEwayTotals(
  nominalInr: number,
  interstate: boolean,
  input?: EwayGenerateInput,
): Pick<EwayBuildInput, "taxableAmount" | "totalInvoiceValue" | "cgst" | "sgst" | "igst"> {
  if (input?.taxableAmountInr && input.taxableAmountInr > 0) {
    return nominalEwayTotals(input.taxableAmountInr, interstate);
  }
  if (input?.totalInvoiceValueInr && input.totalInvoiceValueInr > 0) {
    const taxableBack = Math.round((input.totalInvoiceValueInr / 1.18) * 100) / 100;
    return nominalEwayTotals(taxableBack, interstate);
  }
  return nominalEwayTotals(nominalInr, interstate);
}

function flowLabelFromMeta(printMeta: TransferPrintMeta): string {
  if (printMeta.flow === "ho_to_ho_return") return "HO return after repair";
  if (printMeta.flow === "ho_to_ho_dispatch") return "Inter-HO repair dispatch";
  return printMeta.flow.replace(/_/g, " ");
}

export function transferFlowNeedsEway(flow: TransferPrintMeta["flow"]): boolean {
  return flow === "ho_to_ho_dispatch" || flow === "ho_to_ho_return";
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
  lineFlags?: { isService?: boolean }[],
): EdocLine[] {
  return gstResult.lines.map((ln, i) => {
    const tax = round2(ln.tax);
    const interstate = gstResult.isInterstate;
    const isService = lineFlags?.[i]?.isService ?? isServiceSacCode(ln.hsnSac);
    return {
      slNo: i + 1,
      description: descriptions[i] ?? `Line ${i + 1}`,
      hsnSac: ln.hsnSac,
      isService,
      uqc: defaultUqcForEdocLine(isService),
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

type SnapshotBillLine = {
  description: string;
  amountInr: number;
  hsnSac?: string | null;
  spareId?: string | null;
};

function isLabourSnapshotLine(line: SnapshotBillLine): boolean {
  if (String(line.spareId ?? "").trim()) return false;
  return /labour|service\s*\/\s*repair|service charge/i.test(line.description);
}

async function resolveStoreBillingEdocLines(
  pool: Pool,
  billLines: SnapshotBillLine[],
  defaultSacHsn: string,
): Promise<Array<SnapshotBillLine & { hsnSac: string; isService: boolean }>> {
  const spareIds = [
    ...new Set(billLines.map((l) => String(l.spareId ?? "").trim()).filter(Boolean)),
  ];
  const hsnBySpareId = new Map<string, string>();
  if (spareIds.length > 0) {
    const spareMeta = await pool.query<{ id: string; hsn: string | null }>(
      `SELECT id::text, hsn FROM spares WHERE id = ANY($1::uuid[])`,
      [spareIds],
    );
    for (const row of spareMeta.rows) {
      if (row.hsn?.trim()) hsnBySpareId.set(row.id, row.hsn.trim());
    }
  }

  return billLines.map((line) => {
    const spareId = String(line.spareId ?? "").trim() || null;
    const labour = isLabourSnapshotLine(line);
    const catalogueHsn = spareId ? hsnBySpareId.get(spareId) : undefined;
    const snapshotHsn = String(line.hsnSac ?? "").trim();
    const rawHsn = labour ? defaultSacHsn : (catalogueHsn || snapshotHsn || "").trim();
    const resolved = resolveEdocHsnSac(rawHsn || null, {
      labourLine: labour,
      defaultSacHsn,
      preferGoods: !labour,
    });
    return {
      ...line,
      spareId,
      hsnSac: resolved.code,
      isService: resolved.isService,
    };
  });
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
  const pricesTaxInclusive = true;
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

  const spareGstMap = await loadSpareGstById(pool);

  const resolvedQbLines = await resolveStoreBillingEdocLines(
    pool,
    lineRows.map((ln) => ({
      description: ln.description,
      amountInr: billableLineAmount(natureOfRepair, Number(ln.amount_inr), ln.spare_id),
      spareId: String(ln.spare_id ?? "").trim() || null,
      hsnSac: null,
    })),
    defaultSacHsn,
  );

  const gstResult = computeServiceBillGst({
    lines: resolvedQbLines.map((l) => ({
      amountInr: l.amountInr,
      spareId: l.spareId,
      hsnSac: l.hsnSac,
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
    spareGstLookup: (spareId) => (spareId ? spareGstMap.get(spareId) ?? null : null),
  });

  const netPayable = customerPayableInr(subtotalInr, gstResult.totalTax, pricesTaxInclusive);
  const totals = totalsFromGstResult(gstResult, netPayable);
  const flagsByHsn = new Map(resolvedQbLines.map((r) => [r.hsnSac, r.isService]));
  const descriptions = gstResult.lines.map((ln, i) => {
    const parts = resolvedQbLines.filter((r) => r.hsnSac === ln.hsnSac).map((r) => r.description);
    return parts.length ? parts.join("; ").slice(0, 300) : `Line ${i + 1}`;
  });
  const lineFlags = gstResult.lines.map((ln) => ({
    isService: flagsByHsn.get(ln.hsnSac) ?? isServiceSacCode(ln.hsnSac),
  }));

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
    lines: linesFromGstResult(gstResult, descriptions, lineFlags),
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

  const snapshot = job.store_billing_snapshot as { billLines?: SnapshotBillLine[] } | null;
  const rawBillLines = Array.isArray(snapshot?.billLines) ? snapshot!.billLines! : [];
  if (rawBillLines.length === 0) {
    const r = skip("No billing lines on SRF for e-invoice");
    await saveSrfEdoc(pool, srfId, r);
    return r;
  }

  const billingStoreId = String(job.destination_store_id ?? job.store_id ?? "").trim();
  const taxRow = await loadTaxSettings(pool);
  const defaultSacHsn = String(taxRow?.default_sac_hsn ?? "9987").trim() || "9987";
  const billLines = await resolveStoreBillingEdocLines(pool, rawBillLines, defaultSacHsn);
  const spareGstMap = await loadSpareGstById(pool);
  const st = await pool.query<{ invoice_gstin: string | null; invoice_legal_entity_name: string | null; invoice_display_name: string | null; invoice_address: string | null; invoice_phone: string | null; invoice_email: string | null; name: string }>(
    `SELECT invoice_gstin, invoice_legal_entity_name, invoice_display_name, invoice_address, invoice_phone, invoice_email, name
     FROM stores WHERE id = $1::text`,
    [billingStoreId],
  );
  const store = st.rows[0];
  const storeGstin = String(store?.invoice_gstin ?? "").trim();
  const sellerGstin = resolveEdocSellerGstin(storeGstin, taxRow?.invoice_store_gstin, cfg);
  const configuredGst = Number(taxRow?.gst_rate_percent ?? 18);
  const pricesTaxInclusive = true;
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
      spareId: l.spareId,
      hsnSac: l.hsnSac,
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
    spareGstLookup: (spareId) => (spareId ? spareGstMap.get(spareId) ?? null : null),
  });
  const netPayable = customerPayableInr(subtotalInr, gstResult.totalTax, pricesTaxInclusive);
  const totals = totalsFromGstResult(gstResult, netPayable);
  const flagsByHsn = new Map(billLines.map((r) => [r.hsnSac, r.isService]));
  const descriptions = gstResult.lines.map((ln, i) => {
    const parts = billLines.filter((r) => r.hsnSac === ln.hsnSac).map((r) => r.description);
    return parts.length ? parts.join("; ").slice(0, 300) : `Line ${i + 1}`;
  });
  const lineFlags = gstResult.lines.map((ln) => ({
    isService: flagsByHsn.get(ln.hsnSac) ?? isServiceSacCode(ln.hsnSac),
  }));

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
      descriptions,
      lineFlags,
    ),
    totals,
    placeOfSupplyStateCode: customerStateCode,
  });

  const result = await generateEinvoice(cfg, payload);
  await saveSrfEdoc(pool, srfId, result);
  return result;
}

type RegionEdocRow = {
  name: string;
  address: string | null;
  address_json: unknown;
  phone: string | null;
  email: string | null;
  gst: string | null;
};

function formatRegionAddress(row: RegionEdocRow): string {
  const fallback = String(row.address ?? "").trim();
  if (row.address_json && typeof row.address_json === "object") {
    const aj = row.address_json as Record<string, unknown>;
    const parts = [aj.line1, aj.line2, aj.city, aj.state, aj.pincode]
      .map((p) => String(p ?? "").trim())
      .filter(Boolean);
    if (parts.length > 0) return parts.join(", ");
  }
  return fallback || "Address";
}

async function loadRegionForEdoc(db: Pool, regionId: string): Promise<RegionEdocRow | null> {
  const { rows } = await db.query<RegionEdocRow>(
    `SELECT name, address, address_json, phone, email, gst FROM regions WHERE id = $1::text`,
    [regionId],
  );
  return rows[0] ?? null;
}

function parseUsedSparesForEdoc(usedSpares: unknown): Array<{
  name: string;
  qty: number;
  unitPriceInr: number;
  spareId: string | null;
  hsnSac: string;
}> {
  if (!Array.isArray(usedSpares)) return [];
  return usedSpares
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const l = raw as Record<string, unknown>;
      const name = String(l.name ?? "Spare").trim();
      const qty = Number(l.qty ?? 0);
      const unitPriceInr = Number(l.unitPriceInr ?? l.unit_price_inr ?? 0);
      if (!name || qty <= 0 || unitPriceInr <= 0) return null;
      const spareId =
        typeof l.spareId === "string"
          ? l.spareId
          : typeof l.spare_id === "string"
            ? l.spare_id
            : null;
      const hsnSac = typeof l.hsn === "string" ? l.hsn.trim() : "";
      return { name, qty, unitPriceInr, spareId, hsnSac };
    })
    .filter((l): l is NonNullable<typeof l> => l != null);
}

/** Mandatory GST e-invoice for repair HO → sender HO inter-HO repair invoices. */
export async function tryGenerateEinvoiceForInterHoInvoice(
  pool: Pool,
  invoiceId: string,
): Promise<EdocResult> {
  const cfg = getMastersIndiaEdocConfig();
  if (!cfg?.enabled) return skip("E-doc not configured");

  const invRes = await pool.query<{
    id: string;
    invoice_number: string;
    invoice_date: Date;
    source_type: string;
    source_id: string | null;
    region_id: string | null;
    total_inr: string;
    edoc_irn: string | null;
    snapshot_json: unknown;
    transfer_source_region_id: string | null;
    used_spares: unknown;
  }>(
    `SELECT si.id::text, si.invoice_number, si.invoice_date, si.source_type, si.source_id,
            si.region_id, si.total_inr::text, si.edoc_irn, si.snapshot_json,
            sj.transfer_source_region_id, sj.used_spares
     FROM service_invoices si
     LEFT JOIN srf_jobs sj ON sj.id::text = si.source_id
     WHERE si.id = $1::uuid`,
    [invoiceId],
  );
  const inv = invRes.rows[0];
  if (!inv) return skip("Invoice not found");
  if (inv.source_type !== "inter_ho_repair") {
    const r = skip("E-invoice applies to inter-HO repair invoices only");
    await saveServiceInvoiceEdoc(pool, invoiceId, r);
    return r;
  }
  if (inv.edoc_irn) {
    return { ok: true, irn: inv.edoc_irn, skipped: true, skipReason: "IRN already exists" };
  }

  const repairRegionId = String(inv.region_id ?? "").trim();
  const snap =
    inv.snapshot_json && typeof inv.snapshot_json === "object"
      ? (inv.snapshot_json as Record<string, unknown>)
      : {};
  const senderId =
    String(inv.transfer_source_region_id ?? "").trim() ||
    (typeof snap.transferSourceRegionId === "string" ? snap.transferSourceRegionId.trim() : "");

  if (!repairRegionId || !senderId) {
    const r = skip("Repair HO and sender HO regions required for inter-HO e-invoice");
    await saveServiceInvoiceEdoc(pool, invoiceId, r);
    return r;
  }

  const repairRegion = await loadRegionForEdoc(pool, repairRegionId);
  const senderRegion = await loadRegionForEdoc(pool, senderId);
  if (!repairRegion || !senderRegion) {
    const r = skip("Could not load HO region details for e-invoice");
    await saveServiceInvoiceEdoc(pool, invoiceId, r);
    return r;
  }

  const sellerGst = String(repairRegion.gst ?? "").trim().toUpperCase();
  const buyerGst = String(senderRegion.gst ?? "").trim().toUpperCase();
  if (!isValidGstin(sellerGst) || !isValidGstin(buyerGst)) {
    const r = skip("Valid repair-HO and sender-HO GSTIN required for inter-HO e-invoice");
    await saveServiceInvoiceEdoc(pool, invoiceId, r);
    return r;
  }

  const usedSpares = parseUsedSparesForEdoc(snap.usedSpares ?? inv.used_spares);
  if (usedSpares.length === 0) {
    const r = skip("No billable spare lines for inter-HO e-invoice");
    await saveServiceInvoiceEdoc(pool, invoiceId, r);
    return r;
  }

  const spareGstMap = await loadSpareGstById(pool);
  const spareIds = [...new Set(usedSpares.map((l) => l.spareId).filter((id): id is string => !!id))];
  const hsnBySpareId = new Map<string, string>();
  if (spareIds.length > 0) {
    const spareMeta = await pool.query<{ id: string; hsn: string | null }>(
      `SELECT id::text, hsn FROM spares WHERE id = ANY($1::uuid[])`,
      [spareIds],
    );
    for (const row of spareMeta.rows) {
      if (row.hsn?.trim()) hsnBySpareId.set(row.id, row.hsn.trim());
    }
  }

  const taxRow = await loadTaxSettings(pool);
  const defaultSacHsn = String(taxRow?.default_sac_hsn ?? "9987").trim() || "9987";
  const configuredGst = Number(taxRow?.gst_rate_percent ?? 18);
  const sellerGstin = resolveEdocSellerGstin(sellerGst, taxRow?.invoice_store_gstin, cfg);
  const sellerStateCode = resolveSellerStateCode(sellerGstin);
  const buyerStateCode = gstinStateCode(buyerGst);

  const billLines = usedSpares.map((l) => {
    const catalogueHsn = l.spareId ? hsnBySpareId.get(l.spareId) : undefined;
    const rawHsn = (catalogueHsn || String(l.hsnSac ?? "").trim() || "").trim();
    const resolved = resolveEdocHsnSac(rawHsn || null, {
      labourLine: false,
      defaultSacHsn,
      preferGoods: true,
    });
    return {
      amountInr: round2(l.qty * l.unitPriceInr),
      spareId: l.spareId,
      hsnSac: resolved.code,
      isService: resolved.isService,
      description: l.name,
    };
  });
  const subtotalInr = billLines.reduce((s, l) => s + l.amountInr, 0);

  const gstResult = computeServiceBillGst({
    lines: billLines.map((l) => ({
      amountInr: l.amountInr,
      spareId: l.spareId,
      hsnSac: l.hsnSac,
    })),
    defaultHsnSac: defaultSacHsn,
    configuredGstPercent: configuredGst,
    cgstRatePercent: Number(taxRow?.cgst_rate_percent ?? configuredGst / 2),
    sgstRatePercent: Number(taxRow?.sgst_rate_percent ?? configuredGst / 2),
    igstRatePercent: Number(taxRow?.igst_rate_percent ?? configuredGst),
    pricesTaxInclusive: false,
    natureOfRepair: "Inter-HO repair",
    sellerStateCode,
    customerStateCode: buyerStateCode,
    billTotalInr: subtotalInr,
    spareGstLookup: (spareId) => (spareId ? spareGstMap.get(spareId) ?? null : null),
  });

  const netPayable = gstResult.netPayable;
  const totals = totalsFromGstResult(gstResult, netPayable);
  const flagsByHsn = new Map(billLines.map((r) => [r.hsnSac, r.isService]));
  const descriptions = gstResult.lines.map((ln, i) => {
    const parts = billLines.filter((r) => r.hsnSac === ln.hsnSac).map((r) => r.description);
    return parts.length ? parts.join("; ").slice(0, 300) : `Line ${i + 1}`;
  });
  const lineFlags = gstResult.lines.map((ln) => ({
    isService: flagsByHsn.get(ln.hsnSac) ?? false,
  }));

  const seller = buildPartyFromBillFields({
    gstin: sellerGstin,
    legalName: repairRegion.name,
    address: formatRegionAddress(repairRegion),
    phone: repairRegion.phone,
    email: repairRegion.email,
  });

  const buyer = buildPartyFromBillFields({
    gstin: buyerGst,
    legalName: senderRegion.name,
    address: formatRegionAddress(senderRegion),
    phone: senderRegion.phone,
    email: senderRegion.email,
  });

  const payload = buildEinvoicePayload({
    userGstin: sellerGstin,
    documentNumber: inv.invoice_number,
    documentDate: new Date(inv.invoice_date),
    seller,
    buyer,
    lines: linesFromGstResult(gstResult, descriptions, lineFlags),
    totals,
    placeOfSupplyStateCode: buyerStateCode,
  });

  const result = await generateEinvoice(cfg, payload);
  await saveServiceInvoiceEdoc(pool, invoiceId, result);
  if (inv.source_id) {
    await saveSrfEdoc(pool, inv.source_id, result);
  }
  return result;
}

export async function getEwayPrefillForChallan(pool: Pool, dcId: string): Promise<EwayPrefill | null> {
  const rebuilt = await rebuildPrintMetaForChallan(pool, dcId);
  if (!rebuilt) return null;
  const { printMeta } = rebuilt;
  if (!transferFlowNeedsEway(printMeta.flow)) return null;

  const cfg = getMastersIndiaEdocConfig();
  const dcRes = await pool.query<{ dc_number: string; edoc_eway_bill_no: string | null }>(
    `SELECT dc_number, edoc_eway_bill_no FROM delivery_challans WHERE id = $1::uuid`,
    [dcId],
  );
  const dc = dcRes.rows[0];
  if (!dc) return null;

  const vehicleRes = await pool.query<{ brand_dispatch_ref: string | null }>(
    `SELECT j.brand_dispatch_ref
     FROM delivery_challan_lines l
     JOIN srf_jobs j ON j.id = l.srf_id
     WHERE l.dc_id = $1::uuid
     ORDER BY j.reference ASC
     LIMIT 1`,
    [dcId],
  );
  const vehicleNumber = String(vehicleRes.rows[0]?.brand_dispatch_ref ?? "").trim();
  const consignorGstin = normalizeTransferGstin(printMeta.from.gstin);
  const consigneeGstin = normalizeTransferGstin(printMeta.to.gstin);
  const interstate = gstinStateCode(consignorGstin) !== gstinStateCode(consigneeGstin);

  return {
    documentNumber: printMeta.transferNumber || dc.dc_number,
    flowLabel: flowLabelFromMeta(printMeta),
    fromLabel: printMeta.from.locationLabel,
    toLabel: printMeta.to.locationLabel,
    consignorGstin,
    consigneeGstin,
    vehicleNumber,
    defaultValueInr: cfg?.ewayNominalValueInr ?? 1000,
    interstate,
    existingEwayBillNo: dc.edoc_eway_bill_no,
  };
}

function normalizeTransferGstin(gstin: string): string {
  const g = String(gstin ?? "")
    .trim()
    .toUpperCase();
  return g === "—" ? "" : g;
}

export async function tryGenerateEwayForChallan(
  pool: Pool,
  dcId: string,
  printMeta: TransferPrintMeta,
  lineCount: number,
  input?: EwayGenerateInput,
): Promise<EdocResult> {
  const cfg = getMastersIndiaEdocConfig();
  if (!cfg?.enabled) return skip("E-doc not configured");

  const dcRes = await pool.query<{ dc_number: string; created_at: Date; edoc_eway_bill_no: string | null }>(
    `SELECT dc_number, created_at, edoc_eway_bill_no FROM delivery_challans WHERE id = $1::uuid`,
    [dcId],
  );
  const dc = dcRes.rows[0];
  if (!dc) return skip("Challan not found");
  if (dc.edoc_eway_bill_no && !input?.forceRegenerate) {
    return { ok: true, ewayBillNo: dc.edoc_eway_bill_no, skipped: true, skipReason: "E-way already exists" };
  }

  if (!transferFlowNeedsEway(printMeta.flow)) {
    const r = skip("E-way is required only for inter-HO transfer (not store dispatch).");
    await saveDeliveryChallanEdoc(pool, dcId, r);
    return r;
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
  const nominal = resolveEwayTotals(cfg.ewayNominalValueInr, interstate, input);
  const flowLabel = flowLabelFromMeta(printMeta);

  const payload = buildEwayPayload({
    userGstin,
    documentNumber: printMeta.transferNumber || dc.dc_number,
    documentDate: new Date(dc.created_at),
    consignor,
    consignee,
    ...nominal,
    itemDescription: `Wrist watches — ${lineCount} unit(s) — ${flowLabel}`,
    hsnSac: "9113",
    qty: Math.max(1, lineCount),
    transportationDistanceKm: input?.transportationDistanceKm ?? "0",
    subSupplyDescription: flowLabel,
    vehicleNumber: input?.vehicleNumber,
    transportationMode: input?.transportationMode,
    transporterName: input?.transporterName,
  });

  const result = await generateEwayBill(cfg, payload);
  await saveDeliveryChallanEdoc(pool, dcId, result);
  return result;
}

export async function tryGenerateEwayForChallanId(
  pool: Pool,
  dcId: string,
  input?: EwayGenerateInput,
): Promise<EdocResult> {
  const rebuilt = await rebuildPrintMetaForChallan(pool, dcId);
  if (!rebuilt) return skip("Challan not found or has no lines");
  return tryGenerateEwayForChallan(pool, dcId, rebuilt.printMeta, rebuilt.lineCount, input);
}

export async function getEwayPrefillForBrandSend(pool: Pool, srfId: string): Promise<EwayPrefill | null> {
  const cfg = getMastersIndiaEdocConfig();
  const { rows } = await pool.query<{
    brand_odc_number: string | null;
    brand_dispatch_ref: string | null;
    watch_brand: string;
    region_id: string;
    edoc_eway_bill_no: string | null;
  }>(
    `SELECT brand_odc_number, brand_dispatch_ref, watch_brand, region_id, edoc_eway_bill_no
     FROM srf_jobs WHERE id = $1::uuid`,
    [srfId],
  );
  const row = rows[0];
  if (!row?.brand_odc_number) return null;

  const { rows: regRows } = await pool.query<{ name: string; gst: string | null }>(
    `SELECT name, gst FROM regions WHERE id = $1::text`,
    [row.region_id],
  );
  const reg = regRows[0];
  const consignorGstin = String(reg?.gst ?? "").trim().toUpperCase();

  return {
    documentNumber: row.brand_odc_number,
    flowLabel: `Send to brand (${row.watch_brand})`,
    fromLabel: reg?.name ? `HO / Service Centre: ${reg.name}` : "Service centre HO",
    toLabel: `Brand service centre — ${row.watch_brand}`,
    consignorGstin,
    consigneeGstin: "",
    vehicleNumber: String(row.brand_dispatch_ref ?? "").trim(),
    defaultValueInr: cfg?.ewayNominalValueInr ?? 1000,
    interstate: true,
    existingEwayBillNo: row.edoc_eway_bill_no,
    requiresConsigneeInput: true,
  };
}

export async function tryGenerateEwayForBrandSend(
  pool: Pool,
  srfId: string,
  input?: EwayGenerateInput,
): Promise<EdocResult> {
  const cfg = getMastersIndiaEdocConfig();
  if (!cfg?.enabled) return skip("E-doc not configured");

  const { rows } = await pool.query<{
    brand_odc_number: string | null;
    brand_sent_at: Date | null;
    watch_brand: string;
    region_id: string;
    edoc_eway_bill_no: string | null;
  }>(
    `SELECT brand_odc_number, brand_sent_at, watch_brand, region_id, edoc_eway_bill_no
     FROM srf_jobs WHERE id = $1::uuid`,
    [srfId],
  );
  const row = rows[0];
  if (!row?.brand_odc_number) return skip("Brand ODC not found — send to brand first.");
  if (row.edoc_eway_bill_no && !input?.forceRegenerate) {
    return { ok: true, ewayBillNo: row.edoc_eway_bill_no, skipped: true, skipReason: "E-way already exists" };
  }

  const client = await pool.connect();
  try {
    const from = await loadRegionHoPartyForEway(client, row.region_id);
    const consignor = partyFromTransferBlock(from, resolveEdocEwayUserGstin("", cfg));
    if (!isValidGstin(consignor.gstin)) {
      const r = skip("Consignor HO GSTIN required for e-way");
      await saveSrfEwayEdoc(pool, srfId, r);
      return r;
    }

    const consigneeGstin = String(input?.consigneeGstin ?? "").trim().toUpperCase();
    if (!isValidGstin(consigneeGstin)) {
      const r = skip("Brand consignee GSTIN is required for e-way");
      await saveSrfEwayEdoc(pool, srfId, r);
      return r;
    }
    const consignee = buildPartyFromBillFields({
      gstin: consigneeGstin,
      legalName: input?.consigneeLegalName?.trim() || `Brand — ${row.watch_brand}`,
      address: input?.consigneeAddress,
      city: input?.consigneePlace,
    });
    if (input?.consigneePincode) {
      const pin = parseInt(String(input.consigneePincode).replace(/\D/g, ""), 10);
      if (Number.isFinite(pin) && pin > 0) consignee.pincode = pin;
    }

    const userGstin = resolveEdocEwayUserGstin(consignor.gstin, cfg);
    const interstate = consignor.stateCode !== consignee.stateCode;
    const nominal = resolveEwayTotals(cfg.ewayNominalValueInr, interstate, input);

    const payload = buildEwayPayload({
      userGstin,
      documentNumber: row.brand_odc_number,
      documentDate: row.brand_sent_at ? new Date(row.brand_sent_at) : new Date(),
      consignor,
      consignee,
      ...nominal,
      itemDescription: `Wrist watch — brand repair — ${row.watch_brand}`,
      hsnSac: "9113",
      qty: 1,
      transportationDistanceKm: input?.transportationDistanceKm ?? "0",
      subSupplyDescription: `Send to brand — ${row.watch_brand}`,
      vehicleNumber: input?.vehicleNumber,
      transportationMode: input?.transportationMode,
      transporterName: input?.transporterName,
    });

    const result = await generateEwayBill(cfg, payload);
    await saveSrfEwayEdoc(pool, srfId, result);
    return result;
  } finally {
    client.release();
  }
}

async function loadRegionHoPartyForEway(client: import("pg").PoolClient, regionId: string) {
  const { loadRegionHoParty } = await import("../transferDocMeta");
  return loadRegionHoParty(client, regionId);
}

export async function getEwayPrefillForOnlineSpareOrder(pool: Pool, orderId: string): Promise<EwayPrefill | null> {
  const cfg = getMastersIndiaEdocConfig();
  const { rows } = await pool.query<{
    order_number: string;
    from_region_id: string;
    to_region_id: string;
    dispatched_at: string | null;
    edoc_eway_bill_no: string | null;
    line_total: string | null;
  }>(
    `SELECT o.order_number, o.from_region_id, o.to_region_id, o.dispatched_at, o.edoc_eway_bill_no,
            (SELECT COALESCE(SUM(l.line_total_inr), 0)::text FROM srf_inter_ho_spare_order_lines l WHERE l.order_id = o.id) AS line_total
     FROM srf_inter_ho_spare_orders o
     WHERE o.id = $1::uuid`,
    [orderId],
  );
  const row = rows[0];
  if (!row?.dispatched_at) return null;

  const { rows: regions } = await pool.query<{ id: string; name: string; gst: string | null }>(
    `SELECT id, name, gst FROM regions WHERE id = ANY($1::text[])`,
    [[row.from_region_id, row.to_region_id]],
  );
  const byId = new Map(regions.map((r) => [r.id, r]));
  const supplier = byId.get(row.to_region_id);
  const requester = byId.get(row.from_region_id);
  const consignorGstin = String(supplier?.gst ?? "").trim().toUpperCase();
  const consigneeGstin = String(requester?.gst ?? "").trim().toUpperCase();
  const lineTotal = Number(row.line_total ?? 0);
  const defaultValue = lineTotal > 0 ? lineTotal : (cfg?.ewayNominalValueInr ?? 1000);

  return {
    documentNumber: row.order_number,
    flowLabel: "Online store — inter-HO spare dispatch",
    fromLabel: supplier?.name ? `HO / Service Centre: ${supplier.name}` : "Supplier HO",
    toLabel: requester?.name ? `HO / Service Centre: ${requester.name}` : "Requesting HO",
    consignorGstin,
    consigneeGstin,
    vehicleNumber: "",
    defaultValueInr: defaultValue,
    interstate: gstinStateCode(consignorGstin) !== gstinStateCode(consigneeGstin),
    existingEwayBillNo: row.edoc_eway_bill_no,
  };
}

export async function tryGenerateEwayForOnlineSpareOrder(
  pool: Pool,
  orderId: string,
  input?: EwayGenerateInput,
): Promise<EdocResult> {
  const cfg = getMastersIndiaEdocConfig();
  if (!cfg?.enabled) return skip("E-doc not configured");

  const { rows } = await pool.query<{
    order_number: string;
    from_region_id: string;
    to_region_id: string;
    dispatched_at: string | null;
    edoc_eway_bill_no: string | null;
    line_total: string | null;
  }>(
    `SELECT o.order_number, o.from_region_id, o.to_region_id, o.dispatched_at, o.edoc_eway_bill_no,
            (SELECT COALESCE(SUM(l.line_total_inr), 0)::text FROM srf_inter_ho_spare_order_lines l WHERE l.order_id = o.id) AS line_total
     FROM srf_inter_ho_spare_orders o
     WHERE o.id = $1::uuid`,
    [orderId],
  );
  const row = rows[0];
  if (!row?.dispatched_at) return skip("Complete outward dispatch before generating e-way.");
  if (row.edoc_eway_bill_no && !input?.forceRegenerate) {
    return { ok: true, ewayBillNo: row.edoc_eway_bill_no, skipped: true, skipReason: "E-way already exists" };
  }

  const client = await pool.connect();
  try {
    const from = await loadRegionHoPartyForEway(client, row.to_region_id);
    const to = await loadRegionHoPartyForEway(client, row.from_region_id);
    const consignor = partyFromTransferBlock(from, resolveEdocEwayUserGstin("", cfg));
    const consignee = partyFromTransferBlock(to, consignor.gstin);
    if (!isValidGstin(consignor.gstin) || !isValidGstin(consignee.gstin)) {
      const r = skip("Consignor and consignee GSTIN required for e-way");
      await saveInterHoSpareOrderEwayEdoc(pool, orderId, r);
      return r;
    }

    const userGstin = resolveEdocEwayUserGstin(consignor.gstin, cfg);
    const interstate = consignor.stateCode !== consignee.stateCode;
    const lineTotal = Number(row.line_total ?? 0);
    const mergedInput: EwayGenerateInput = {
      ...input,
      taxableAmountInr: input?.taxableAmountInr ?? (lineTotal > 0 ? lineTotal : undefined),
    };
    const nominal = resolveEwayTotals(cfg.ewayNominalValueInr, interstate, mergedInput);

    const payload = buildEwayPayload({
      userGstin,
      documentNumber: row.order_number,
      documentDate: new Date(row.dispatched_at),
      consignor,
      consignee,
      ...nominal,
      itemDescription: "Spare parts — inter-HO online store dispatch",
      hsnSac: "9113",
      qty: 1,
      transportationDistanceKm: input?.transportationDistanceKm ?? "0",
      subSupplyDescription: "Online store inter-HO spare dispatch",
      vehicleNumber: input?.vehicleNumber,
      transportationMode: input?.transportationMode,
      transporterName: input?.transporterName,
    });

    const result = await generateEwayBill(cfg, payload);
    await saveInterHoSpareOrderEwayEdoc(pool, orderId, result);
    return result;
  } finally {
    client.release();
  }
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
