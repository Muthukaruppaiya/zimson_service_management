import type { SendInvoiceWhatsAppResult } from "./sendInvoiceWhatsApp";

export function invoiceWhatsAppResultMessage(result: SendInvoiceWhatsAppResult): string {
  if (result.dryRun) {
    const link = result.localViewUrl ? ` — open ${result.localViewUrl}` : "";
    return `Test mode: PDF saved on API server${link}. Set WHATSAPP_INVOICE_DRY_RUN=false to send real WhatsApp.`;
  }
  return "Invoice sent on WhatsApp successfully.";
}

export function phoneLast10Digits(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export function isValidIndianMobile10(phone: string): boolean {
  return phoneLast10Digits(phone).length === 10;
}
