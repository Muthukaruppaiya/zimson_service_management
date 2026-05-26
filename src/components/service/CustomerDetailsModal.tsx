import { useEffect, useState, type ReactNode } from "react";
import { apiJson } from "../../lib/api";
import { formatCustomerAddressLines } from "../../lib/customerAddress";
import type { CustomerRecord } from "../../types/customer";

type CustomerDetailsModalProps = {
  customerId: string | null;
  open: boolean;
  onClose: () => void;
  /** Seed record when API fetch is unavailable (local demo). */
  fallback?: CustomerRecord | null;
};

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-0.5 border-b border-rlx-rule/60 py-2 sm:grid-cols-[minmax(7.5rem,34%)_1fr]">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rlx-ink-muted">{label}</dt>
      <dd className="min-w-0 text-[11px] leading-relaxed text-rlx-ink">{value ?? "—"}</dd>
    </div>
  );
}

function formatDateLabel(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function CustomerDetailsModal({ customerId, open, onClose, fallback }: CustomerDetailsModalProps) {
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !customerId) {
      setCustomer(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void apiJson<{ customer: CustomerRecord | null }>(`/api/customers?id=${encodeURIComponent(customerId)}`)
      .then((data) => {
        if (cancelled) return;
        if (data.customer) {
          setCustomer(data.customer);
        } else if (fallback?.id === customerId) {
          setCustomer(fallback);
        } else {
          setError("Customer record could not be loaded.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (fallback?.id === customerId) {
            setCustomer(fallback);
          } else {
            setError("Could not load customer details.");
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, customerId, fallback]);

  if (!open) return null;

  const c = customer;
  const billing = c?.billingAddress ? formatCustomerAddressLines(c.billingAddress) : c?.address || "—";
  const shipping = c?.shippingAddress ? formatCustomerAddressLines(c.shippingAddress) : "—";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-rlx-ink/60 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-details-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90vh,42rem)] w-full max-w-lg flex-col border border-rlx-rule bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-rlx-rule bg-rlx-green px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">Customer profile</p>
              <h2 id="customer-details-title" className="mt-1 font-display text-lg font-light text-white">
                {loading && !c ? "Loading…" : c?.displayName ?? "Customer details"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 border border-white/30 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/20"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading && !c ? (
            <p className="py-6 text-center text-xs text-rlx-ink-muted">Loading customer details…</p>
          ) : error && !c ? (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>
          ) : c ? (
            <dl>
              <DetailRow label="Customer code" value={<span className="font-mono">{c.customerCode || "—"}</span>} />
              <DetailRow label="Display name" value={c.displayName} />
              <DetailRow
                label="Type"
                value={
                  c.customerKind === "B2B"
                    ? `B2B${c.company ? ` · ${c.company}` : ""}`
                    : "B2C"
                }
              />
              {c.customerKind === "B2B" ? (
                <>
                  <DetailRow label="GSTIN" value={<span className="font-mono uppercase">{c.gst || "—"}</span>} />
                  <DetailRow label="PAN" value={<span className="font-mono uppercase">{c.pan || "—"}</span>} />
                  <DetailRow label="Trade name" value={c.b2bTradeDisplayName || "—"} />
                </>
              ) : (
                <>
                  <DetailRow
                    label="Name"
                    value={[c.salutation, c.firstName, c.lastName].filter(Boolean).join(" ") || c.displayName}
                  />
                  <DetailRow label="PAN" value={<span className="font-mono uppercase">{c.pan || "—"}</span>} />
                </>
              )}
              <DetailRow label="Primary mobile" value={c.phone} />
              <DetailRow label="Alternate mobile" value={c.alternatePhone || "—"} />
              <DetailRow label="Telephone" value={c.telephone || "—"} />
              <DetailRow label="Email" value={c.email || "—"} />
              <DetailRow label="Date of birth" value={formatDateLabel(c.dob)} />
              <DetailRow label="Anniversary" value={formatDateLabel(c.anniversaryDate)} />
              <DetailRow label="City" value={c.city || "—"} />
              <DetailRow label="Billing address" value={billing || "—"} />
              <DetailRow label="Shipping address" value={shipping || "—"} />
              {c.referenceName ? <DetailRow label="Reference" value={c.referenceName} /> : null}
              {c.representativeName ? <DetailRow label="Representative" value={c.representativeName} /> : null}
              {c.remarkAttention ? <DetailRow label="Remarks" value={c.remarkAttention} /> : null}
              <DetailRow
                label="Verification"
                value={
                  c.phoneVerifiedAt && c.emailVerifiedAt
                    ? "Mobile & email verified"
                    : c.customerDataSource === "migrated"
                      ? "Pending verification"
                      : "—"
                }
              />
              <DetailRow label="Registered" value={formatDateLabel(c.createdAt)} />
            </dl>
          ) : null}
        </div>
      </div>
    </div>
  );
}
