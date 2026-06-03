/** Persisted at store billing close — used to reprint / resend tax invoices with labour lines. */

export type StoreBillingSnapshotLine = {
  description: string;
  amountInr: number;
  spareId?: string | null;
  hsnSac?: string | null;
};

export type StoreBillingSnapshot = {
  billLines: StoreBillingSnapshotLine[];
  serviceChargeInr?: number;
  billSubtotalInr?: number;
  collectionAmountInr?: number;
  /** Raw mode: UPI, Cash, etc. */
  collectionPaymentMode?: string | null;
  paymentDetails?: unknown;
  closedAt?: string;
};

const LABOUR_DESC_RE = /labour|service\s*\/\s*repair|service charge/i;

export function normalizeStoreBillingSnapshot(raw: unknown): StoreBillingSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const billLinesRaw = Array.isArray(o.billLines) ? o.billLines : [];
  const billLines: StoreBillingSnapshotLine[] = [];
  for (const row of billLinesRaw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const description = String(r.description ?? "").trim();
    const amountInr = Number(r.amountInr);
    if (!description || !Number.isFinite(amountInr) || amountInr <= 0) continue;
    billLines.push({
      description,
      amountInr,
      spareId: r.spareId != null ? String(r.spareId) : null,
      hsnSac: r.hsnSac != null ? String(r.hsnSac) : null,
    });
  }
  if (billLines.length === 0) return null;
  const serviceChargeInr = Number(o.serviceChargeInr);
  return {
    billLines,
    serviceChargeInr: Number.isFinite(serviceChargeInr) && serviceChargeInr > 0 ? serviceChargeInr : undefined,
    billSubtotalInr: Number.isFinite(Number(o.billSubtotalInr)) ? Number(o.billSubtotalInr) : undefined,
    collectionAmountInr: Number.isFinite(Number(o.collectionAmountInr))
      ? Number(o.collectionAmountInr)
      : undefined,
    collectionPaymentMode:
      typeof o.collectionPaymentMode === "string" ? o.collectionPaymentMode : undefined,
    paymentDetails: o.paymentDetails,
    closedAt: typeof o.closedAt === "string" ? o.closedAt : undefined,
  };
}

/** Ensures labour from serviceChargeInr is present when older snapshots omitted the line. */
export function snapshotInvoiceBillLines(snapshot: StoreBillingSnapshot): StoreBillingSnapshotLine[] {
  const lines = [...snapshot.billLines];
  const svc = Number(snapshot.serviceChargeInr ?? 0);
  const hasLabour = lines.some((l) => LABOUR_DESC_RE.test(l.description));
  if (svc > 0.02 && !hasLabour) {
    lines.push({ description: "Service / repair labour", amountInr: svc, spareId: null, hsnSac: null });
  }
  return lines;
}
