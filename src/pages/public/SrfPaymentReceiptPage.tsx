import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../../lib/api";
import { formatInr } from "../../lib/formatInr";
import { kindTitle } from "../../lib/srfPaymentReceiptDoc";
import type { SrfPaymentReceiptView } from "../../types/srfPaymentReceipt";

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SrfPaymentReceiptPage() {
  const { token, pin } = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    return {
      token: q.get("t")?.trim() ?? "",
      pin: q.get("p")?.trim() ?? "",
    };
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SrfPaymentReceiptView | null>(null);

  const query = token
    ? `t=${encodeURIComponent(token)}`
    : pin
      ? `p=${encodeURIComponent(pin)}`
      : "";

  useEffect(() => {
    if (!query) {
      setError("This receipt link is invalid.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void apiJson<{ receipt: SrfPaymentReceiptView }>(`/api/public/srf-payment-receipt?${query}`)
      .then((out) => {
        if (!cancelled) setReceipt(out.receipt);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this receipt.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const pdfHref = query ? `/api/public/srf-payment-receipt.pdf?${query}` : "";

  return (
    <div className="min-h-screen bg-[#f4efe4] text-stone-900">
      <header className="bg-[#1b3a8f] px-4 py-5 text-white print:hidden">
        <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#E8C14E]">Zimson Watch Care</p>
        <h1 className="mt-1 text-lg font-semibold">Payment receipt</h1>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6">
        {loading ? <p className="text-sm text-stone-500">Loading receipt…</p> : null}
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
        ) : null}
        {receipt ? (
          <>
            <div className="mb-4 flex flex-wrap gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg bg-[#1b3a8f] px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white"
              >
                Print
              </button>
              <a
                href={pdfHref}
                className="rounded-lg border border-[#1b3a8f] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#1b3a8f]"
              >
                Download PDF
              </a>
            </div>
            <article className="border border-[#1b3a8f] bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1b3a8f]">Zimson Watch Care</p>
                  <p className="mt-1 text-sm font-semibold">{receipt.storeName}</p>
                  {receipt.storeAddress ? (
                    <p className="whitespace-pre-line text-xs text-stone-500">{receipt.storeAddress}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-sm font-extrabold uppercase tracking-wide text-[#1b3a8f]">
                    {kindTitle(receipt.kind)}
                  </p>
                  <p className="mt-1 font-mono text-xs text-stone-600">{receipt.receiptNo}</p>
                  <p className="text-xs text-stone-500">{fmtDate(receipt.collectedAt)}</p>
                </div>
              </div>
              <div className="my-4 h-1 bg-gradient-to-r from-[#1b3a8f] via-[#c9a227] to-[#1b3a8f]" />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Received from</dt>
                  <dd className="font-semibold">{receipt.customerName}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Mobile</dt>
                  <dd className="font-semibold">{receipt.phone}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-stone-400">SRF no.</dt>
                  <dd className="font-semibold">{receipt.srfReference}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Watch</dt>
                  <dd className="font-semibold">
                    {[receipt.watchBrand, receipt.watchModel, receipt.serial].filter(Boolean).join(" · ") || "—"}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Mode</dt>
                  <dd className="font-semibold">{receipt.paymentSummary || receipt.paymentMode}</dd>
                </div>
              </dl>
              <div className="mt-4 border border-[#1b3a8f] bg-[#f7f5ee] p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#1b3a8f]">Amount received</p>
                <p className="mt-1 text-3xl font-extrabold text-[#1b3a8f]">{formatInr(receipt.amountInr)}</p>
                <p className="mt-1 text-xs italic text-stone-600">{receipt.amountInWords}</p>
              </div>
              {receipt.note ? <p className="mt-3 text-xs text-stone-500">{receipt.note}</p> : null}
              <p className="mt-3 text-xs text-stone-600">
                Total received on this SRF: <strong>{formatInr(receipt.totalPaidInr)}</strong>
                {receipt.estimateTotalInr > 0 ? ` · Estimate ${formatInr(receipt.estimateTotalInr)}` : ""}
              </p>
              <p className="mt-6 text-[10px] text-stone-400">
                This is an acknowledgement of payment received. It is not a tax invoice. GST invoice is issued at
                billing.
              </p>
            </article>
          </>
        ) : null}
      </main>
    </div>
  );
}
