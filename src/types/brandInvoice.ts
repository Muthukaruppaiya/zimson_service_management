export type BrandInvoiceLineItem = {
  spare: string;
  hsn: string;
  quantity: number;
  priceInr: number;
};

export function brandInvoiceLineTotal(line: Pick<BrandInvoiceLineItem, "quantity" | "priceInr">): number {
  const qty = Number(line.quantity);
  const price = Number(line.priceInr);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return qty * price;
}

export function brandInvoiceLinesTotal(lines: BrandInvoiceLineItem[]): number {
  return lines.reduce((sum, line) => sum + brandInvoiceLineTotal(line), 0);
}

export function emptyBrandInvoiceLine(): BrandInvoiceLineItem {
  return { spare: "", hsn: "", quantity: 1, priceInr: 0 };
}

export function validateBrandInvoiceLines(lines: BrandInvoiceLineItem[]): string | null {
  if (!lines.length) return "Add at least one invoice line item.";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const n = i + 1;
    if (!line.spare.trim()) return `Line ${n}: spare / part name is required.`;
    if (!line.hsn.trim()) return `Line ${n}: select an HSN code.`;
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return `Line ${n}: quantity must be greater than zero.`;
    const price = Number(line.priceInr);
    if (!Number.isFinite(price) || price < 0) return `Line ${n}: price must be zero or more.`;
  }
  return null;
}

export function normalizeBrandInvoiceLines(lines: BrandInvoiceLineItem[]): BrandInvoiceLineItem[] {
  return lines.map((line) => ({
    spare: line.spare.trim(),
    hsn: line.hsn.trim(),
    quantity: Number(line.quantity),
    priceInr: Number(line.priceInr),
  }));
}
