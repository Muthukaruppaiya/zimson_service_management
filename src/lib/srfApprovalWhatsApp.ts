import { apiJson } from "./api";

export type SrfApprovalWhatsAppResult = {
  whatsappSent: boolean;
  whatsappReason: string | null;
};

export type SrfReestimateNotifyResult = SrfApprovalWhatsAppResult;

export async function resendSrfApprovalWhatsApp(srfId: string): Promise<SrfApprovalWhatsAppResult> {
  const out = await apiJson<{ whatsappSent?: boolean; whatsappReason?: string | null }>(
    `/api/service/srf-jobs/${encodeURIComponent(srfId)}/resend-approval-whatsapp`,
    { method: "POST", json: {} },
  );
  return {
    whatsappSent: Boolean(out.whatsappSent),
    whatsappReason: out.whatsappReason ?? null,
  };
}

/** Pending re-estimate awaiting customer approve/reject on tracking page. */
export function canResendSrfApprovalWhatsApp(status: string, customerReestimateResponse?: string | null): boolean {
  return status === "reestimate_required" && !customerReestimateResponse;
}

export function srfApprovalWhatsAppMessage(result: SrfApprovalWhatsAppResult): string {
  if (result.whatsappSent) return "Re-estimate approval WhatsApp sent (site_visit_approval).";
  if (result.whatsappReason) return `WhatsApp: ${result.whatsappReason}`;
  return "Re-estimate approval WhatsApp was not sent.";
}

export function srfReestimateNotifyMessage(
  baseMessage: string,
  notify?: SrfReestimateNotifyResult | null,
): string {
  if (!notify) return baseMessage;
  const wa = srfApprovalWhatsAppMessage(notify);
  if (notify.whatsappSent) return `${baseMessage} ${wa}`;
  return `${baseMessage} ${wa}`;
}
