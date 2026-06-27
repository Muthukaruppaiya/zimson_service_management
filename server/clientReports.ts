import type { Pool, PoolClient } from "pg";
import * as XLSX from "xlsx";
import type { DemoUser } from "../src/types/user";

export type ReportFilters = {
  from: string;
  to: string;
  regionId?: string;
  storeId?: string;
};

type GstSplit = {
  taxPerc: number;
  taxAmt: number;
  cgst: number;
  sgst: number;
  igst: number;
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
};

function parseFilters(fromRaw: string, toRaw: string): ReportFilters {
  const from = (fromRaw || "").trim() || new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const to = (toRaw || "").trim() || new Date().toISOString().slice(0, 10);
  return { from, to };
}

/** Region / store scoping aligned with accounts invoice history. */
function reportActorScope(
  actor: DemoUser,
  params: unknown[],
  regionExpr: string,
  storeExpr: string,
): string {
  if (actor.role === "super_admin" || actor.role === "admin") return "TRUE";
  if (
    (actor.role === "store_accounts" || actor.role === "store_manager" || actor.role === "store_user") &&
    actor.storeId
  ) {
    params.push(actor.storeId);
    return `${storeExpr} = $${params.length}`;
  }
  if (actor.regionId) {
    params.push(actor.regionId);
    return `${regionExpr} = $${params.length}`;
  }
  return "FALSE";
}

function reportFilterSql(filters: ReportFilters, params: unknown[], regionExpr: string, storeExpr: string): string {
  if (filters.storeId) {
    params.push(filters.storeId);
    return `${storeExpr} = $${params.length}`;
  }
  if (filters.regionId) {
    params.push(filters.regionId);
    return `${regionExpr} = $${params.length}`;
  }
  return "TRUE";
}

function applyActorStoreScope(actor: DemoUser, filters: ReportFilters): ReportFilters {
  if (
    (actor.role === "store_accounts" || actor.role === "store_manager" || actor.role === "store_user") &&
    actor.storeId
  ) {
    return { ...filters, storeId: actor.storeId };
  }
  return filters;
}

function hsnGstPercent(hsn: string | null | undefined): number {
  const code = String(hsn ?? "").replace(/\D/g, "");
  if (!code) return 18;
  if (code.startsWith("9987") || code.startsWith("9986")) return 18;
  if (code.startsWith("9114") || code.startsWith("9108")) return 18;
  if (code.startsWith("8506") || code.startsWith("3926") || code.startsWith("7015")) return 18;
  return 18;
}

