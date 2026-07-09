/** Demo technicians for store counter flows until API exists. */
export const SEED_TECHNICIANS = [
  { id: "tech-1", name: "R. Kumar", grade: "Grade A" },
  { id: "tech-2", name: "S. Menon", grade: "Grade B" },
  { id: "tech-3", name: "A. Shah", grade: "Grade C" },
] as const;

/** Test watch catalog: choose brand then model in forms. */
export const SEED_WATCH_CATALOG = [
  { id: "w-rolex-sub", brand: "Rolex", model: "Submariner Date 126610LN", refHint: "126610LN" },
  { id: "w-rolex-dj", brand: "Rolex", model: "Datejust 41 126300", refHint: "126300" },
  { id: "w-omega-sm", brand: "Omega", model: "Speedmaster Moonwatch", refHint: "310.30.42.50.01.001" },
  { id: "w-omega-at", brand: "Omega", model: "Aqua Terra 150M", refHint: "220.10.41.21.03.004" },
  { id: "w-tudor-bb", brand: "Tudor", model: "Black Bay 58", refHint: "79030N" },
  { id: "w-tudor-r", brand: "Tudor", model: "Royal 38", refHint: "M28500-0005" },
  { id: "w-seiko-5", brand: "Seiko", model: "5 Sports SRPD55", refHint: "SRPD55K1" },
  { id: "w-citizen-eco", brand: "Citizen", model: "Eco-Drive Promaster", refHint: "BN0150-28E" },
] as const;

export type WatchCatalogEntry = (typeof SEED_WATCH_CATALOG)[number];

export function watchBrands(): string[] {
  const set = new Set<string>();
  for (const w of SEED_WATCH_CATALOG) set.add(w.brand);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function watchModelsForBrand(brand: string): WatchCatalogEntry[] {
  const b = brand.trim().toLowerCase();
  if (!b) return [];
  return SEED_WATCH_CATALOG.filter((w) => w.brand.trim().toLowerCase() === b);
}

/** Spare parts test data for line items / estimates. */
export const SEED_PARTS = [
  { id: "p-crown", name: "Crown assembly (OEM spec)", sku: "ZIM-CR-01", unitPrice: 4500 },
  { id: "p-crystal", name: "Sapphire crystal", sku: "ZIM-GL-32", unitPrice: 3200 },
  { id: "p-battery", name: "Silver oxide battery kit", sku: "ZIM-BT-377", unitPrice: 350 },
  { id: "p-gasket", name: "Case back gasket set", sku: "ZIM-GS-RB", unitPrice: 890 },
  { id: "p-handset", name: "Handset — luminous", sku: "ZIM-HN-LU", unitPrice: 2100 },
  { id: "p-strap", name: "Rubber strap 20mm", sku: "ZIM-ST-RB20", unitPrice: 1200 },
  { id: "p-movement", name: "Movement service kit", sku: "ZIM-MV-SV", unitPrice: 5500 },
  { id: "p-clasp", name: "Deployant clasp", sku: "ZIM-CL-DP", unitPrice: 6800 },
] as const;

export type SeedPart = (typeof SEED_PARTS)[number];

export function findPart(id: string): SeedPart | undefined {
  return SEED_PARTS.find((p) => p.id === id);
}

import { generateOtpCode } from "../lib/otp";

/** Demo OTP for counter verification (display + re-type). */
export function generateDemoOtp(): string {
  return generateOtpCode();
}

export function nextQuickBillRef() {
  return `QB-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

export function nextSrfRef() {
  return `SRF-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
}

/** Loose PAN check: 5 letters + 4 digits + 1 letter */
export function isValidPanFormat(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(pan.trim());
}

/** Demo GSTIN: exactly 15 letters/digits (replace with strict GSTIN check when integrated). */
export function isValidGstFormat(gst: string): boolean {
  const g = gst.trim().toUpperCase().replace(/\s/g, "");
  return g.length === 15 && /^[0-9A-Z]+$/.test(g);
}

/** PAN is embedded in GSTIN at positions 3–12 (Indian GST format). */
export function panFromGstin(gst: string): string | null {
  const g = gst.trim().toUpperCase().replace(/\s/g, "");
  if (g.length !== 15) return null;
  const pan = g.slice(2, 12);
  return isValidPanFormat(pan) ? pan : null;
}
