type TrackingLinkPayload = {
  phone: string;
  email?: string;
  name: string;
  trackingUrl: string;
  srfReference: string;
};

export function trackingBaseUrl(): string {
  return String(process.env.APP_BASE_URL ?? "http://localhost:5173").trim().replace(/\/+$/, "");
}

export async function sendTrackingLink(payload: TrackingLinkPayload): Promise<void> {
  console.log(`[TRACKING LINK] Customer: ${payload.name} | Phone: ${payload.phone}`);
  console.log(`[TRACKING LINK] SRF: ${payload.srfReference}`);
  console.log(`[TRACKING LINK] URL: ${payload.trackingUrl}`);
}
