/**
 * Must stay in sync with `src/lib/inventoryFeatureFlags.ts`.
 * Set to `true` to restore store PR → PO → GRN → transfer-against-PR.
 */
export const ENABLE_PR_FLOW = false;

export const PR_FLOW_HELD_MESSAGE =
  "Purchase request flow is temporarily on hold. Create a PO directly, post GRN at HO, then transfer stock from HO to the store.";

export function rejectIfPrFlowHeld(res: { status: (code: number) => { json: (body: unknown) => void } }): boolean {
  if (ENABLE_PR_FLOW) return false;
  res.status(403).json({ error: PR_FLOW_HELD_MESSAGE });
  return true;
}
