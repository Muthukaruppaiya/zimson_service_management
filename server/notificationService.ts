import {
  formatIndiaMobileE164,
  getMessagingConfig,
  isEmailConfigured,
  isSmsConfigured,
  isWhatsAppConfigured,
} from "./messaging/config";
import { sendCustomerTrackingLinkEmail } from "./messaging/customerTrackingLinkEmail";
import { sendTrackingFallbackSms } from "./messaging/qikberrySms";
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
  documentPdf?: Buffer;
  /** 6-digit pin for OTP SMS fallback when WhatsApp fails. */
  smsPin?: string;
  /** Default: send both channels when configured. */
  channels?: { whatsapp?: boolean; email?: boolean };
};
type TrackingLinkSendResult = {
  /** WhatsApp template sent */
  sent: boolean;
  reason?: string;
  emailSent: boolean;
  emailReason?: string;
  smsSent: boolean;
  smsReason?: string;
  smsPin?: string;
};

type ReestimateDecisionPayload = {
  srfReference: string;
  customerName: string;
  phone: string;
  decision: "accepted" | "rejected";
  note?: string;
};

async function sendTrackingWhatsApp(payload: {
  phone: string;
  customerName: string;
  srfNumber: string;
  trackingUrl: string;
  documentUrl?: string;
  documentFilename?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!isWhatsAppConfigured()) {
    return { sent: false, reason: "WhatsApp not configured." };
  }

  let phone10 = "";
  try {
    phone10 = formatIndiaMobileE164(payload.phone).replace(/\D/g, "").slice(-10);
  } catch {
    return { sent: false, reason: "Invalid mobile number." };
  }

  const documentUrl = payload.documentUrl?.trim();
  if (!documentUrl) {
    try {
      const messageId = await sendTrackingLinkWhatsAppBodyOnly({
        phone10,
        customerName: payload.customerName,
        srfNumber: payload.srfNumber,
        trackingUrl: payload.trackingUrl,
      });
      console.log(`[TRACKING LINK] WhatsApp (no PDF) sent | id=${messageId ?? "—"}`);
      return { sent: true };
    } catch (e) {
      const reason = e instanceof Error ? e.message : "WhatsApp send failed (no PDF).";
      console.error("[TRACKING LINK] WhatsApp body-only send failed", e);
      return { sent: false, reason };
    }
  }

  const templateName = getMessagingConfig().whatsapp.trackingTemplateName;
  try {
    const messageId = await sendTrackingLinkWhatsAppTemplate({
      phone10,
      customerName: payload.customerName,
      srfNumber: payload.srfNumber,
      trackingUrl: payload.trackingUrl,
      documentUrl,
      documentFilename: payload.documentFilename,
    });
    console.log(`[TRACKING LINK] WhatsApp template sent | template=${templateName} | id=${messageId ?? "—"}`);
    return { sent: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "WhatsApp send failed.";
    console.error("[TRACKING LINK] WhatsApp send failed", e);
    try {
      const messageId = await sendTrackingLinkWhatsAppBodyOnly({
        phone10,
        customerName: payload.customerName,
        srfNumber: payload.srfNumber,
        trackingUrl: payload.trackingUrl,
      });
      console.log(`[TRACKING LINK] WhatsApp fallback (body only) sent | id=${messageId ?? "—"}`);
      return { sent: true };
    } catch (fallbackErr) {
      console.error("[TRACKING LINK] WhatsApp body-only fallback failed", fallbackErr);
      return { sent: false, reason };
    }
  }
}

export async function sendTrackingLink(payload: TrackingLinkPayload): Promise<TrackingLinkSendResult> {
  const customerName = payload.name.trim() || "Customer";
  const srfNumber = payload.srfReference.trim();
  const trackingUrl = payload.trackingUrl.trim();
  const email = payload.email?.trim();
  const documentUrl = payload.documentUrl?.trim();
  const documentFilename = payload.documentFilename?.trim();
  const smsPin = String(payload.smsPin ?? "").trim();

  console.log(`[TRACKING LINK] Customer: ${customerName} | Phone: ${payload.phone}`);
  console.log(`[TRACKING LINK] SRF: ${srfNumber}`);
  console.log(`[TRACKING LINK] URL: ${trackingUrl}`);
  if (documentUrl) console.log(`[TRACKING LINK] SRF document: ${documentUrl}`);

  if (!srfNumber || !trackingUrl) {
    console.log("[TRACKING LINK] Missing SRF number or tracking URL.");
    return {
      sent: false,
      reason: "Missing SRF number or tracking URL.",
      emailSent: false,
      smsSent: false,
    };
  }

  const sendEmail = payload.channels?.email !== false;
  const sendWhatsapp = payload.channels?.whatsapp !== false;

  let emailSent = false;
  let emailReason: string | undefined;
  if (!sendEmail) {
    emailReason = "Skipped.";
  } else if (!email) {
    emailReason = "Customer email is required.";
  } else if (!isEmailConfigured()) {
    emailReason = "SMTP is not configured.";
    console.log("[TRACKING LINK] Email on file but SMTP not configured — skipped email send.");
  } else {
    try {
      await sendCustomerTrackingLinkEmail(email, customerName, srfNumber, trackingUrl, {
        pdfBuffer: payload.documentPdf,
        documentFilename,
      });
      emailSent = true;
    } catch (e) {
      emailReason = e instanceof Error ? e.message : "Email send failed.";
      console.error("[TRACKING LINK] Email send failed", e);
    }
  }

  let wa: { sent: boolean; reason?: string } = { sent: false, reason: "Skipped." };
  if (sendWhatsapp) {
    wa = await sendTrackingWhatsApp({
      phone: payload.phone,
      customerName,
      srfNumber,
      trackingUrl,
      documentUrl,
      documentFilename,
    });
  }

  let smsSent = false;
  let smsReason: string | undefined;
  if (sendWhatsapp && !wa.sent) {
    if (!isSmsConfigured()) {
      smsReason = "WhatsApp failed and SMS is not configured.";
    } else if (!/^\d{4,10}$/.test(smsPin)) {
      smsReason = "WhatsApp failed and no SMS tracking code was available.";
    } else {
      try {
        await sendTrackingFallbackSms(payload.phone, { srf: srfNumber, otp: smsPin });
        smsSent = true;
        console.log(`[TRACKING LINK] SMS fallback sent | pin=${smsPin} | srf=${srfNumber}`);
      } catch (e) {
        smsReason = e instanceof Error ? e.message : "SMS fallback failed.";
        console.error("[TRACKING LINK] SMS fallback failed", e);
      }
    }
  }

  return {
    sent: wa.sent,
    reason: sendWhatsapp ? wa.reason : "Skipped.",
    emailSent,
    emailReason,
    smsSent,
    smsReason,
    smsPin: smsSent ? smsPin : undefined,
  };
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
  trackingUrl: string;
  approvalReason: string;
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
