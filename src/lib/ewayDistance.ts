/** Approximate lat/lng by Indian pincode prefix (first 3 digits) for road-distance display only. */
const PIN_PREFIX_COORDS: Record<string, { lat: number; lng: number }> = {
  "110": { lat: 28.6139, lng: 77.209 },
  "400": { lat: 19.076, lng: 72.8777 },
  "411": { lat: 18.5204, lng: 73.8567 },
  "500": { lat: 17.385, lng: 78.4867 },
  "560": { lat: 12.9716, lng: 77.5946 },
  "600": { lat: 13.0827, lng: 80.2707 },
  "601": { lat: 13.0827, lng: 80.2707 },
  "602": { lat: 13.0827, lng: 80.2707 },
  "603": { lat: 13.0827, lng: 80.2707 },
  "605": { lat: 11.9416, lng: 79.8083 },
  "641": { lat: 11.0168, lng: 76.9558 },
  "642": { lat: 11.0168, lng: 76.9558 },
  "700": { lat: 22.5726, lng: 88.3639 },
};

function pincodeCentroid(pin: number): { lat: number; lng: number } | null {
  const s = String(Math.max(0, Math.floor(pin))).padStart(6, "0");
  if (!/^\d{6}$/.test(s) || s === "000000") return null;
  return PIN_PREFIX_COORDS[s.slice(0, 3)] ?? null;
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
  return {
    displayDistanceKm: approx,
    distanceForApi: "0",
    distanceHint: `Approx ${approx} km (${from} → ${to}). GST NIC auto-calculates exact distance — sent as 0 km.`,
  };
}
