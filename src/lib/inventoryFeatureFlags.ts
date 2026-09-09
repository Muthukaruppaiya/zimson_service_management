/**
 * Temporary hold on store purchase-request flow.
 * Set to `true` to restore: store PR → HO approval → PO from PR → GRN → transfer against PR.
 * While `false`: HO Purchase creates PO first, posts GRN to HO stock, then transfers to store.
 */
export const ENABLE_PR_FLOW = false;
