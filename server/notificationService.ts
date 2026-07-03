import {
  formatIndiaMobileE164,
  getMessagingConfig,
  isEmailConfigured,
  isWhatsAppConfigured,
} from "./messaging/config";
import { sendCustomerTrackingLinkEmail } from "./messaging/customerTrackingLinkEmail";
import {
  sendSiteVisitApprovalWhatsAppTemplate,
  sendTrackingLinkWhatsAppBodyOnly,
  sendTrackingLinkWhatsAppTemplate,
} from "./messaging/qikchatWhatsApp";

type TrackingLinkPayload = {
  phone: string;
  email?: string;
  name: string;
  trackingUrl: string;
  srfReference: string;
  /** Public HTTPS URL to SRF acknowledgment PDF (required for WhatsApp template document header). */
  documentUrl?: string;
  documentFilename?: string;
  /** Default: send both channels when configured. */
  channels?: { whatsapp?: boolean; email?: boolean };
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
  const documentUrl = payload.documentUrl?.trim();
  const documentFilename = payload.documentFilename?.trim();

  console.log(`[TRACKING LINK] Customer: ${customerName} | Phone: ${payload.phone}`);
  console.log(`[TRACKING LINK] SRF: ${srfNumber}`);
  console.log(`[TRACKING LINK] URL: ${trackingUrl}`);
  if (documentUrl) console.log(`[TRACKING LINK] SRF document: ${documentUrl}`);

  if (!srfNumber || !trackingUrl) {
    console.log("[TRACKING LINK] Missing SRF number or tracking URL.");
    return { sent: false, reason: "Missing SRF number or tracking URL.", emailSent: false };
  }

  const sendEmail = payload.channels?.email !== false;
  const sendWhatsapp = payload.channels?.whatsapp !== false;

  let emailSent = false;
  let emailReason: string | undefined;
  if (!sendEmail) {
    emailReason = "Skipped.";
  } else if (email && isEmailConfigured()) {
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

  if (!sendWhatsapp) {
    return { sent: false, reason: "Skipped.", emailSent, emailReason };
  }

  if (!isWhatsAppConfigured()) {
    console.log("[TRACKING LINK] WhatsApp not configured. Skipping template send.");
    return { sent: false, reason: "WhatsApp not configured.", emailSent, emailReason };
  }

  if (!documentUrl) {
    console.log("[TRACKING LINK] SRF document URL missing — trying body-only WhatsApp template.");
    let phone10 = "";
    try {
      phone10 = formatIndiaMobileE164(payload.phone).replace(/\D/g, "").slice(-10);
    } catch {
      return { sent: false, reason: "Invalid mobile number.", emailSent, emailReason };
    }
    try {
      const messageId = await sendTrackingLinkWhatsAppBodyOnly({
        phone10,
        customerName,
        srfNumber,
        trackingUrl,
      });
      console.log(`[TRACKING LINK] WhatsApp (no PDF) sent | id=${messageId ?? "—"}`);
      return { sent: true, emailSent, emailReason };
    } catch (e) {
      const reason = e instanceof Error ? e.message : "WhatsApp send failed (no PDF).";
      console.error("[TRACKING LINK] WhatsApp body-only send failed", e);
      return { sent: false, reason, emailSent, emailReason };
    }
  }

  let phone10 = "";
  try {
    phone10 = formatIndiaMobileE164(payload.phone).replace(/\D/g, "").slice(-10);
  } catch {
    console.log("[TRACKING LINK] Invalid phone number. Skipping WhatsApp send.");
    return { sent: false, reason: "Invalid mobile number.", emailSent, emailReason };
  }

  const templateName = getMessagingConfig().whatsapp.trackingTemplateName;

  try {
    const messageId = await sendTrackingLinkWhatsAppTemplate({
      phone10,
      customerName,
      srfNumber,
      trackingUrl,
      documentUrl,
      documentFilename,
    });
    console.log(`[TRACKING LINK] WhatsApp template sent | template=${templateName} | id=${messageId ?? "—"}`);
    return { sent: true, emailSent, emailReason };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "WhatsApp send failed.";
    console.error("[TRACKING LINK] WhatsApp send failed", e);
    try {
      const messageId = await sendTrackingLinkWhatsAppBodyOnly({
        phone10,
        customerName,
        srfNumber,
        trackingUrl,
      });
      console.log(`[TRACKING LINK] WhatsApp fallback (body only) sent | id=${messageId ?? "—"}`);
      return { sent: true, emailSent, emailReason };
    } catch (fallbackErr) {
      console.error("[TRACKING LINK] WhatsApp body-only fallback failed", fallbackErr);
      return { sent: false, reason, emailSent, emailReason };
    }
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

type SiteVisitApprovalPayload = {
  phone: string;
  name: string;
  srfReference: string;
  approvalReason: string;
  trackingUrl: string;
  documentUrl?: string;
  documentFilename?: string;
};

type SiteVisitApprovalSendResult = {
  sent: boolean;
  reason?: string;
};

export async function sendSiteVisitApprovalLink(
  payload: SiteVisitApprovalPayload,
): Promise<SiteVisitApprovalSendResult> {
  const customerName = payload.name.trim() || "Customer";
  const srfNumber = payload.srfReference.trim();
  const approvalReason = payload.approvalReason.trim();
  const trackingUrl = payload.trackingUrl.trim();

  console.log(`[APPROVAL LINK] Customer: ${customerName} | Phone: ${payload.phone}`);
  console.log(`[APPROVAL LINK] SRF: ${srfNumber}`);
  console.log(`[APPROVAL LINK] Reason: ${approvalReason.slice(0, 120)}`);
  console.log(`[APPROVAL LINK] URL: ${trackingUrl}`);

  if (!srfNumber || !trackingUrl || !approvalReason) {
    return { sent: false, reason: "Missing SRF number, reason, or tracking URL." };
  }

  if (!isWhatsAppConfigured()) {
    console.log("[APPROVAL LINK] WhatsApp not configured. Skipping template send.");
    return { sent: false, reason: "WhatsApp not configured." };
  }

  let phone10 = "";
  try {
    phone10 = formatIndiaMobileE164(payload.phone).replace(/\D/g, "").slice(-10);
  } catch {
    return { sent: false, reason: "Invalid mobile number." };
  }

  const templateName = getMessagingConfig().whatsapp.approvalTemplateName;

  try {
    const messageId = await sendSiteVisitApprovalWhatsAppTemplate({
      phone10,
      customerName,
      srfNumber,
      approvalReason,
      trackingUrl,
      documentUrl: payload.documentUrl,
      documentFilename: payload.documentFilename,
    });
    console.log(`[APPROVAL LINK] WhatsApp template sent | template=${templateName} | id=${messageId ?? "—"}`);
    return { sent: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "WhatsApp send failed.";
    console.error("[APPROVAL LINK] WhatsApp send failed", e);
    return { sent: false, reason };
  }
}
