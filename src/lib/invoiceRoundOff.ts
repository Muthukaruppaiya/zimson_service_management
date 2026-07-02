/** Round paise to whole rupees: >59 paise rounds up, otherwise rounds down. */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type InvoiceRoundOffResult = {
  /** Amount before round-off (gross taxable + tax). */
  preRoundOffInr: number;
  /** Adjustment to reach whole rupees (e.g. -0.01 or +0.33). */
  roundOffInr: number;
  /** Final payable in whole rupees. */
  netPayableInr: number;
};

/**
 * Indian invoice round-off: if decimal paise > 59, round up to next rupee;
 * otherwise drop the decimal (round down).
 */
export function applyInvoiceRoundOff(preRoundOffInr: number): InvoiceRoundOffResult {
  const pre = round2(Math.max(0, preRoundOffInr));
  const whole = Math.floor(pre);
  const frac = round2(pre - whole);
  if (frac <= 0) {
    return { preRoundOffInr: pre, roundOffInr: 0, netPayableInr: whole };
  }
  const paise = Math.round(frac * 100);
  if (paise > 59) {
    const netPayableInr = whole + 1;
    return {
      preRoundOffInr: pre,
      roundOffInr: round2(netPayableInr - pre),
      netPayableInr,
    };
  }
  return {
    preRoundOffInr: pre,
    roundOffInr: round2(whole - pre),
    netPayableInr: whole,
  };
}

/** Payable from GST breakdown (taxable + tax), with invoice round-off applied. */
export function invoicePayableFromGstParts(grossTaxableInr: number, totalTaxInr: number): InvoiceRoundOffResult {
  return applyInvoiceRoundOff(round2(grossTaxableInr) + round2(Math.max(0, totalTaxInr)));
}
