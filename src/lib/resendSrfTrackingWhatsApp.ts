import { apiJson } from "./api";

export type ResendSrfTrackingWhatsAppResult = {
  trackingUrl?: string;
  whatsappSent: boolean;
  whatsappReason: string | null;
};

export async function resendSrfTrackingWhatsApp(srfId: string): Promise<ResendSrfTrackingWhatsAppResult> {
  const out = await apiJson<{
    trackingUrl?: string;
    whatsappSent?: boolean;
    whatsappReason?: string | null;
  }>(`/api/service/srf-jobs/${encodeURIComponent(srfId)}/resend-tracking-whatsapp`, {
    method: "POST",
  });
  return {
    trackingUrl: out.trackingUrl,
    whatsappSent: Boolean(out.whatsappSent),
    whatsappReason: out.whatsappReason ?? null,
  };
}

/** Finalized / in-progress SRFs can receive tracking link WhatsApp resend. */
export function canResendSrfTrackingWhatsApp(status: string): boolean {
  return status !== "draft" && status !== "photo_pending" && status !== "cancelled";
}

export function srfTrackingWhatsAppResultMessage(result: ResendSrfTrackingWhatsAppResult): string {
  if (result.whatsappSent) return "Tracking link sent on WhatsApp.";
  return result.whatsappReason?.trim() || "Tracking WhatsApp was not sent.";
}
