import { customerPayableInr } from "../../lib/quickBillPayable";
import { TCS_DEPOSIT_NOTE, TCS_RATE_WITHOUT_PAN_PERCENT, tcsInvoiceLabel } from "../../lib/tcs";
import { formatInr } from "../../lib/formatInr";
import type { computeServiceBillGst } from "../../lib/serviceBillGst";

export function GstSummaryBlock({
  taxPreview,
  pricesTaxInclusive,
  billSubtotalInr,
  advanceInr,
  standardTotalInr,
  extraChargesInr = 0,
}: {
  taxPreview: NonNullable<ReturnType<typeof computeServiceBillGst>>;
  pricesTaxInclusive: boolean;
  billSubtotalInr: number;
  advanceInr: number;
  standardTotalInr: number;
  extraChargesInr?: number;
}) {
  const extra = Number.isFinite(extraChargesInr) && extraChargesInr > 0 ? Math.round(extraChargesInr * 100) / 100 : 0;
  const payable = customerPayableInr(
    billSubtotalInr,
    taxPreview.totalTax,
    pricesTaxInclusive,
    taxPreview.grossTaxable,
    taxPreview.tcsAmount ?? 0,
  );
  const invoiceTotal = Math.round((payable + extra) * 100) / 100;
  const roundOffInr = taxPreview.roundOffInr ?? 0;
  const afterAdvance = Math.max(invoiceTotal - advanceInr, 0);
  const tcsAmt = taxPreview.tcsAmount ?? 0;
  return (
    <div className="space-y-2.5 rounded-lg border border-stone-200 bg-stone-50/80 px-4 py-4 text-base text-stone-800">
      {!pricesTaxInclusive && taxPreview.totalTax > 0 ? (
        <p className="leading-snug">
          Subtotal (excl. GST): <strong className="text-lg text-zimson-900">{formatInr(billSubtotalInr)}</strong>
        </p>
      ) : null}
      {tcsAmt > 0 ? (
        <p className="leading-snug text-sm text-stone-700">
          {tcsInvoiceLabel(taxPreview.tcsRatePercent)}: <strong>{formatInr(tcsAmt)}</strong>
          {taxPreview.tcsRatePercent === TCS_RATE_WITHOUT_PAN_PERCENT ? (
            <span className="mt-1 block text-amber-800">
              Buyer PAN not on file — TCS charged at 5%. Collect PAN to apply 1%.
            </span>
          ) : null}
          <span className="mt-1 block text-xs text-stone-500">{TCS_DEPOSIT_NOTE}</span>
        </p>
      ) : null}
      {roundOffInr !== 0 ? (
        <p className="leading-snug text-sm text-stone-700">
          Round off:{" "}
          <strong>
            {roundOffInr.toLocaleString(undefined, {
              style: "currency",
              currency: "INR",
              signDisplay: "exceptZero",
            })}
          </strong>
        </p>
      ) : null}
      {extra > 0 ? (
        <p className="leading-snug text-sm text-stone-700">
          Extra charges (not taxable): <strong>{formatInr(extra)}</strong>
        </p>
      ) : null}
      <p className="leading-snug">
        Invoice total {pricesTaxInclusive ? "(tax inclusive)" : "(incl. GST)"}:{" "}
        <strong className="text-lg text-zimson-900">{formatInr(invoiceTotal)}</strong>
      </p>
      {advanceInr > 0 ? (
        <p className="leading-snug">
          Less advance: <strong>{formatInr(advanceInr)}</strong>
          <span className="mx-1 text-stone-400">→</span>
          Balance due: <strong className="text-xl font-bold text-zimson-900">{formatInr(afterAdvance)}</strong>
          {Math.abs(afterAdvance - standardTotalInr) < 0.02 ? null : (
            <span className="mt-1 block text-sm text-amber-800">Adjust final amount below if needed.</span>
          )}
        </p>
      ) : (
        <p className="leading-snug">
          Amount to collect: <strong className="text-xl font-bold text-zimson-900">{formatInr(invoiceTotal)}</strong>
        </p>
      )}
    </div>
  );
}
