import { ApiError, apiJson } from "./api";

export type IndiaPinOffice = {
  name: string;
  district: string;
  state: string;
  block: string;
};

export type IndiaPinLookupResult = {
  state: string;
  district: string;
  districts: string[];
  postOffices: IndiaPinOffice[];
  citySuggestion: string;
};

type PinLookupApiResponse = {
  state: string;
  district: string;
  districts: string[];
  postOffices: IndiaPinOffice[];
  citySuggestion: string;
};

/**
 * India PIN lookup via same-origin `/api/geo/pin-lookup-in`.
 * The public api.postalpincode.in host often has TLS issues in browsers; the server proxies it safely.
 */
export async function fetchIndiaPinLookup(pincode: string): Promise<IndiaPinLookupResult> {
  const pin = pincode.replace(/\D/g, "").slice(0, 6);
  if (pin.length !== 6) {
    throw new Error("Enter a 6-digit Indian PIN code.");
  }

  try {
    const out = await apiJson<PinLookupApiResponse>(
      `/api/geo/pin-lookup-in?pincode=${encodeURIComponent(pin)}`,
    );
    return {
      state: out.state ?? "",
      district: out.district ?? "",
      districts: Array.isArray(out.districts) ? out.districts : [],
      postOffices: Array.isArray(out.postOffices) ? out.postOffices : [],
      citySuggestion: out.citySuggestion ?? "",
    };
  } catch (e) {
    if (e instanceof ApiError) {
      throw new Error(e.message || "PIN lookup failed.");
    }
    throw new Error("PIN lookup failed. Check your connection and try again.");
  }
}
