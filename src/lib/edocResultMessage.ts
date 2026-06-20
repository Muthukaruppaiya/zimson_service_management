export type EdocUiResult = {
  ok?: boolean;
  skipped?: boolean;
  skipReason?: string | null;
  ewayBillNo?: string | null;
  ewayValidUpto?: string | null;
  pdfUrl?: string | null;
  error?: string | null;
};

export function formatEwayEdocMessage(edoc: EdocUiResult | null | undefined): string | null {
  if (!edoc) return null;
  if (edoc.ewayBillNo) {
    const valid = edoc.ewayValidUpto ? ` Valid until ${edoc.ewayValidUpto}.` : "";
    return `E-way bill ${edoc.ewayBillNo} generated.${valid}`;
  }
  if (edoc.skipped && edoc.skipReason) return `E-way: ${edoc.skipReason}`;
  if (edoc.error) return `E-way failed: ${edoc.error}`;
  return null;
}
