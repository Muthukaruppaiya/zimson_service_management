/** Approximate lat/lng by Indian pincode prefix for road-distance display only. */
const PIN_PREFIX3_COORDS: Record<string, { lat: number; lng: number }> = {
  "110": { lat: 28.6139, lng: 77.209 },
  "122": { lat: 28.4595, lng: 77.0266 },
  "201": { lat: 28.5355, lng: 77.391 },
  "226": { lat: 26.8467, lng: 80.9462 },
  "302": { lat: 26.9124, lng: 75.7873 },
  "380": { lat: 23.0225, lng: 72.5714 },
  "400": { lat: 19.076, lng: 72.8777 },
  "411": { lat: 18.5204, lng: 73.8567 },
  "440": { lat: 21.1458, lng: 79.0882 },
  "452": { lat: 22.7196, lng: 75.8577 },
  "500": { lat: 17.385, lng: 78.4867 },
  "520": { lat: 16.5062, lng: 80.648 },
  "530": { lat: 17.6868, lng: 83.2185 },
  "560": { lat: 12.9716, lng: 77.5946 },
  "570": { lat: 12.2958, lng: 76.6394 },
  "580": { lat: 15.4589, lng: 75.0078 },
  "581": { lat: 15.3647, lng: 75.124 },
  "590": { lat: 16.8302, lng: 75.71 },
  "600": { lat: 13.0827, lng: 80.2707 },
  "601": { lat: 13.0827, lng: 80.2707 },
  "602": { lat: 13.0827, lng: 80.2707 },
  "603": { lat: 13.0827, lng: 80.2707 },
  "605": { lat: 11.9416, lng: 79.8083 },
  "620": { lat: 10.7905, lng: 78.7047 },
  "625": { lat: 9.9252, lng: 78.1198 },
  "641": { lat: 11.0168, lng: 76.9558 },
  "642": { lat: 11.0168, lng: 76.9558 },
  "682": { lat: 9.9312, lng: 76.2673 },
  "695": { lat: 8.5241, lng: 76.9366 },
  "700": { lat: 22.5726, lng: 88.3639 },
  "751": { lat: 20.2961, lng: 85.8245 },
  "800": { lat: 25.5941, lng: 85.1376 },
};

/** Broader 2-digit fallback when 3-digit prefix is unknown. */
const PIN_PREFIX2_COORDS: Record<string, { lat: number; lng: number }> = {
  "11": { lat: 28.6139, lng: 77.209 },
  "12": { lat: 28.7041, lng: 77.1025 },
  "20": { lat: 26.8467, lng: 80.9462 },
  "30": { lat: 26.9124, lng: 75.7873 },
  "36": { lat: 22.3039, lng: 70.8022 },
  "38": { lat: 23.0225, lng: 72.5714 },
  "40": { lat: 19.076, lng: 72.8777 },
  "41": { lat: 18.5204, lng: 73.8567 },
  "44": { lat: 21.1458, lng: 79.0882 },
  "45": { lat: 22.7196, lng: 75.8577 },
  "50": { lat: 17.385, lng: 78.4867 },
  "52": { lat: 16.5062, lng: 80.648 },
  "53": { lat: 17.6868, lng: 83.2185 },
  "56": { lat: 12.9716, lng: 77.5946 },
  "57": { lat: 12.2958, lng: 76.6394 },
  "58": { lat: 15.4589, lng: 75.0078 },
  "59": { lat: 16.8302, lng: 75.71 },
  "60": { lat: 13.0827, lng: 80.2707 },
  "61": { lat: 11.1271, lng: 78.6569 },
  "62": { lat: 10.7905, lng: 78.7047 },
  "63": { lat: 10.7905, lng: 78.7047 },
  "64": { lat: 11.0168, lng: 76.9558 },
  "67": { lat: 11.8745, lng: 75.3704 },
  "68": { lat: 9.9312, lng: 76.2673 },
  "69": { lat: 8.5241, lng: 76.9366 },
  "70": { lat: 22.5726, lng: 88.3639 },
  "75": { lat: 20.2961, lng: 85.8245 },
  "80": { lat: 25.5941, lng: 85.1376 },
};

function pincodeCentroid(pin: number): { lat: number; lng: number } | null {
  const s = String(Math.max(0, Math.floor(pin))).padStart(6, "0");
  if (!/^\d{6}$/.test(s) || s === "000000") return null;
  return (
    PIN_PREFIX3_COORDS[s.slice(0, 3)] ??
    PIN_PREFIX2_COORDS[s.slice(0, 2)] ??
    null
  );
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Rough road distance between pincodes — display only; GST NIC calculates the official value. */
export function estimateEwayRoadDistanceKm(fromPin: number, toPin: number): number {
  const from = Math.floor(Number(fromPin));
  const to = Math.floor(Number(toPin));
  if (!from || !to || from === to) return 0;
  const a = pincodeCentroid(from);
  const b = pincodeCentroid(to);
  if (!a || !b) return 0;
  const airKm = haversineKm(a.lat, a.lng, b.lat, b.lng);
  return Math.max(5, Math.round((airKm * 1.25) / 5) * 5);
}

export function buildEwayDistancePrefill(fromPin: number, toPin: number): {
  displayDistanceKm: number;
  distanceForApi: string;
  distanceHint: string;
} {
  const from = Math.floor(Number(fromPin));
  const to = Math.floor(Number(toPin));
  if (!from || !to || from === to) {
    return {
      displayDistanceKm: 0,
      distanceForApi: "0",
      distanceHint:
        "Same from/to PIN — GST uses 0 km. Add correct PIN codes under Settings → Regions if this looks wrong.",
    };
  }
  const approx = estimateEwayRoadDistanceKm(from, to);
  if (approx <= 0) {
    return {
      displayDistanceKm: 0,
      distanceForApi: "0",
      distanceHint: `PIN ${from} → ${to}. GST NIC auto-calculates distance — sent as 0 km.`,
    };
  }
  return {
    displayDistanceKm: approx,
    distanceForApi: "0",
    distanceHint: `Approx ${approx} km (${from} → ${to}). GST NIC auto-calculates exact distance — sent as 0 km.`,
  };
}
