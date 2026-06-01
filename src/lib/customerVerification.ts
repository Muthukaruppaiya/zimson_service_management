/** Customer is verified for billing/handover when mobile OTP is completed (email optional). */
export function isFullyOtpVerified(phoneAt: string | null | undefined, _emailAt?: string | null): boolean {
  return Boolean(phoneAt?.trim());
}

export const UNVERIFIED_CUSTOMER_ALERT_MESSAGE =
  "This customer is not verified. Complete mobile OTP in customer registration before handover or billing.";
