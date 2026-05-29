import { apiJson } from "./api";

export type ResendSrfTrackingWhatsAppResult = {
  trackingUrl?: string;
  whatsappSent: boolean;
  whatsappReason: string | null;
  emailSent: boolean;
  emailReason: string | null;
};

export async function resendSrfTrackingWhatsApp(
  srfId: string,
  customerEmail?: string | null,
): Promise<ResendSrfTrackingWhatsAppResult> {
  const out = await apiJson<{
    trackingUrl?: string;
    whatsappSent?: boolean;
    whatsappReason?: string | null;
    emailSent?: boolean;
    emailReason?: string | null;
  }>(`/api/service/srf-jobs/${encodeURIComponent(srfId)}/resend-tracking-whatsapp`, {
    method: "POST",
    json: customerEmail?.trim() ? { customerEmail: customerEmail.trim() } : undefined,
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
