type TrackingLinkPayload = {
  phone: string;
  email?: string;
  name: string;
  trackingUrl: string;
  srfReference: string;
};

type ReestimateDecisionPayload = {
  srfReference: string;
  customerName: string;
  phone: string;
  decision: "accepted" | "rejected";
  note?: string;
};

export async function sendTrackingLink(payload: TrackingLinkPayload): Promise<void> {
  console.log(`[TRACKING LINK] Customer: ${payload.name} | Phone: ${payload.phone}`);
  console.log(`[TRACKING LINK] SRF: ${payload.srfReference}`);
  console.log(`[TRACKING LINK] URL: ${payload.trackingUrl}`);
}

export async function sendReestimateDecisionNotification(payload: ReestimateDecisionPayload): Promise<void> {
  console.log(
    `[REESTIMATE RESPONSE] SRF: ${payload.srfReference} | Customer: ${payload.customerName} | Phone: ${payload.phone} | Decision: ${payload.decision.toUpperCase()}`,
  );
  if (payload.note?.trim()) {
    console.log(`[REESTIMATE RESPONSE] Note: ${payload.note.trim()}`);
  }
}
