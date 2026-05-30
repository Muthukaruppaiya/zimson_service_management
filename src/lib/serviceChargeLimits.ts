/** Max service / repair charge (INR) for store and non-admin roles. Administrators have no cap. */
export const STORE_SERVICE_CHARGE_MAX_INR = 5000;

export function isUnlimitedServiceChargeRole(role: string | undefined | null): boolean {
  return role === "admin" || role === "super_admin";
}

/** Quick bill only — service/repair charge and manual charge lines. SRF estimates are not capped. */
export function validateQuickBillServiceChargeInr(
  amountInr: number,
  role: string | undefined | null,
): string | null {
  return validateStoreServiceAmountInr(amountInr, role);
}

export function validateStoreServiceAmountInr(
  amountInr: number,
  role: string | undefined | null,
): string | null {
  if (!Number.isFinite(amountInr) || amountInr <= 0) return null;
  if (isUnlimitedServiceChargeRole(role)) return null;
  if (amountInr > STORE_SERVICE_CHARGE_MAX_INR) {
    return `Amount cannot exceed ₹${STORE_SERVICE_CHARGE_MAX_INR.toLocaleString("en-IN")}. Contact an administrator for higher charges.`;
  }
  return null;
}

export function storeServiceChargeMaxLabel(role: string | undefined | null): string {
  return isUnlimitedServiceChargeRole(role)
    ? "No limit for your role"
    : `Max ₹${STORE_SERVICE_CHARGE_MAX_INR.toLocaleString("en-IN")} per charge`;
}
