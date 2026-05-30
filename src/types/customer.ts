export type CustomerKind = "B2C" | "B2B";

/** Structured address (billing / shipping). */
export type CustomerAddressBlock = {
  addressLine1: string;
  addressLine2: string;
  /** @deprecated Legacy JSON — mirrored from addressLine1 when saving */
  doorNo?: string;
  /** @deprecated Legacy JSON — mirrored from addressLine2 when saving */
  street?: string;
  city: string;
  district: string;
  state: string;
  countryId: string;
  /** Postal / PIN code (typed by user; country/state/district use dropdowns where configured). */
  pincode: string;
};

export type TaxPreference = "with_tax" | "without_tax_exhibited";

export type CustomerDataSource = "registered" | "migrated";

export type CustomerRecord = {
  id: string;
  /** Auto-generated business key, e.g. CUST26001001 */
  customerCode?: string | null;
  displayName: string;
  salutation?: string;
  firstName?: string;
  lastName?: string;
  phone: string;
  /** Separate number where SMS OTP is received (optional; defaults to primary mobile). */
  otpPhone?: string | null;
  alternatePhone?: string;
  telephone?: string | null;
  email: string;
  dob?: string | null;
  anniversaryDate?: string | null;
  address?: string;
  city?: string;
  billingAddress?: CustomerAddressBlock;
  shippingAddress?: CustomerAddressBlock;
  /** Extra saved addresses (e.g. branches). Billing + shipping remain primary. */
  additionalAddresses?: CustomerAddressBlock[];
  customerKind: CustomerKind;
  company?: string;
  gst?: string;
  pan?: string;
  taxPreference?: TaxPreference | null;
  b2bTradeDisplayName?: string | null;
  remarkAttention?: string | null;
  referenceName?: string | null;
  representativeName?: string | null;
  phoneVerifiedAt?: string | null;
  emailVerifiedAt?: string | null;
  customerDataSource?: CustomerDataSource;
  createdAt: string;
  isSeed?: boolean;
};

/** Full payload for API customer registration (after OTP session). */
export type CustomerRegistrationPayload = {
  sessionId: string;
  mobileOtp: string;
  emailOtp?: string;
  customerKind: CustomerKind;
  salutation?: string;
  firstName?: string;
  lastName?: string;
  phone: string;
  otpPhone: string;
  alternatePhone?: string;
  telephone?: string;
  email?: string;
  dob?: string;
  anniversaryDate?: string;
  billingAddress: CustomerAddressBlock;
  shippingAddress: CustomerAddressBlock;
  /** Optional extra addresses stored as JSON array on the customer. */
  additionalAddresses?: CustomerAddressBlock[];
  sameShippingAsBilling: boolean;
  b2bTradeDisplayName?: string;
  taxPreference?: TaxPreference;
  company?: string;
  gst?: string;
  pan?: string;
  remarkAttention?: string;
  referenceName?: string;
  representativeName?: string;
};
