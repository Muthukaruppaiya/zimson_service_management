import { apiJson } from "./api";

export type ResendSrfTrackingWhatsAppResult = {
  trackingUrl?: string;
  whatsappSent: boolean;
  whatsappReason: string | null;
  emailSent: boolean;
  emailReason: string | null;
};

export type SrfTrackingResendChannel = "all" | "whatsapp" | "email";

export async function resendSrfTrackingWhatsApp(
  srfId: string,
  customerEmail?: string | null,
  channel: SrfTrackingResendChannel = "all",
): Promise<ResendSrfTrackingWhatsAppResult> {
  const body: { customerEmail?: string; channel?: SrfTrackingResendChannel } = { channel };
  if (customerEmail?.trim()) body.customerEmail = customerEmail.trim();
  const out = await apiJson<{
    trackingUrl?: string;
    whatsappSent?: boolean;
    whatsappReason?: string | null;
    emailSent?: boolean;
    emailReason?: string | null;
  }>(`/api/service/srf-jobs/${encodeURIComponent(srfId)}/resend-tracking-whatsapp`, {
    method: "POST",
    json: body,
  });
  return {
    trackingUrl: out.trackingUrl,
    whatsappSent: Boolean(out.whatsappSent),
    whatsappReason: out.whatsappReason ?? null,
    emailSent: Boolean(out.emailSent),
    emailReason: out.emailReason ?? null,
  };
}

/** Finalized / in-progress SRFs can receive tracking link WhatsApp resend. */
export function canResendSrfTrackingWhatsApp(status: string): boolean {
  return status !== "draft" && status !== "photo_pending" && status !== "cancelled";
}

export function srfTrackingCustomerNotifyMessage(result: ResendSrfTrackingWhatsAppResult): string {
  const parts: string[] = [];
  if (result.emailSent) parts.push("Email sent (SRF tracking link).");
  else if (result.emailReason) parts.push(`Email: ${result.emailReason}`);
  if (result.whatsappSent) parts.push("WhatsApp sent.");
  else if (result.whatsappReason) parts.push(`WhatsApp: ${result.whatsappReason}`);
  if (parts.length === 0) return "Could not send tracking link to customer.";
  return parts.join(" ");
}

/** @deprecated use srfTrackingCustomerNotifyMessage */
export function srfTrackingWhatsAppResultMessage(result: ResendSrfTrackingWhatsAppResult): string {
  return srfTrackingCustomerNotifyMessage(result);
}
