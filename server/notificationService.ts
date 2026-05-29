import {
  formatIndiaMobileE164,
  getMessagingConfig,
  getQikchatMessagesUrl,
  isEmailConfigured,
  isWhatsAppConfigured,
} from "./messaging/config";
import { sendCustomerTrackingLinkEmail } from "./messaging/customerTrackingLinkEmail";
import { qikchatApiHeaders, type QikchatSendMessageResponse } from "./messaging/qikchatApi";

type TrackingLinkPayload = {
  phone: string;
  email?: string;
  name: string;
  trackingUrl: string;
  srfReference: string;
};
type TrackingLinkSendResult = {
  /** WhatsApp template sent */
  sent: boolean;
  reason?: string;
  emailSent: boolean;
  emailReason?: string;
};

type ReestimateDecisionPayload = {
  srfReference: string;
  customerName: string;
  phone: string;
  decision: "accepted" | "rejected";
  note?: string;
};

export async function sendTrackingLink(payload: TrackingLinkPayload): Promise<TrackingLinkSendResult> {
  const customerName = payload.name.trim() || "Customer";
  const srfNumber = payload.srfReference.trim();
  const trackingUrl = payload.trackingUrl.trim();
  const email = payload.email?.trim();

  console.log(`[TRACKING LINK] Customer: ${customerName} | Phone: ${payload.phone}`);
  console.log(`[TRACKING LINK] SRF: ${srfNumber}`);
  console.log(`[TRACKING LINK] URL: ${trackingUrl}`);

  if (!srfNumber || !trackingUrl) {
    console.log("[TRACKING LINK] Missing SRF number or tracking URL.");
    return { sent: false, reason: "Missing SRF number or tracking URL.", emailSent: false };
  }

  let emailSent = false;
  let emailReason: string | undefined;
  if (email && isEmailConfigured()) {
    try {
      await sendCustomerTrackingLinkEmail(email, customerName, srfNumber, trackingUrl);
      emailSent = true;
    } catch (e) {
      emailReason = e instanceof Error ? e.message : "Email send failed.";
      console.error("[TRACKING LINK] Email send failed", e);
    }
  } else if (email) {
    emailReason = "SMTP is not configured.";
    console.log("[TRACKING LINK] Email on file but SMTP not configured — skipped email send.");
  } else {
    emailReason = "No customer email on file.";
  }

  if (!isWhatsAppConfigured()) {
    console.log("[TRACKING LINK] WhatsApp not configured. Skipping template send.");
    return { sent: false, reason: "WhatsApp not configured.", emailSent, emailReason };
  }

  const cfg = getMessagingConfig().whatsapp;
  const templateName = process.env.QIKCHAT_TRACKING_TEMPLATE_NAME?.trim() || "customer_link";
  const language = cfg.templateLanguage?.trim() || "en";

  let toContact = "";
  try {
    toContact = formatIndiaMobileE164(payload.phone);
  } catch {
    console.log("[TRACKING LINK] Invalid phone number. Skipping WhatsApp send.");
    return { sent: false, reason: "Invalid mobile number.", emailSent, emailReason };
  }

  const body = {
    to_contact: toContact,
    type: "template",
    template: {
      name: templateName,
      language,
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: customerName },
            { type: "text", text: srfNumber },
            { type: "text", text: trackingUrl },
          ],
        },
      ],
    },
  };

  const res = await fetch(getQikchatMessagesUrl(), {
    method: "POST",
    headers: qikchatApiHeaders(cfg.apiKey),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("[TRACKING LINK] WhatsApp send failed", res.status, text.slice(0, 320));
    return { sent: false, reason: `WhatsApp send failed (${res.status}).`, emailSent, emailReason };
  }
  try {
    const json = JSON.parse(text) as QikchatSendMessageResponse;
    const messageId = json.data?.[0]?.id ?? "—";
    console.log(`[TRACKING LINK] WhatsApp template sent | template=${templateName} | id=${messageId}`);
    return { sent: true, emailSent, emailReason };
  } catch {
    console.log("[TRACKING LINK] WhatsApp sent; non-JSON response.");
    return { sent: true, emailSent, emailReason };
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
