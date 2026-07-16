import { apiJson } from "./api";

/** Response from POST /api/gst/lookup (Masters India / Sandbox / other providers). */
export type GstLookupResult = {
  tradeName?: string;
  legalName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

export type PanLookupResult = {
  pan: string;
  legalName?: string;
  tradeName?: string;
  source?: string;
};

export function companyNameFromGstLookup(out: GstLookupResult): string {
  return (out.tradeName ?? out.legalName ?? "").trim();
}

export async function lookupCompanyByGstin(gstin: string): Promise<GstLookupResult> {
  return apiJson<GstLookupResult>("/api/gst/lookup", {
    method: "POST",
    json: { gst: gstin.trim().toUpperCase() },
  });
}

export async function lookupPanByNumber(pan: string): Promise<PanLookupResult> {
  return apiJson<PanLookupResult>("/api/pan/lookup", {
    method: "POST",
    json: { pan: pan.trim().toUpperCase() },
  });
}
