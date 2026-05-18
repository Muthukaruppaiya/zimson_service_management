/** Customer is fully OTP-verified when both mobile and email OTP timestamps are set. */
export function isFullyOtpVerified(phoneAt: string | null | undefined, emailAt: string | null | undefined): boolean {
  return !!(phoneAt?.trim() && emailAt?.trim());
}

export const UNVERIFIED_CUSTOMER_ALERT_MESSAGE =
  "This customer is not verified. Complete mobile and email OTP in customer registration before handover or billing.";
