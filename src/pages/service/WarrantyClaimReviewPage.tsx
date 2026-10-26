import { useCallback, useEffect, useMemo, useState } from "react";
import { AppModal } from "../../components/ui/AppModal";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useMessageAlert } from "../../hooks/useMessageAlert";
import { ApiError, apiJson } from "../../lib/api";
import {
  modalBtnDanger,
  modalBtnSecondary,
  modalBtnSuccess,
  modalFooterClass,
  modalInputClass,
  modalTextareaClass,
} from "../../lib/appModalStyles";
import { formatInr } from "../../lib/formatInr";
import { publicMediaUrl } from "../../lib/mediaUrl";
import { formatWarrantyTillDisplay } from "../../lib/serviceWarranty";
import type { WarrantyClaimStatus, WarrantyPurchaseClaim } from "../../types/warrantyClaim";
import { claimStatusChip, claimStatusLabel } from "./WarrantyClaimsPage";

function isPdf(c: WarrantyPurchaseClaim): boolean {
  return (c.invoiceFileMime ?? "").includes("pdf") || /\.pdf$/i.test(c.invoiceFilePath);
}

export function WarrantyClaimReviewPage() {
  const { user } = useAuth();
  const isReviewer = user?.role === "super_admin" || user?.role === "admin";
  const { showSuccess, showError, alertModal } = useMessageAlert();

  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<WarrantyPurchaseClaim[]>([]);
  const [tab, setTab] = useState<WarrantyClaimStatus>("PENDING");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<WarrantyPurchaseClaim | null>(null);
  const [note, setNote] = useState("");
  const [tillDate, setTillDate] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ claims: WarrantyPurchaseClaim[] }>("/api/service/warranty-claims");
      setClaims(data.claims ?? []);
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "Could not load warranty claims.");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (isReviewer) void load();
  }, [isReviewer, load]);

  const counts = useMemo(() => {
    const c = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const x of claims) c[x.status] += 1;
    return c;
  }, [claims]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return claims.filter((c) => {
      if (c.status !== tab) return false;
      if (!q) return true;
      return [c.claimNumber, c.customerName, c.phone, c.purchaseInvoiceNumber, c.watchBrand, c.watchModel, c.serial, c.storeName ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [claims, tab, query]);

  function openClaim(c: WarrantyPurchaseClaim) {
    setOpen(c);
    setNote("");
    setTillDate(c.warrantyTillDate);
  }

  async function decide(decision: "approve" | "reject") {
    if (!open) return;
    if (decision === "reject" && !note.trim()) {
      showError("Enter the reason for rejection.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiJson<{ claim: WarrantyPurchaseClaim }>(
        `/api/service/warranty-claims/${encodeURIComponent(open.id)}/${decision}`,
        { method: "POST", json: { note: note.trim(), warrantyTillDate: decision === "approve" ? tillDate : undefined } },
      );
      setClaims((prev) => prev.map((c) => (c.id === data.claim.id ? data.claim : c)));
      setOpen(null);
      showSuccess(
        decision === "approve"
          ? `${data.claim.claimNumber} approved. The store can now book it as Warranty — non chargeable.`
          : `${data.claim.claimNumber} rejected.`,
        decision === "approve" ? "Claim approved" : "Claim rejected",
      );
    } catch (e) {
      showError(e instanceof ApiError ? e.message : "Could not update claim.");
    } finally {
      setBusy(false);
    }
  }

  if (!isReviewer) {
    return (
      <div>
        <PageHeader title="Warranty claim review" description="" />
        <p className="text-sm text-stone-600">Only back office (admin) can review warranty claims.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Warranty claim review" description="" />
      {alertModal}

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(["PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTab(s)}
              className={`px-3 py-1.5 text-xs font-semibold ${
                tab === s ? "bg-rlx-green text-white" : "border border-rlx-rule bg-white text-stone-700 hover:bg-stone-50"
              }`}
            >
              {claimStatusLabel(s)} ({counts[s]})
            </button>
          ))}
          <input
            className={`${modalInputClass} ml-auto !mt-0 max-w-xs`}
            placeholder="Search claim / invoice / mobile / store…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-500">No claims.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zimson-50/80 text-xs uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-3 py-2">Claim</th>
                  <th className="px-3 py-2">Store</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Watch</th>
                  <th className="px-3 py-2">Purchase invoice</th>
                  <th className="px-3 py-2">Warranty till</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className="border-t border-zimson-100 align-top">
                    <td className="px-3 py-2">
                      <p className="font-mono font-semibold text-zimson-900">{c.claimNumber}</p>
                      <p className="text-xs text-stone-500">{new Date(c.submittedAt).toLocaleString()}</p>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <p className="font-medium text-stone-900">{c.storeName ?? "—"}</p>
                      <p className="text-stone-500">{c.submittedByName ?? ""}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-stone-900">{c.customerName}</p>
                      <p className="font-mono text-xs text-stone-500">{c.phone}</p>
                    </td>
                    <td className="px-3 py-2">
                      {c.watchBrand} {c.watchModel}
                      {c.serial ? <p className="font-mono text-xs text-stone-500">S/N {c.serial}</p> : null}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-mono font-semibold">{c.purchaseInvoiceNumber}</p>
                      <p className="text-xs text-stone-500">{formatWarrantyTillDisplay(c.purchaseDate)}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{formatWarrantyTillDisplay(c.warrantyTillDate)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openClaim(c)}
                        className="bg-rlx-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-rlx-green-deep"
                      >
                        {c.status === "PENDING" ? "Review" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AppModal
        open={Boolean(open)}
        onClose={() => (busy ? undefined : setOpen(null))}
        eyebrow="Purchase warranty claim"
        title={open?.claimNumber ?? ""}
        size="3xl"
        footer={
          open ? (
            <div className={modalFooterClass}>
              <button type="button" className={modalBtnSecondary} disabled={busy} onClick={() => setOpen(null)}>
                Close
              </button>
              {open.status === "PENDING" ? (
                <>
                  <button type="button" className={modalBtnDanger} disabled={busy} onClick={() => void decide("reject")}>
                    Reject
                  </button>
                  <button type="button" className={modalBtnSuccess} disabled={busy} onClick={() => void decide("approve")}>
                    {busy ? "Saving…" : "Approve"}
                  </button>
                </>
              ) : null}
            </div>
          ) : null
        }
      >
        {open ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-h-[18rem] border border-rlx-rule bg-stone-50">
              {isPdf(open) ? (
                <iframe title="Purchase invoice" src={publicMediaUrl(open.invoiceFilePath)} className="h-[26rem] w-full" />
              ) : (
                <img
                  src={publicMediaUrl(open.invoiceFilePath)}
                  alt="Purchase invoice"
                  className="h-[26rem] w-full object-contain"
                />
              )}
              <a
                href={publicMediaUrl(open.invoiceFilePath)}
                target="_blank"
                rel="noreferrer"
                className="block border-t border-rlx-rule bg-white px-3 py-2 text-center text-xs font-semibold text-rlx-green hover:bg-rlx-green-light"
              >
                Open invoice in new tab
              </a>
            </div>
            <div className="space-y-3 text-sm">
              <span className={`inline-block px-2 py-0.5 text-[11px] font-bold ${claimStatusChip(open.status)}`}>
                {claimStatusLabel(open.status)}
              </span>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-stone-500">Customer</dt>
                <dd className="font-medium text-stone-900">{open.customerName} · <span className="font-mono">{open.phone}</span></dd>
                <dt className="text-stone-500">Watch</dt>
                <dd className="font-medium text-stone-900">
                  {open.watchBrand} {open.watchModel}
                  {open.serial ? <span className="font-mono text-xs"> · S/N {open.serial}</span> : null}
                </dd>
                <dt className="text-stone-500">Invoice no.</dt>
                <dd className="font-mono font-semibold text-stone-900">{open.purchaseInvoiceNumber}</dd>
                <dt className="text-stone-500">Invoice date</dt>
                <dd className="text-stone-900">{formatWarrantyTillDisplay(open.purchaseDate)}</dd>
                <dt className="text-stone-500">Purchased from</dt>
                <dd className="text-stone-900">{open.purchasedFrom || "—"}</dd>
                <dt className="text-stone-500">Amount</dt>
                <dd className="text-stone-900">{open.purchaseAmountInr != null ? formatInr(open.purchaseAmountInr) : "—"}</dd>
                <dt className="text-stone-500">Warranty</dt>
                <dd className="text-stone-900">{open.warrantyMonths} months</dd>
                <dt className="text-stone-500">Submitted by</dt>
                <dd className="text-stone-900">
                  {open.submittedByName ?? "—"}
                  {open.storeName ? ` · ${open.storeName}` : ""}
                </dd>
                {open.remarks ? (
                  <>
                    <dt className="text-stone-500">Remarks</dt>
                    <dd className="text-stone-900">{open.remarks}</dd>
                  </>
                ) : null}
                {open.status !== "PENDING" ? (
                  <>
                    <dt className="text-stone-500">Reviewed</dt>
                    <dd className="text-stone-900">
                      {open.reviewedByName ?? "—"}
                      {open.reviewedAt ? ` · ${new Date(open.reviewedAt).toLocaleString()}` : ""}
                    </dd>
                    {open.reviewNote ? (
                      <>
                        <dt className="text-stone-500">Note</dt>
                        <dd className="text-stone-900">{open.reviewNote}</dd>
                      </>
                    ) : null}
                  </>
                ) : null}
              </dl>

              {open.status === "PENDING" ? (
                <div className="space-y-3 border-t border-rlx-rule pt-3">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-stone-600">Warranty till</span>
                    <input
                      type="date"
                      className={modalInputClass}
                      value={tillDate}
                      onChange={(e) => setTillDate(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-stone-600">
                      Note (required to reject)
                    </span>
                    <textarea
                      className={modalTextareaClass}
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                </div>
              ) : (
                <p className="border-t border-rlx-rule pt-3 font-medium text-stone-900">
                  Warranty till {formatWarrantyTillDisplay(open.warrantyTillDate)}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </AppModal>
    </div>
  );
}
