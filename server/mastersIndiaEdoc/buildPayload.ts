import type { TransferPartyBlock } from "../transferDocMeta";
import {
  defaultPincodeForState,
  formatDocumentDate,
  gstinStateCode,
  edocPartyLocation,
  parsePincode,
  stateNameFromCode,
} from "./gstState";
import type {
  EdocParty,
  EdocValueTotals,
  EinvoicingBuildInput,
  EwayBuildInput,
} from "./types";
import {
  defaultUqcForEdocLine,
  formatGoodsHsnForEdoc,
  formatSacCodeForEdoc,
  isServiceSacCode,
} from "./hsnSac";
import {
  isInterstateEdocSupply,
  normalizeEdocLinesForSupply,
  normalizeEdocTotalsForSupply,
  normGstStateCode,
} from "./taxSplit";

function clampEdocField(value: string, maxLen: number): string {
  return String(value ?? "").trim().slice(0, maxLen);
}

function partyToApi(p: EdocParty): Record<string, unknown> {
  return {
    gstin: p.gstin,
    legal_name: clampEdocField(p.legalName, 100),
    trade_name: clampEdocField(p.tradeName ?? p.legalName, 100),
    address1: clampEdocField(p.address1, 100),
    address2: clampEdocField(p.address2 ?? "", 100),
    location: clampEdocField(p.location, 50),
    pincode: p.pincode,
    state_code: p.stateCode.replace(/\D/g, "").padStart(2, "0").slice(0, 2),
    phone_number: p.phone ?? "",
    email: p.email ?? "",
  };
}

export function partyFromTransferBlock(block: TransferPartyBlock, gstinFallback: string): EdocParty {
  const gstin =
    block.gstin && block.gstin !== "—"
      ? block.gstin.trim().toUpperCase()
      : gstinFallback;
  const stateCode = gstinStateCode(gstin);
  const addr = block.address && block.address !== "—" ? block.address : "Address line 1";
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  const place =
    block.place?.trim() ||
    edocPartyLocation(addr, null, stateCode);
  const pincode =
    block.pincode && block.pincode > 0
      ? block.pincode
      : parsePincode(addr, defaultPincodeForState(stateCode));
  return {
    gstin,
    legalName: block.legalName && block.legalName !== "—" ? block.legalName : "Party",
    tradeName: block.legalName,
    address1: parts[0] ?? addr.slice(0, 90),
    address2: parts.slice(1).join(", ").slice(0, 90) || "",
    location: place.slice(0, 50),
    pincode,
    stateCode,
    phone: block.phone !== "—" ? block.phone : undefined,
    email: block.email !== "—" ? block.email : undefined,
  };
}

export function buildEinvoicePayload(input: EinvoicingBuildInput): Record<string, unknown> {
  /** Standard B2B outward supply — not IGST-on-intra (SEZ / special cases). */
  const igstOnIntra = "N";
  const placeOfSupply = normGstStateCode(input.placeOfSupplyStateCode);
  const interstate = isInterstateEdocSupply(input.seller.stateCode, placeOfSupply);
  const lines = normalizeEdocLinesForSupply(input.lines, interstate);
  const totals = normalizeEdocTotalsForSupply(input.totals, interstate);

  const itemList = lines.map((ln) => {
    const totAmt = round2(ln.unitPrice * ln.qty);
    const discount = 0;
    const assAmt = round2(totAmt - discount);
    const taxAmt = round2(ln.cgst + ln.sgst + ln.igst);
    const isService = ln.isService ?? isServiceSacCode(ln.hsnSac);
    const hsnCode = isService
      ? formatSacCodeForEdoc(ln.hsnSac)
      : formatGoodsHsnForEdoc(ln.hsnSac);
    const unit = (ln.uqc?.trim() || defaultUqcForEdocLine(isService)).toUpperCase();
    return {
      item_serial_number: String(ln.slNo),
      product_description: ln.description.slice(0, 300),
      is_service: isService ? "Y" : "N",
      hsn_code: hsnCode,
      quantity: ln.qty,
      free_quantity: 0,
      unit,
      unit_price: round2(ln.unitPrice),
      total_amount: totAmt,
      discount,
      assessable_value: assAmt,
      gst_rate: ln.gstRatePercent ?? (assAmt > 0 ? round2((taxAmt / assAmt) * 100) : 18),
      cgst_amount: round2(ln.cgst),
      sgst_amount: round2(ln.sgst),
      igst_amount: round2(ln.igst),
      total_item_value: round2(assAmt + taxAmt),
    };
  });

  return {
    user_gstin: input.userGstin,
    data_source: "erp",
    transaction_details: {
      supply_type: "B2B",
      charge_type: "N",
      igst_on_intra: igstOnIntra,
      ecommerce_gstin: "",
    },
    document_details: {
      document_type: "INV",
      document_number: input.documentNumber.slice(0, 16),
      document_date: formatDocumentDate(input.documentDate),
    },
    seller_details: partyToApi(input.seller),
    buyer_details: {
      ...partyToApi(input.buyer),
      place_of_supply: placeOfSupply,
    },
    item_list: itemList,
    value_details: {
      total_assessable_value: round2(totals.taxable),
      total_cgst_value: round2(totals.cgst),
      total_sgst_value: round2(totals.sgst),
      total_igst_value: round2(totals.igst),
      total_invoice_value: round2(totals.total),
      total_cess_value: 0,
      total_discount: 0,
      round_off_amount: 0,
    },
  };
}

