import https from "node:https";

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

export type IndiaPinLookupServerResult = {
  state: string;
  district: string;
  districts: string[];
  states: string[];
  postOffices: { name: string; district: string; state: string; block: string }[];
  citySuggestion: string;
};

/** api.postalpincode.in TLS certificate may be expired — relaxed verify for this host only. */
function fetchJsonInsecure(url: string, timeoutMs = 12_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`PIN service returned ${res.statusCode}.`));
        res.resume();
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("PIN lookup timed out."));
    });
  });
}

function parsePinResponse(raw: unknown): IndiaPinLookupServerResult {
  const root = (Array.isArray(raw) && raw.length > 0 ? raw[0] : raw) as PinApiRoot;
  if (!root || root.Status !== "Success" || !Array.isArray(root.PostOffice) || root.PostOffice.length === 0) {
    const msg = root?.Message ?? "PIN code not found.";
    throw new Error(msg);
  }
  const offices = root.PostOffice;
  const states = [...new Set(offices.map((o) => (o.State ?? "").trim()).filter(Boolean))];
  const districts = [...new Set(offices.map((o) => (o.District ?? "").trim()).filter(Boolean))];
  const postOffices = offices.map((o) => ({
    name: (o.Name ?? "").trim(),
    district: (o.District ?? "").trim(),
    state: (o.State ?? "").trim(),
    block: (o.Block ?? "").trim(),
  }));
  return {
    state: states[0] ?? "",
    district: districts[0] ?? "",
    districts,
    states,
    postOffices,
    citySuggestion: (postOffices[0]?.name ?? "").trim(),
  };
}

export async function fetchIndiaPinLookupServer(pincode: string): Promise<IndiaPinLookupServerResult> {
  const pin = String(pincode).replace(/\D/g, "");
  if (pin.length !== 6) {
    throw new Error("Enter a 6-digit Indian PIN code.");
  }

  const url = `https://api.postalpincode.in/pincode/${encodeURIComponent(pin)}`;
  const text = await fetchJsonInsecure(url);
  const raw: unknown = JSON.parse(text);
  return parsePinResponse(raw);
}
