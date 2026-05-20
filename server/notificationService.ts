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

/** Tracking / invoice links via WhatsApp will be wired later (Qikchat). */
export async function sendTrackingLink(payload: TrackingLinkPayload): Promise<void> {
  console.log(`[TRACKING LINK] Customer: ${payload.name} | Phone: ${payload.phone}`);
  console.log(`[TRACKING LINK] SRF: ${payload.srfReference}`);
  console.log(`[TRACKING LINK] URL: ${payload.trackingUrl}`);
  if (payload.email?.trim()) {
    console.log(`[TRACKING LINK] Email on file: ${payload.email.trim()} (email send — later)`);
  }
}

export async function sendReestimateDecisionNotification(payload: ReestimateDecisionPayload): Promise<void> {
  console.log(
    `[REESTIMATE RESPONSE] SRF: ${payload.srfReference} | Customer: ${payload.customerName} | Phone: ${payload.phone} | Decision: ${payload.decision.toUpperCase()}`,
  );
  if (payload.note?.trim()) {
    console.log(`[REESTIMATE RESPONSE] Note: ${payload.note.trim()}`);
  }
}