export function buildEwayPayload(input: EwayBuildInput): Record<string, unknown> {
  const consignorState = stateNameFromCode(input.consignor.stateCode);
  const consigneeState = stateNameFromCode(input.consignee.stateCode);
  const sameGstin = input.consignor.gstin === input.consignee.gstin;

  return {
    userGstin: input.userGstin,
    supply_type: "outward",
    sub_supply_type: sameGstin ? "Others" : "Supply",
    sub_supply_description: input.subSupplyDescription?.slice(0, 100) || "Inter-location goods movement",
    document_type: input.documentType ?? "Delivery Challan",
    document_number: input.documentNumber.slice(0, 50),
    document_date: formatDocumentDate(input.documentDate),
    gstin_of_consignor: input.consignor.gstin,
    legal_name_of_consignor: input.consignor.legalName,
    address1_of_consignor: input.consignor.address1,
    address2_of_consignor: input.consignor.address2 ?? "",
    place_of_consignor: input.consignor.location,
    pincode_of_consignor: input.consignor.pincode,
    state_of_consignor: consignorState,
    actual_from_state_name: consignorState,
    gstin_of_consignee: input.consignee.gstin,
    legal_name_of_consignee: input.consignee.legalName,
    address1_of_consignee: input.consignee.address1,
    address2_of_consignee: input.consignee.address2 ?? "",
    place_of_consignee: input.consignee.location,
    pincode_of_consignee: input.consignee.pincode,
    state_of_supply: consigneeState,
    actual_to_state_name: consigneeState,
    transaction_type: sameGstin ? 1 : 4,
    other_value: 0,
    total_invoice_value: round2(input.totalInvoiceValue),
    taxable_amount: round2(input.taxableAmount),
    cgst_amount: round2(input.cgst),
    sgst_amount: round2(input.sgst),
    igst_amount: round2(input.igst),
    cess_amount: 0,
    cess_nonadvol_value: 0,
    transporter_id: "",
    transporter_name: input.transporterName?.trim() || "",
    transporter_document_number: "",
    transporter_document_date: "",
    transportation_mode: input.transportationMode?.trim() || "Road",
    transportation_distance: input.transportationDistanceKm ?? "0",
    vehicle_number: input.vehicleNumber?.trim() || "NA",
    vehicle_type: "Regular",
    generate_status: 1,
    data_source: "erp",
    user_ref: input.documentNumber.slice(0, 50),
    location_code: "",
    eway_bill_status: "ABC",
    auto_print: "N",
    email: "",
    delete_record: "N",
    itemList: [
      {
        product_name: input.itemDescription.slice(0, 100),
        product_description: input.itemDescription.slice(0, 300),
        hsn_code: input.hsnSac.replace(/\D/g, "").slice(0, 8) || "9113",
        quantity: input.qty,
        unit_of_product: "NOS",
        cgst_rate: input.cgst > 0 ? 9 : 0,
        sgst_rate: input.sgst > 0 ? 9 : 0,
        igst_rate: input.igst > 0 ? 18 : 0,
        cess_rate: 0,
        cessNonAdvol: 0,
        taxable_amount: round2(input.taxableAmount),
      },
    ],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function nominalEwayTotals(
  nominalInr: number,
  interstate: boolean,
): Pick<EwayBuildInput, "taxableAmount" | "totalInvoiceValue" | "cgst" | "sgst" | "igst"> {
  const taxable = nominalInr;
  const tax = round2(taxable * 0.18);
  if (interstate) {
    return { taxableAmount: taxable, totalInvoiceValue: round2(taxable + tax), cgst: 0, sgst: 0, igst: tax };
  }
  const half = round2(tax / 2);
  return { taxableAmount: taxable, totalInvoiceValue: round2(taxable + tax), cgst: half, sgst: half, igst: 0 };
}

export type { EdocValueTotals };