function splitGst(amountInr: number, gstPercent: number, interstate = false): GstSplit {
  const taxAmt = amountInr > 0 && gstPercent > 0 ? (amountInr * gstPercent) / (100 + gstPercent) : 0;
  const half = taxAmt / 2;
  if (interstate) {
    return {
      taxPerc: gstPercent / 100,
      taxAmt: round2(taxAmt),
      cgst: 0,
      sgst: 0,
      igst: gstPercent / 100,
      cgstValue: 0,
      sgstValue: 0,
      igstValue: round2(taxAmt),
    };
  }
  const rate = gstPercent / 100 / 2;
  return {
    taxPerc: gstPercent / 100,
    taxAmt: round2(taxAmt),
    cgst: rate,
    sgst: rate,
    igst: 0,
    cgstValue: round2(half),
    sgstValue: round2(half),
    igstValue: 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function storeLabel(shopCode: string, storeName: string, regionName: string): string {
  const code = shopCode.trim();
  const name = storeName.trim() || regionName.trim();
  if (code && name) return `${code} - ${name}`;
  return name || code || "—";
}

function shopCodeFromRef(ref: string, fallback: string): string {
  const m = ref.trim().match(/^([A-Za-z]+)/);
  return m?.[1]?.toUpperCase() ?? fallback;
}

type BillingLine = {
  description: string;
  amountInr: number;
  hsnSac?: string | null;
  spareId?: string | null;
  qty?: number;
};

function parseSnapshotLines(raw: unknown): BillingLine[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  const rows = Array.isArray(o.billLines) ? o.billLines : [];
  const out: BillingLine[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const description = String(r.description ?? "").trim();
    const amountInr = Number(r.amountInr);
    if (!description || !Number.isFinite(amountInr) || amountInr <= 0) continue;
    out.push({
      description,
      amountInr,
      hsnSac: r.hsnSac != null ? String(r.hsnSac) : null,
      spareId: r.spareId != null ? String(r.spareId) : null,
      qty: Number(r.qty) > 0 ? Number(r.qty) : 1,
    });
  }
  const svc = Number(o.serviceChargeInr);
  if (Number.isFinite(svc) && svc > 0 && !out.some((l) => /labour|service/i.test(l.description))) {
    out.push({ description: "Service / repair labour", amountInr: svc, hsnSac: "998722", qty: 1 });
  }
  if (out.length === 0) {
    const total = Number(o.netPayable ?? o.grandTotal ?? o.collectionAmountInr ?? o.billSubtotalInr ?? 0);
    if (Number.isFinite(total) && total > 0) {
      out.push({ description: "Service charges", amountInr: total, hsnSac: "998722", qty: 1 });
    }
  }
  return out;
}

function parseUsedSparesLines(raw: unknown): BillingLine[] {
  if (!Array.isArray(raw)) return [];
  const out: BillingLine[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const description = String(r.description ?? r.name ?? r.spareName ?? "Spare part").trim();
    const qty = Number(r.qty ?? 1) || 1;
    const unit = Number(r.unitPriceInr ?? r.unit_price_inr ?? r.rate ?? 0);
    const amountInr = Number(r.amountInr ?? r.lineTotalInr ?? qty * unit);
    if (!Number.isFinite(amountInr) || amountInr <= 0) continue;
    out.push({
      description,
      amountInr,
      spareId: r.spareId != null ? String(r.spareId) : null,
      hsnSac: r.hsnSac != null ? String(r.hsnSac) : null,
      qty,
    });
  }
  return out;
}

function snapshotPaymentMode(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object") return "";
  const o = snapshot as Record<string, unknown>;
  const mode = o.collectionPaymentMode ?? o.paymentMode;
  return typeof mode === "string" ? mode : "";
}

function invoiceLinesFromSnapshot(
  sourceType: string,
  snapshot: unknown,
  jobSnapshot: unknown,
  totalInr: number,
  natureOfRepair: string,
): BillingLine[] {
  const snap = snapshot && typeof snapshot === "object" ? snapshot : jobSnapshot;
  let lines = parseSnapshotLines(snap);
  if (lines.length === 0 && sourceType === "inter_ho_repair") {
    const used = (snap as Record<string, unknown> | null)?.usedSpares ?? (jobSnapshot as Record<string, unknown> | null)?.usedSpares;
    lines = parseUsedSparesLines(used);
  }
  if (lines.length === 0 && totalInr > 0) {
    lines = [{ description: natureOfRepair || "Service / repair", amountInr: totalInr, hsnSac: "998722", qty: 1 }];
  }
  return lines;
}

function paymentColumns(mode: string, amount: number): Record<string, number | string> {
  const m = mode.toLowerCase();
  const cols = { CASH: 0, CHEQUE: 0, CARD: 0, ONLINE: 0, "ONLINE MODE": "-", Advance: 0 };
  if (m.includes("cash")) cols.CASH = amount;
  else if (m.includes("cheque")) cols.CHEQUE = amount;
  else if (m.includes("card")) cols.CARD = amount;
  else if (m.includes("upi") || m.includes("online") || m.includes("bank") || m.includes("google") || m.includes("paytm")) {
    cols.ONLINE = amount;
    cols["ONLINE MODE"] = mode;
  } else if (amount > 0) cols.CASH = amount;
  return cols;
}

async function loadSpareHsn(client: Pool | PoolClient, spareIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (spareIds.length === 0) return map;
  const { rows } = await client.query<{ id: string; hsn: string | null }>(
    `SELECT id::text, hsn FROM spares WHERE id = ANY($1::uuid[])`,
    [spareIds],
  );
  for (const r of rows) map.set(r.id, String(r.hsn ?? "").trim());
  return map;
}

export type RevenueReportSheets = {
  srfLines: Record<string, unknown>[];
  quickBillLines: Record<string, unknown>[];
};

export async function fetchRevenueReportSheets(pool: Pool, actor: DemoUser, filters: ReportFilters): Promise<RevenueReportSheets> {
  filters = applyActorStoreScope(actor, filters);
  const srfLines: Record<string, unknown>[] = [];
  const quickBillLines: Record<string, unknown>[] = [];
  let srfSn = 0;
  let qbSn = 0;
  const spareIds: string[] = [];

  const invParams: unknown[] = [filters.from, filters.to];
  const invRegionExpr = "COALESCE(NULLIF(si.region_id, ''), sj.region_id)";
  const invStoreExpr = "COALESCE(NULLIF(si.store_id, ''), NULLIF(sj.destination_store_id, ''), sj.store_id)";
  const invActorSql = reportActorScope(actor, invParams, invRegionExpr, invStoreExpr);
  const invFilterSql = reportFilterSql(filters, invParams, invRegionExpr, invStoreExpr);

  const { rows: invoiceRows } = await pool.query(
    `SELECT si.invoice_number, si.invoice_date, si.created_at, si.source_type, si.snapshot_json,
            si.total_inr::float8 AS total_inr, si.customer_name, si.customer_phone, si.customer_gstin,
            si.srf_reference, si.created_by,
            sj.reference, sj.watch_brand, sj.watch_model, sj.serial, sj.nature_of_repair, sj.phone,
            sj.store_billing_snapshot,
            st.name AS store_name, st.invoice_number_store_code AS shop_code,
            r.name AS region_name,
            c.email, c.address, c.city, c.pan, c.gst AS customer_gst
     FROM service_invoices si
     LEFT JOIN srf_jobs sj ON sj.id::text = si.source_id
       AND si.source_type IN ('srf_store', 'inter_ho_repair')
     LEFT JOIN stores st ON st.id = COALESCE(NULLIF(si.store_id, ''), NULLIF(sj.destination_store_id, ''), sj.store_id)
     LEFT JOIN regions r ON r.id = COALESCE(NULLIF(si.region_id, ''), sj.region_id)
     LEFT JOIN customers c ON c.phone_last10 = RIGHT(regexp_replace(COALESCE(si.customer_phone, sj.phone, ''), '\\D', '', 'g'), 10)
     WHERE COALESCE(si.invoice_date, si.created_at::date) >= $1::date
       AND COALESCE(si.invoice_date, si.created_at::date) < ($2::date + INTERVAL '1 day')
       AND si.source_type IN ('srf_store', 'inter_ho_repair')
       AND ${invActorSql}
       AND ${invFilterSql}
     ORDER BY si.invoice_date, si.invoice_number`,
    invParams,
  );

  for (const row of invoiceRows) {
    const sourceType = String(row.source_type ?? "");
    const snapshot = row.snapshot_json;
    const jobSnapshot = row.store_billing_snapshot;
    const billLines = invoiceLinesFromSnapshot(
      sourceType,
      snapshot,
      jobSnapshot,
      Number(row.total_inr) || 0,
      String(row.nature_of_repair ?? ""),
    );
    for (const line of billLines) {
      if (line.spareId) spareIds.push(line.spareId);
    }
  }

  const legacyParams: unknown[] = [filters.from, filters.to];
  const legacyRegionExpr = "sj.region_id";
  const legacyStoreExpr = "COALESCE(NULLIF(sj.destination_store_id, ''), sj.store_id)";
  const legacyActorSql = reportActorScope(actor, legacyParams, legacyRegionExpr, legacyStoreExpr);
  const legacyFilterSql = reportFilterSql(filters, legacyParams, legacyRegionExpr, legacyStoreExpr);

  const { rows: legacyRows } = await pool.query(
    `SELECT sj.reference, sj.invoice_number, sj.closed_at, sj.updated_at, sj.customer_name, sj.phone,
            sj.watch_brand, sj.watch_model, sj.serial, sj.nature_of_repair, sj.store_billing_snapshot, sj.modified_by,
            st.name AS store_name, st.invoice_number_store_code AS shop_code,
            r.name AS region_name, c.email, c.address, c.city, c.pan, c.gst AS customer_gst,
            snap.collection_payment_mode, snap.collection_amount_inr
     FROM srf_jobs sj
     LEFT JOIN stores st ON st.id = COALESCE(NULLIF(sj.destination_store_id, ''), sj.store_id)
     LEFT JOIN regions r ON r.id = sj.region_id
     LEFT JOIN customers c ON c.phone_last10 = RIGHT(regexp_replace(sj.phone, '\\D', '', 'g'), 10)
     LEFT JOIN LATERAL (
       SELECT
         sj.store_billing_snapshot->>'collectionPaymentMode' AS collection_payment_mode,
         (sj.store_billing_snapshot->>'collectionAmountInr')::numeric AS collection_amount_inr
     ) snap ON TRUE
     WHERE sj.status = 'closed'
       AND COALESCE(sj.closed_at, sj.updated_at) >= $1::date
       AND COALESCE(sj.closed_at, sj.updated_at) < ($2::date + INTERVAL '1 day')
       AND (
         (sj.store_billing_snapshot IS NOT NULL AND sj.store_billing_snapshot::text NOT IN ('{}', 'null'))
         OR NULLIF(TRIM(sj.invoice_number), '') IS NOT NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM service_invoices si
         WHERE si.source_type = 'srf_store' AND si.source_id = sj.id::text
       )
       AND ${legacyActorSql}
       AND ${legacyFilterSql}
     ORDER BY sj.closed_at, sj.reference`,
    legacyParams,
  );

  for (const row of legacyRows) {
    for (const line of parseSnapshotLines(row.store_billing_snapshot)) {
      if (line.spareId) spareIds.push(line.spareId);
    }
  }

  const qbParams: unknown[] = [filters.from, filters.to];
  const qbActorSql = reportActorScope(actor, qbParams, "qb.region_id", "qb.store_id");
  const qbFilterSql = reportFilterSql(filters, qbParams, "qb.region_id", "qb.store_id");

  const { rows: qbRows } = await pool.query(
    `SELECT qb.bill_number, qb.invoice_number, qb.created_at, qb.customer_name, qb.phone, qb.email, qb.pan, qb.gst,
            qb.watch_brand, qb.watch_model, qb.watch_ref, qb.nature_of_repair, qb.payment_mode, qb.total_inr,
            qb.created_by, qb.customer_code,
            qbl.description, qbl.amount_inr, qbl.qty, qbl.spare_id,
            st.name AS store_name, st.invoice_number_store_code AS shop_code,
            r.name AS region_name, qb.address, qb.city, qb.customer_billing_state
     FROM quick_bills qb
     JOIN quick_bill_lines qbl ON qbl.quick_bill_id = qb.id
     LEFT JOIN stores st ON st.id = qb.store_id
     LEFT JOIN regions r ON r.id = qb.region_id
     WHERE qb.created_at >= $1::date
       AND qb.created_at < ($2::date + INTERVAL '1 day')
       AND ${qbActorSql}
       AND ${qbFilterSql}
     ORDER BY qb.created_at, qb.bill_number, qbl.line_no`,
    qbParams,
  );

  for (const row of qbRows) {
    if (row.spare_id) spareIds.push(String(row.spare_id));
  }

  const spareHsn = await loadSpareHsn(pool, [...new Set(spareIds)]);

  for (const row of invoiceRows) {
    const sourceType = String(row.source_type ?? "");
    const snapshot = row.snapshot_json;
    const jobSnapshot = row.store_billing_snapshot;
    const billLines = invoiceLinesFromSnapshot(
      sourceType,
      snapshot,
      jobSnapshot,
      Number(row.total_inr) || 0,
      String(row.nature_of_repair ?? ""),
    );
    const invDate = row.invoice_date ?? row.created_at ?? new Date();
    const reference = String(row.srf_reference ?? row.reference ?? "");
    const shop = String(row.shop_code ?? shopCodeFromRef(reference, ""));
    const store = storeLabel(shop, String(row.store_name ?? ""), String(row.region_name ?? ""));
    const invcNo = String(row.invoice_number ?? "").trim();
    const paymentMode = snapshotPaymentMode(snapshot) || snapshotPaymentMode(jobSnapshot);
    const srType = sourceType === "inter_ho_repair" ? "Inter-HO Repair" : "SR Bill";

    for (const line of billLines) {
      srfSn += 1;
      const hsn = line.hsnSac || (line.spareId ? spareHsn.get(line.spareId) : "") || "998722";
      const gst = splitGst(line.amountInr, hsnGstPercent(hsn));
      srfLines.push({
        "S.No": srfSn,
        "SR #": reference,
        INVCDATE: invDate ? new Date(invDate) : new Date(),
        STORE: store,
        INVCNO: invcNo,
        ITEM: line.description,
        HSNCODE: hsn,
        BRAND: row.watch_brand,
        "BRAND MODEL": row.watch_model,
        "MODEL NUMBER": row.serial,
        SOLDQTY: line.qty ?? 1,
        ORGPRICE: 0,
        FINALPRICE: round2(line.amountInr),
        TAXPERC: gst.taxPerc,
        TAXAMT: gst.taxAmt,
        CGST: gst.cgst,
        SGST: gst.sgst,
        IGST: gst.igst,
        CGSTVALUE: gst.cgstValue,
        SGSTVALUE: gst.sgstValue,
        IGSTVALUE: gst.igstValue,
        FIRSTNAME: row.customer_name,
        PHONE1: row.customer_phone ?? row.phone,
        EMAILADDR: row.email ?? "",
        "Address 1": row.address ?? "",
        "Address 2": "",
        City: row.city ?? "",
        State: "Tamilnadu",
        Country: "India",
        ZIP: "",
        PAN: row.pan ?? "",
        CUSTGSTNO: row.customer_gstin ?? row.customer_gst ?? "",
        "SR.Type": srType,
        "Payment Remarks": paymentMode,
        "Created By": row.created_by ?? "",
      });
    }
  }

  for (const row of legacyRows) {
    let billLines = parseSnapshotLines(row.store_billing_snapshot);
    if (billLines.length === 0) {
      const amt = Number(row.collection_amount_inr);
      if (Number.isFinite(amt) && amt > 0) {
        billLines = [{ description: String(row.nature_of_repair || "Service charges"), amountInr: amt, qty: 1 }];
      }
    }
    const invDate = row.closed_at ?? row.updated_at ?? new Date();
    const shop = String(row.shop_code ?? shopCodeFromRef(row.reference, ""));
    const store = storeLabel(shop, String(row.store_name ?? ""), String(row.region_name ?? ""));
    const invcNo = String(row.invoice_number ?? "").trim();
    for (const line of billLines) {
      srfSn += 1;
      const hsn = line.hsnSac || (line.spareId ? spareHsn.get(line.spareId) : "") || "998722";
      const gst = splitGst(line.amountInr, hsnGstPercent(hsn));
      srfLines.push({
        "S.No": srfSn,
        "SR #": row.reference,
        INVCDATE: invDate ? new Date(invDate) : new Date(),
        STORE: store,
        INVCNO: invcNo,
        ITEM: line.description,
        HSNCODE: hsn,
        BRAND: row.watch_brand,
        "BRAND MODEL": row.watch_model,
        "MODEL NUMBER": row.serial,
        SOLDQTY: line.qty ?? 1,
        ORGPRICE: 0,
        FINALPRICE: round2(line.amountInr),
        TAXPERC: gst.taxPerc,
        TAXAMT: gst.taxAmt,
        CGST: gst.cgst,
        SGST: gst.sgst,
        IGST: gst.igst,
        CGSTVALUE: gst.cgstValue,
        SGSTVALUE: gst.sgstValue,
        IGSTVALUE: gst.igstValue,
        FIRSTNAME: row.customer_name,
        PHONE1: row.phone,
        EMAILADDR: row.email ?? "",
        "Address 1": row.address ?? "",
        "Address 2": "",
        City: row.city ?? "",
        State: "Tamilnadu",
        Country: "India",
        ZIP: "",
        PAN: row.pan ?? "",
        CUSTGSTNO: row.customer_gst ?? "",
        "SR.Type": "SR Bill",
        "Payment Remarks": row.collection_payment_mode ?? "",
        "Created By": row.modified_by ?? "",
      });
    }
  }

  for (const row of qbRows) {
    qbSn += 1;
    const hsn = row.spare_id ? spareHsn.get(String(row.spare_id)) ?? "998722" : "998722";
    const amount = Number(row.amount_inr);
    const gst = splitGst(amount, hsnGstPercent(hsn));
    const invDate = row.created_at ? new Date(row.created_at) : new Date();
    const shop = String(row.shop_code ?? shopCodeFromRef(row.bill_number, ""));
    quickBillLines.push({
      "S.No": qbSn,
      "SR #": row.bill_number,
      INVCDATE: invDate,
      STORE: storeLabel(shop, String(row.store_name ?? ""), String(row.region_name ?? "")),
      INVCNO: String(row.invoice_number ?? row.bill_number ?? ""),
      ITEM: row.description,
      HSNCODE: hsn,
      BRAND: row.watch_brand,
      "BRAND MODEL": row.watch_model,
      "MODEL NUMBER": row.watch_ref ?? "",
      SOLDQTY: Number(row.qty) || 1,
      ORGPRICE: 0,
      FINALPRICE: round2(amount),
      TAXPERC: gst.taxPerc,
      TAXAMT: gst.taxAmt,
      CGST: gst.cgst,
      SGST: gst.sgst,
      IGST: gst.igst,
      CGSTVALUE: gst.cgstValue,
      SGSTVALUE: gst.sgstValue,
      IGSTVALUE: gst.igstValue,
      FIRSTNAME: row.customer_name ?? "",
      PHONE1: row.phone ?? "",
      EMAILADDR: row.email ?? "",
      "Address 1": row.address ?? "",
      "Address 2": "",
      City: row.city ?? "",
      State: row.customer_billing_state ?? "Tamilnadu",
      Country: "India",
      ZIP: "",
      PAN: row.pan ?? "",
      CUSTGSTNO: row.gst ?? "",
      "SR.Type": "Quick Bill",
      "Payment Remarks": row.payment_mode ?? "",
      "Created By": row.created_by ?? "",
    });
  }

  return { srfLines, quickBillLines };
}

export async function fetchRevenueLines(pool: Pool, actor: DemoUser, filters: ReportFilters) {
  const { srfLines, quickBillLines } = await fetchRevenueReportSheets(pool, actor, filters);
  return [...srfLines, ...quickBillLines];
}

export async function fetchSummarySaleRows(pool: Pool, actor: DemoUser, filters: ReportFilters) {
  const revenue = await fetchRevenueLines(pool, actor, filters);
  const byInvoice = new Map<string, Record<string, unknown>[]>();
  for (const row of revenue) {
    const key = `${row["SR #"]}|${row.INVCNO}`;
    const list = byInvoice.get(key) ?? [];
    list.push(row);
    byInvoice.set(key, list);
  }

  const rows: Record<string, unknown>[] = [];
  let sn = 0;
  for (const group of byInvoice.values()) {
    const head = group[0]!;
    sn += 1;
    const qty = group.reduce((s, r) => s + Number(r.SOLDQTY ?? 1), 0);
    const finalPrice = group.reduce((s, r) => s + Number(r.FINALPRICE ?? 0), 0);
    const taxAmt = group.reduce((s, r) => s + Number(r.TAXAMT ?? 0), 0);
    const cgstVal = group.reduce((s, r) => s + Number(r.CGSTVALUE ?? 0), 0);
    const sgstVal = group.reduce((s, r) => s + Number(r.SGSTVALUE ?? 0), 0);
    const pay = paymentColumns(String(head["Payment Remarks"] ?? ""), finalPrice);
    const store = String(head.STORE ?? "");
    const shopCode = store.split(" - ")[0] ?? "";
    rows.push({
      "S.No": sn,
      "SR #": head["SR #"],
      "Shop Code": shopCode,
      "CUST ID": head.CUSTGSTNO ? `CUST-${String(head.PHONE1 ?? "").slice(-6)}` : "",
      "INVC.DATE": head.INVCDATE,
      STORE: head.STORE,
      INVC_NO: head.INVCNO,
      RCPTTYPE: "Sale",
      "Nature Of Repair": head["SR.Type"] === "Quick Bill" ? "walk-in" : "chargeable",
      BRAND: head.BRAND,
      "BRAND MODEL": head["BRAND MODEL"],
      "MODEL NUMBER": head["MODEL NUMBER"],
      QTY: qty,
      DISC_AMT: null,
      EXT_ORIG_PWT: round2(finalPrice),
      FINALPRICE: round2(finalPrice),
      "TAX%": head.TAXPERC,
      TAX_AMT: round2(taxAmt),
      CGST: head.CGST,
      SGST: head.SGST,
      IGST: head.IGST,
      CGSTVALUE: round2(cgstVal),
      SGSTVALUE: round2(sgstVal),
      IGSTVALUE: group.reduce((s, r) => s + Number(r.IGSTVALUE ?? 0), 0),
      FEE: 0,
      ...pay,
      Reference: "-",
      Remarks: "-",
      FIRST_NAME: head.FIRSTNAME,
      PHONE1: head.PHONE1,
      EMAIL_ADDR: head.EMAILADDR,
      "Address 1": head["Address 1"],
      "Address 2": head["Address 2"],
      City: head.City,
      State: head.State,
      Country: head.Country,
      ZIP: head.ZIP,
      PAN: head.PAN,
      CUSTGSTNO: head.CUSTGSTNO,
      "SR.Type": head["SR.Type"],
      Payment: head["Payment Remarks"],
      "created By": head["Created By"],
    });
  }
  return rows;
}

export async function fetchHsnPurchaseRows(pool: Pool, actor: DemoUser, filters: ReportFilters) {
  filters = applyActorStoreScope(actor, filters);
  const params: unknown[] = [filters.from, filters.to];
  const actorSql = reportActorScope(actor, params, "g.region_id", "g.region_id");
  const filterSql = reportFilterSql(filters, params, "g.region_id", "g.region_id");

  const { rows } = await pool.query(
    `SELECT g.grn_number, g.invoice_date, g.created_at, g.invoice_number, g.invoice_total_amount,
            g.region_id, gi.qty_received, gi.cost_price, gi.gst_rate, gi.tax_amount,
            s.supplier_code, s.name AS supplier_name, s.address, s.gst AS supplier_gst, s.phone AS supplier_phone,
            sp.hsn, sp.name AS spare_name, sp.sku,
            r.name AS region_name, st.name AS store_name, st.invoice_number_store_code AS shop_code
     FROM grn_items gi
     JOIN grns g ON g.id = gi.grn_id
     JOIN suppliers s ON s.id = g.supplier_id
     JOIN spares sp ON sp.id = gi.spare_id
     JOIN regions r ON r.id = g.region_id
     LEFT JOIN stores st ON st.region_id = g.region_id
     WHERE COALESCE(g.invoice_date, g.created_at::date) >= $1::date
       AND COALESCE(g.invoice_date, g.created_at::date) < ($2::date + INTERVAL '1 day')
       AND ${actorSql}
       AND ${filterSql}
     ORDER BY g.created_at, g.grn_number, gi.id`,
    params,
  );

  return rows.map((row, idx) => {
    const qty = Number(row.qty_received);
    const cost = Number(row.cost_price);
    const gstRate = Number(row.gst_rate) || 18;
    const lineCost = round2(qty * cost);
    const taxAmt = Number(row.tax_amount) || round2((lineCost * gstRate) / 100);
    const invVal = round2(lineCost + taxAmt);
    const igstVal = taxAmt;
    const vouDate = row.invoice_date ?? row.created_at;
    const storeCode = String(row.shop_code ?? row.region_name ?? "").trim();
    return {
      "S.No": idx + 1,
      "Store Code": storeCode ? `${storeCode.toUpperCase()} ${String(row.store_name ?? row.region_name ?? "").toUpperCase()}` : row.region_name,
      "Vou.No.": row.grn_number,
      "Vou.Date": vouDate ? new Date(vouDate) : "",
      "Vendor Code": row.supplier_code,
      "Vendor Name": row.supplier_name,
      "Addr 1": row.address ?? "",
      "Addr 2": null,
      "Addr 3": null,
      Zip: "",
      Phone: row.supplier_phone ?? "",
      GST: row.supplier_gst ?? "",
      "Vendor Inv.No.": row.invoice_number ?? "",
      "Vendor Inv.Date": row.invoice_date ? new Date(row.invoice_date) : "",
      Comm1: null,
      Comm2: null,
      Comm3: null,
      Comm4: null,
      "Sum(Pur.Qty)": qty,
      Cost: round2(cost),
      IGST: gstRate,
      CGST: 0,
      SGST: 0,
      "IGST Val.": round2(igstVal),
      "CGST Val.": 0,
      "SGST Val.": 0,
      "Tot. Tax.Val.": round2(taxAmt),
      Fee: null,
      TCS: 0,
      Shipping: 0,
      Price: invVal,
      "Inv.Val.": invVal,
      "HSN Code": row.hsn ?? "",
      "Due Days": null,
      Narration: row.spare_name ?? row.sku ?? "",
    };
  });
}

export async function fetchSrReturnedRows(pool: Pool, actor: DemoUser, filters: ReportFilters) {
  filters = applyActorStoreScope(actor, filters);
  const params: unknown[] = [filters.from, filters.to];
  const regionExpr = "sj.region_id";
  const storeExpr = "COALESCE(NULLIF(sj.destination_store_id, ''), sj.store_id)";
  const actorSql = reportActorScope(actor, params, regionExpr, storeExpr);
  const filterSql = reportFilterSql(filters, params, regionExpr, storeExpr);

  const { rows } = await pool.query(
    `SELECT sal.created_at AS returned_at, sal.description, sal.actor_name,
            sj.reference, sj.invoice_number, sj.closed_at, sj.customer_name, sj.phone, sj.watch_brand,
            sj.watch_model, sj.serial, sj.nature_of_repair, sj.store_billing_snapshot,
            st.name AS store_name, st.invoice_number_store_code AS shop_code,
            r.name AS region_name, c.email, c.address, c.city, c.pan, c.gst AS customer_gst
     FROM srf_action_log sal
     JOIN srf_jobs sj ON sj.id = sal.srf_id
     LEFT JOIN stores st ON st.id = COALESCE(NULLIF(sj.destination_store_id, ''), sj.store_id)
     LEFT JOIN regions r ON r.id = sj.region_id
     LEFT JOIN customers c ON c.phone_last10 = RIGHT(regexp_replace(sj.phone, '\\D', '', 'g'), 10)
     WHERE sal.action IN ('store_no_billing_handover', 'inter_ho_return_without_repair')
       AND sal.created_at >= $1::date
       AND sal.created_at < ($2::date + INTERVAL '1 day')
       AND ${actorSql}
       AND ${filterSql}
     ORDER BY sal.created_at, sj.reference`,
    params,
  );

  const spareIds: string[] = [];
  for (const row of rows) {
    for (const line of parseSnapshotLines(row.store_billing_snapshot)) {
      if (line.spareId) spareIds.push(line.spareId);
    }
  }
  const spareHsn = await loadSpareHsn(pool, [...new Set(spareIds)]);

  const out: Record<string, unknown>[] = [];
  let sn = 0;
  for (const row of rows) {
    const billLines = parseSnapshotLines(row.store_billing_snapshot);
    const lines: BillingLine[] =
      billLines.length > 0
        ? billLines
        : [{ description: row.nature_of_repair || "Returned without repair", amountInr: 0, qty: 1 }];
    const returnedNo = `RTN-${String(row.reference ?? "").replace(/\s/g, "")}-${new Date(row.returned_at).getTime().toString().slice(-6)}`;
    const shop = String(row.shop_code ?? shopCodeFromRef(row.reference, ""));
    const store = storeLabel(shop, String(row.store_name ?? ""), String(row.region_name ?? ""));
    const invDate = row.closed_at ? new Date(row.closed_at) : null;
    for (const line of lines) {
      sn += 1;
      const hsn = line.hsnSac || (line.spareId ? spareHsn.get(line.spareId) : "") || "998722";
      const gst = splitGst(line.amountInr, hsnGstPercent(hsn));
      out.push({
        "S.No": sn,
        "RETURNED.DATE": new Date(row.returned_at),
        "RETURNED.No.": returnedNo,
        INVCDATE: invDate ?? "",
        STORE: store,
        INVCNO: row.invoice_number ?? "",
        "SR No.": row.reference,
        ITEM: line.description,
        HSNCODE: hsn,
        BRAND: row.watch_brand,
        MODEL: row.watch_model,
        "MODEL NUMBER": row.serial,
        SOLDQTY: line.qty ?? 1,
        ORGPRICE: 0,
        FINALPRICE: round2(line.amountInr),
        TAXPERC: gst.taxPerc,
        TAXAMT: gst.taxAmt,
        CGST: gst.cgst,
        SGST: gst.sgst,
        IGST: gst.igst,
        CGSTVALUE: gst.cgstValue,
        SGSTVALUE: gst.sgstValue,
        IGSTVALUE: gst.igstValue,
        FIRSTNAME: row.customer_name,
        PHONE1: row.phone,
        EMAILADDR: row.email ?? "",
        "Address 1": row.address ?? "",
        "Address 2": "",
        City: row.city ?? "",
        State: "Tamilnadu",
        Country: "India",
        ZIP: "",
        PAN: row.pan ?? "",
        CUSTGSTNO: row.customer_gst ?? "",
        "Nature of Repair": row.nature_of_repair || "Returned",
        "Created By": row.actor_name ?? "",
      });
    }
  }
  return out;
}

/** Column order matching legacy Zimson exports. */
export const REVENUE_HEADERS = [
  "S.No", "SR #", "INVCDATE", "STORE", "INVCNO", "ITEM", "HSNCODE", "BRAND", "BRAND MODEL", "MODEL NUMBER",
  "SOLDQTY", "ORGPRICE", "FINALPRICE", "TAXPERC", "TAXAMT", "CGST", "SGST", "IGST", "CGSTVALUE", "SGSTVALUE",
  "IGSTVALUE", "FIRSTNAME", "PHONE1", "EMAILADDR", "Address 1", "Address 2", "City", "State", "Country", "ZIP",
  "PAN", "CUSTGSTNO", "SR.Type", "Payment Remarks", "Created By",
] as const;

export const SUMMARY_SALE_HEADERS = [
  "S.No", "SR #", "Shop Code", "CUST ID", "INVC.DATE", "STORE", "INVC_NO", "RCPTTYPE", "Nature Of Repair",
  "BRAND", "BRAND MODEL", "MODEL NUMBER", "QTY", "DISC_AMT", "EXT_ORIG_PWT", "FINALPRICE", "TAX%", "TAX_AMT",
  "CGST", "SGST", "IGST", "CGSTVALUE", "SGSTVALUE", "IGSTVALUE", "FEE", "CASH", "CHEQUE", "CARD", "ONLINE",
  "ONLINE MODE", "Advance", "Reference", "Remarks", "FIRST_NAME", "PHONE1", "EMAIL_ADDR", "Address 1", "Address 2",
  "City", "State", "Country", "ZIP", "PAN", "CUSTGSTNO", "SR.Type", "Payment", "created By",
] as const;

export const HSN_PURCHASE_HEADERS = [
  "S.No", "Store Code", "Vou.No.", "Vou.Date", "Vendor Code", "Vendor Name", "Addr 1", "Addr 2", "Addr 3", "Zip",
  "Phone", "GST", "Vendor Inv.No.", "Vendor Inv.Date", "Comm1", "Comm2", "Comm3", "Comm4", "Sum(Pur.Qty)", "Cost",
  "IGST", "CGST", "SGST", "IGST Val.", "CGST Val.", "SGST Val.", "Tot. Tax.Val.", "Fee", "TCS", "Shipping", "Price",
  "Inv.Val.", "HSN Code", "Due Days", "Narration",
] as const;

export const SR_RETURNED_HEADERS = [
  "S.No", "RETURNED.DATE", "RETURNED.No.", "INVCDATE", "STORE", "INVCNO", "SR No.", "ITEM", "HSNCODE", "BRAND",
  "MODEL", "MODEL NUMBER", "SOLDQTY", "ORGPRICE", "FINALPRICE", "TAXPERC", "TAXAMT", "CGST", "SGST", "IGST",
  "CGSTVALUE", "SGSTVALUE", "IGSTVALUE", "FIRSTNAME", "PHONE1", "EMAILADDR", "Address 1", "Address 2", "City",
  "State", "Country", "ZIP", "PAN", "CUSTGSTNO", "Nature of Repair", "Created By",
] as const;

export type ReportLayout = {
  headers: readonly string[];
  /** Title in row 1, cell A1 only (legacy format). Omit for HSN purchase. */
  title?: string;
  sheetName?: string;
};

function reportTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(h)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ampm}`;
}

function toExcelDate(value: unknown): unknown {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const epoch = Date.UTC(1899, 11, 30);
    return Math.floor((Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) - epoch) / 86400000);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return toExcelDate(parsed);
  }
  return value ?? "";
}


function rowCells(headers: readonly string[], row: Record<string, unknown>): unknown[] {
  return headers.map((h) => {
    const v = row[h];
    if (v instanceof Date || (typeof v === "string" && /DATE|Date|INVCDATE|INVC\.DATE/i.test(h))) {
      return toExcelDate(v);
    }
    return v ?? "";
  });
}

export function buildReportWorkbook(layout: ReportLayout, rows: Record<string, unknown>[]): Buffer {
  return buildMultiSheetReportWorkbook([{ layout, rows }]);
}

export function buildMultiSheetReportWorkbook(
  sheets: Array<{ layout: ReportLayout; rows: Record<string, unknown>[] }>,
): Buffer {
  const wb = XLSX.utils.book_new();
  for (const { layout, rows } of sheets) {
    const { headers, title, sheetName = "in" } = layout;
    const aoa: unknown[][] = [];

    if (title) {
      const titleRow: unknown[] = [`${title} - ${reportTimestamp()}`];
      while (titleRow.length < headers.length) titleRow.push("");
      aoa.push(titleRow);
    }

    aoa.push([...headers]);
    for (const row of rows) {
      aoa.push(rowCells(headers, row));
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const safeName = sheetName.slice(0, 31) || "Sheet";
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function parseReportFilters(query: Record<string, unknown>): ReportFilters {
  return {
    ...parseFilters(String(query.from ?? ""), String(query.to ?? "")),
    regionId: String(query.regionId ?? "").trim() || undefined,
    storeId: String(query.storeId ?? "").trim() || undefined,
  };
}
