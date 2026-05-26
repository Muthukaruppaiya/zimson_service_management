/** India Post public PIN API (browser — avoids server TLS issues with expired certs on Node). */

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

type PinApiPostOffice = {
  Name?: string;
  District?: string;
  State?: string;
  Block?: string;
};

type PinApiRoot = {
  Status?: string;
  Message?: string;
  PostOffice?: PinApiPostOffice[] | null;
};

export async function fetchIndiaPinLookup(pincode: string): Promise<IndiaPinLookupResult> {
  const pin = pincode.replace(/\D/g, "").slice(0, 6);
  if (pin.length !== 6) {
    throw new Error("Enter a 6-digit Indian PIN code.");
  }

  const res = await fetch(`https://api.postalpincode.in/pincode/${encodeURIComponent(pin)}`);
  if (!res.ok) {
    throw new Error("PIN lookup network error.");
  }

  const raw: unknown = await res.json();
  const root = (Array.isArray(raw) && raw.length > 0 ? raw[0] : raw) as PinApiRoot;

  if (root?.Status !== "Success" || !Array.isArray(root.PostOffice) || root.PostOffice.length === 0) {
    throw new Error(root?.Message ?? "PIN code not found.");
  }

  const postOffices: IndiaPinOffice[] = root.PostOffice.map((o) => ({
    name: (o.Name ?? "").trim(),
    district: (o.District ?? "").trim(),
    state: (o.State ?? "").trim(),
    block: (o.Block ?? "").trim(),
  }));

  const states = [...new Set(postOffices.map((o) => o.state).filter(Boolean))];
  const districts = [...new Set(postOffices.map((o) => o.district).filter(Boolean))];

  return {
    state: states[0] ?? "",
    district: districts[0] ?? "",
    districts,
    postOffices,
    citySuggestion: postOffices[0]?.name ?? "",
  };
}
