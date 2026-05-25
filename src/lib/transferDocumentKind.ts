import type { SeedRegion, SeedStore } from "../data/seed";

/** Printed document type: Delivery Challan when GST differs; internal transfer when same GSTIN. */
export type TransferPrintKind = "dc" | "transfer";

export type TransferFlow =
  | "store_to_ho"
  | "ho_to_store"
  | "ho_to_ho_dispatch"
  | "ho_to_ho_return";

export type TransferPartyBlock = {
  locationLabel: string;
  legalName: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
};

export function normalizeGstin(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Different GSTIN (or either missing) → Delivery Challan; same GSTIN → Transfer document only. */
export function transferPrintKindFromGstins(fromGstin?: string | null, toGstin?: string | null): TransferPrintKind {
  const from = normalizeGstin(fromGstin);
  const to = normalizeGstin(toGstin);
  if (!from || !to) return "dc";
  return from === to ? "transfer" : "dc";
}

export function formatRegionAddress(region: Pick<SeedRegion, "address" | "addressJson">): string {
  const json = region.addressJson as { line1?: string; city?: string; state?: string; pincode?: string } | null | undefined;
  if (json && typeof json === "object") {
    const parts = [json.line1, json.city, json.state, json.pincode].map((x) => String(x ?? "").trim()).filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  return String(region.address ?? "").trim() || "—";
}

export function storePartyFromSeed(store: SeedStore, region?: SeedRegion): TransferPartyBlock {
  return {
    locationLabel: `Store: ${store.invoiceDisplayName?.trim() || store.name}`,
    legalName: store.invoiceLegalEntityName?.trim() || store.invoiceDisplayName?.trim() || store.name,
    address: store.invoiceAddress?.trim() || (region ? formatRegionAddress(region) : "—"),
    phone: store.invoicePhone?.trim() || region?.phone?.trim() || "—",
    email: store.invoiceEmail?.trim() || region?.email?.trim() || "—",
    gstin: store.invoiceGstin?.trim() || "—",
  };
}

export function regionHoPartyFromSeed(region: SeedRegion): TransferPartyBlock {
  return {
    locationLabel: `HO / Service Centre: ${region.name}`,
    legalName: region.name,
    address: formatRegionAddress(region),
    phone: region.phone?.trim() || "—",
    email: region.email?.trim() || "—",
    gstin: region.gst?.trim() || "—",
  };
}

export function transferDocumentTitle(printKind: TransferPrintKind, flow: TransferFlow): string {
  const base = printKind === "dc" ? "Delivery Challan" : "Internal Transfer Document";
  switch (flow) {
    case "store_to_ho":
      return `${base} (Store → HO)`;
    case "ho_to_store":
      return `${base} (HO → Store)`;
    case "ho_to_ho_dispatch":
      return `${base} (Inter-HO Dispatch)`;
    case "ho_to_ho_return":
      return `${base} (Inter-HO Return)`;
    default:
      return base;
  }
}

export function transferNumberLabel(printKind: TransferPrintKind, seriesCode?: string): string {
  if (seriesCode?.trim()) {
    const code = seriesCode.trim().toUpperCase();
    if (code === "TD" || code === "TRF") return "Transfer No. (TD)";
    if (code === "DC") return "DC / Challan No.";
    return `${code} No.`;
  }
  return printKind === "dc" ? "DC / Challan No." : "Transfer No. (TD)";
}

/** Store → HO is always an internal transfer document (not a GST delivery challan). */
export function resolveStoreToHoPrint(
  store: SeedStore,
  region: SeedRegion,
): { printKind: TransferPrintKind; from: TransferPartyBlock; to: TransferPartyBlock } {
  const from = storePartyFromSeed(store, region);
  const to = regionHoPartyFromSeed(region);
  return { printKind: "transfer", from, to };
}

/** HO → store is always an internal transfer document (not a GST delivery challan). */
export function resolveHoToStorePrint(
  hoRegion: SeedRegion,
  destStore: SeedStore,
  destRegion?: SeedRegion,
): { printKind: TransferPrintKind; from: TransferPartyBlock; to: TransferPartyBlock } {
  const from = regionHoPartyFromSeed(hoRegion);
  const to = storePartyFromSeed(destStore, destRegion);
  return { printKind: "transfer", from, to };
}

export function resolveHoToHoPrint(
  fromRegion: SeedRegion,
  toRegion: SeedRegion,
  flow: "ho_to_ho_dispatch" | "ho_to_ho_return",
): { printKind: TransferPrintKind; from: TransferPartyBlock; to: TransferPartyBlock; flow: TransferFlow } {
  const from = regionHoPartyFromSeed(fromRegion);
  const to = regionHoPartyFromSeed(toRegion);
  return {
    printKind: "dc",
    flow,
    from,
    to,
  };
}
