/**
 * Static invoice header / footer copy until settings-driven templates are added.
 * Replace these values from org settings or API when you implement dynamic branding.
 */
export const SERVICE_INVOICE_BRANDING = {
  sellerLegalName: "Zimson Watches & Services Pvt. Ltd.",
  sellerAddressLines: [
    "Corporate / registered office address line 1",
    "City, State — PIN (placeholder)",
  ] as string[],
  sellerGstin: "33AAACZ0566D1ZN",
  sellerPhone: "+91-0000-000000",
  sellerEmail: "accounts@zimson.com",
  sellerStateCode: "33",
  bankDetailsLines: [
    "Bank: — (configure in settings)",
    "A/c: — · IFSC: —",
  ] as string[],
  footerTerms: [
    "This is a computer-generated document. Signature may not be required subject to company policy.",
    "Subject to jurisdiction at Chennai, Tamil Nadu. E. & O.E.",
  ] as string[],
} as const;
