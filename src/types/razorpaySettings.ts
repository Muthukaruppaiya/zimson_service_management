export type RazorpaySettings = {
  enabled: boolean;
  keyId: string;
  hasKeySecret: boolean;
  hasWebhookSecret: boolean;
  configured: boolean;
  envFallbackActive: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

export type RazorpayPublicConfig = {
  enabled: boolean;
  keyId: string;
};

export type RazorpayCheckoutResult = {
  orderId: string;
  paymentId: string;
  signature: string;
};
