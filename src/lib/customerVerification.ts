/** Customer is verified for billing/handover when mobile OTP is completed (email optional). */
export function isFullyOtpVerified(phoneAt: string | null | undefined, _emailAt?: string | null): boolean {
  return Boolean(phoneAt?.trim());
}

export function isCustomerPhoneVerified(
  c: { phoneVerifiedAt?: string | null } | null | undefined,
): boolean {
  return isFullyOtpVerified(c?.phoneVerifiedAt);
}

/** Admin / super admin may mark a customer verified without collecting OTP. */
export function canBypassCustomerOtp(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export const UNVERIFIED_CUSTOMER_ALERT_MESSAGE =
  "This customer is not verified. Complete mobile OTP in customer registration before handover or billing.";
