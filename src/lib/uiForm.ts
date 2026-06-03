/**
 * Shared compact form controls — same density as Quick bill history (.ui-field in index.css).
 */

/** Standard text/select/textarea (includes top margin for label stacks). */
export const inputClass = "ui-field mt-1 min-w-0 max-w-full";

/** Read-only fields filled from GST registry lookup. */
export const inputClassReadOnly = `${inputClass} cursor-not-allowed bg-stone-100 text-stone-800`;

/** Field without default top margin (inline toolbars). */
export const inputClassFlat = "ui-field min-w-0 max-w-full";

export const labelClass = "ui-field-label";

export const btnCompactPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-rlx-gold px-3 py-1.5 text-[11px] font-semibold tracking-wide text-rlx-green-deep transition hover:bg-rlx-gold-dark disabled:opacity-50";

export const btnCompactSecondary =
  "inline-flex items-center justify-center gap-1.5 border border-rlx-rule bg-white px-3 py-1.5 text-[11px] font-semibold tracking-wide text-rlx-ink transition hover:border-rlx-green hover:text-rlx-green disabled:opacity-50";

export const btnCompactOutline =
  "inline-flex items-center justify-center gap-1.5 border border-rlx-gold/60 bg-white px-3 py-1.5 text-[11px] font-semibold tracking-wide text-rlx-green transition hover:border-rlx-gold hover:bg-rlx-green-light disabled:opacity-50";
