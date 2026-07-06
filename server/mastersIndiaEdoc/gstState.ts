/** GST state code (2 digits) → name for Masters India payloads. */
const CODE_TO_STATE: Record<string, string> = {
  "01": "JAMMU AND KASHMIR",
  "02": "HIMACHAL PRADESH",
  "03": "PUNJAB",
  "04": "CHANDIGARH",
  "05": "UTTARAKHAND",
  "06": "HARYANA",
  "07": "DELHI",
  "08": "RAJASTHAN",
  "09": "UTTAR PRADESH",
  "10": "BIHAR",
  "11": "SIKKIM",
  "12": "ARUNACHAL PRADESH",
  "13": "NAGALAND",
  "14": "MANIPUR",
  "15": "MIZORAM",
  "16": "TRIPURA",
  "17": "MEGHALAYA",
  "18": "ASSAM",
  "19": "WEST BENGAL",
  "20": "JHARKHAND",
  "21": "ODISHA",
  "22": "CHHATTISGARH",
  "23": "MADHYA PRADESH",
  "24": "GUJARAT",
  "26": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
  "27": "MAHARASHTRA",
  "29": "KARNATAKA",
  "30": "GOA",
  "31": "LAKSHADWEEP",
  "32": "KERALA",
  "33": "TAMIL NADU",
  "34": "PUDUCHERRY",
  "35": "ANDAMAN AND NICOBAR ISLANDS",
  "36": "TELANGANA",
  "37": "ANDHRA PRADESH",
  "38": "LADAKH",
};

export function gstinStateCode(gstin: string): string {
  const g = gstin.trim().toUpperCase();
  return g.length >= 2 ? g.slice(0, 2) : "33";
}

export function stateNameFromCode(code: string): string {
  const c = code.replace(/\D/g, "").padStart(2, "0").slice(0, 2);
  return CODE_TO_STATE[c] ?? "TAMIL NADU";
}

export function formatDocumentDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Representative pincode per GST state when address has none (IRP validates pin vs state). */
const STATE_DEFAULT_PIN: Record<string, number> = {
  "01": 190001,
  "02": 171001,
  "03": 141001,
  "04": 160017,
  "05": 248001,
  "06": 122001,
  "07": 110001,
  "08": 302001,
  "09": 226010,
  "10": 800001,
  "11": 737101,
  "12": 791111,
  "13": 797001,
  "14": 795001,
  "15": 796001,
  "16": 799001,
  "17": 793001,
  "18": 781001,
  "19": 700001,
  "20": 834001,
  "21": 751001,
  "22": 492001,
  "23": 462001,
  "24": 380001,
  "26": 396210,
  "27": 400001,
  "29": 560001,
  "30": 403001,
  "31": 682001,
  "32": 695001,
  "33": 600001,
  "34": 605001,
  "35": 744101,
  "36": 500001,
  "37": 522001,
  "38": 194101,
};

export function defaultPincodeForState(stateCode: string): number {
  const c = stateCode.replace(/\D/g, "").padStart(2, "0").slice(0, 2);
  return STATE_DEFAULT_PIN[c] ?? 600001;
}

/** Resolve PIN for e-way when region master has no pincode — uses city/name hints before state default. */
export function pincodeForEdocParty(params: {
  stateCode: string;
  place?: string | null;
  legalName?: string | null;
  address?: string | null;
  explicitPin?: number | null;
}): number {
  if (params.explicitPin != null && params.explicitPin > 0) return params.explicitPin;
  const addr = String(params.address ?? "");
  const fromAddr = addr.match(/\b(\d{6})\b/);
  if (fromAddr) return Number(fromAddr[1]);

  const hay = [params.place, params.legalName, addr].filter(Boolean).join(" ").toLowerCase();
  if (/\bcoimbatore\b|\bcbe\b/.test(hay)) return 641018;
  if (/\bchennai\b|\bmadras\b|\bchn\b/.test(hay)) return 600001;
  if (/\bbengaluru\b|\bbangalore\b|\bblr\b/.test(hay)) return 560001;
  if (/\bhyderabad\b/.test(hay)) return 500001;
  if (/\bmumbai\b/.test(hay)) return 400001;
  if (/\bdelhi\b|new delhi\b/.test(hay)) return 110001;
  if (/\bpune\b/.test(hay)) return 411001;
  if (/\bkolkata\b|\bcalcutta\b/.test(hay)) return 700001;

  return defaultPincodeForState(params.stateCode);
}

export function parsePincode(text: string, fallback?: number): number {
  const m = text.match(/\b(\d{6})\b/);
  if (m) return Number(m[1]);
  return fallback ?? 600001;
}

/** IRP `location` / place — city or locality only (max 50 chars), not full address. */
export function edocPartyLocation(
  address: string | null | undefined,
  city: string | null | undefined,
  stateCode: string,
): string {
  const cityTrim = String(city ?? "").trim();
  if (cityTrim) return cityTrim.slice(0, 50);

  const stateLabel = stateNameFromCode(stateCode);
  const addr = String(address ?? "").trim();
  if (!addr) return stateLabel.slice(0, 50);

  const parts = addr.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]!;
      if (/^\d{6}$/.test(p)) continue;
      if (p.toUpperCase() === stateLabel) continue;
      if (p.length >= 3 && p.length <= 50) return p;
    }
  }

  let work = addr.replace(/\b\d{6}\b\s*$/, "").trim();
  const statePat = new RegExp(`\\b${stateLabel.replace(/\s+/g, "\\s+")}\\s*$`, "i");
  work = work.replace(statePat, "").trim();
  if (work) {
    const tokens = work.split(/\s+/).filter(Boolean);
    const two = tokens.slice(-2).join(" ");
    if (two.length >= 3 && two.length <= 50) return two;
    const one = tokens[tokens.length - 1];
    if (one && one.length >= 3 && one.length <= 50) return one;
  }

  return stateLabel.slice(0, 50);
}
