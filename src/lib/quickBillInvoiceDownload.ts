import { ADVANCE_CASH_DENOMS, formatPaymentSummary, paymentSplitsFromDetails } from "./paymentModes";
import type { AdvancePaymentDetails } from "./paymentModes";
import type { QuickBillInvoice } from "../types/quickBill";
import { invoiceBarcodeImageSrc } from "./invoiceScanCodes";
// import { invoiceQrImageSrc } from "./invoiceScanCodes"; // uncomment with QR img in scanBlock

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPaymentBlock(inv: QuickBillInvoice): string {
  const pd: AdvancePaymentDetails | null | undefined = inv.paymentDetails;
  const splits = paymentSplitsFromDetails(inv.paymentMode, pd, inv.totalInr);
  if (splits.length > 1 || (pd as { splits?: unknown })?.splits) {
    return escapeHtml(formatPaymentSummary(inv.paymentMode, pd));
  }
  if (inv.paymentMode === "Cash" && pd?.cash) {
    const parts: string[] = [];
    for (const { key, face, label } of ADVANCE_CASH_DENOMS) {
      const qty = Number(pd.cash[key]);
      if (Number.isFinite(qty) && qty > 0) parts.push(`${label} ${qty} = ₹${(qty * face).toFixed(2)}`);
    }
    const coins = Number(pd.cash.coinsInr);
    if (Number.isFinite(coins) && coins > 0) parts.push(`Coins / small change: ₹${coins.toFixed(2)}`);
    return parts.length > 0 ? parts.join("<br/>") : "—";
  }
  const ref = pd?.reference?.trim();
  return ref ? escapeHtml(ref) : escapeHtml(inv.paymentMode);
}

function warrantyLabel(w: string | undefined): string {
  switch (w) {
    case "under_warranty":
      return "Under warranty";
    case "extended":
      return "Extended warranty";
    case "none":
      return "No warranty";
    case "unspecified":
    default:
      return "Unspecified";
  }
}

/** Minimal standalone HTML for saving or printing a quick bill invoice. */
export function buildQuickBillInvoiceDownloadHtml(inv: QuickBillInvoice): string {
  const billTo =
    inv.customerType === "B2B" ? escapeHtml(inv.company?.trim() || "—") : escapeHtml(inv.customerName?.trim() || "Walk-in / B2C");
  const linesRows = inv.lines
    .map(
      (ln) =>
        `<tr><td>${ln.lineNo}</td><td>${escapeHtml(ln.description)}</td><td style="text-align:right">${ln.qty}</td><td style="text-align:right">₹${ln.amountInr.toFixed(2)}</td></tr>`,
    )
    .join("");

  const scanNumber = (inv.invoiceNumber || inv.billNumber || "").trim();
  const scanBlock = scanNumber
    ? `<div style="flex-shrink:0;text-align:center">
        <img src="${invoiceBarcodeImageSrc(scanNumber, 200)}" alt="Barcode ${escapeHtml(scanNumber)}" width="200" height="56" style="display:block;border:1px solid #d6d3d1;background:#fff"/>
        <p style="font-family:monospace;font-size:10px;color:#57534e;margin:4px 0 0">${escapeHtml(scanNumber)}</p>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(inv.billNumber)}</title>
<style>
  body { font-family: system-ui, Segoe UI, sans-serif; margin: 24px; color: #1c1917; }
  h1 { font-size: 1.25rem; margin: 0 0 8px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.9rem; }
  th, td { border: 1px solid #d6d3d1; padding: 6px 8px; vertical-align: top; }
  th { background: #fafaf9; text-align: left; }
  .muted { color: #57534e; font-size: 0.85rem; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
  .head { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; margin-bottom: 12px; }
</style>
</head>
<body>
  <div class="head">${scanBlock}<h1 style="margin:0">Quick bill — ${escapeHtml(inv.billNumber)}</h1></div>
  <p class="muted"><strong>Invoice no.</strong> ${escapeHtml(inv.invoiceNumber || inv.billNumber)}</p>
  <p class="muted">${escapeHtml(new Date(inv.createdAt).toLocaleString())} · ${escapeHtml([inv.regionName, inv.storeName].filter(Boolean).join(" · ") || inv.regionId)}</p>
  <div class="grid2">
    <div><strong>Bill to</strong><br/>${billTo}</div>
    <div><strong>Contact</strong><br/>Phone: ${escapeHtml(inv.phone ?? "—")}<br/>Email: ${escapeHtml(inv.email ?? "—")}</div>
    ${
      inv.customerType === "B2B"
        ? `<div><strong>GSTIN</strong><br/>${escapeHtml(inv.gst ?? "—")}</div><div><strong>PAN</strong><br/>${escapeHtml(inv.pan ?? "—")}</div>`
        : ""
    }
    <div><strong>Watch</strong><br/>${escapeHtml(inv.watchBrand)} ${escapeHtml(inv.watchModel)}${inv.watchRef ? ` · Ref ${escapeHtml(inv.watchRef)}` : ""}</div>
    <div><strong>Warranty</strong><br/>${escapeHtml(warrantyLabel(inv.warrantyStatus))}</div>
  </div>
  <p><strong>Technician</strong><br/>${escapeHtml(inv.technicianName ?? "—")}</p>
  ${inv.watchRemark?.trim() ? `<p><strong>Watch remark</strong><br/>${escapeHtml(inv.watchRemark.trim())}</p>` : ""}
  <table>
    <thead><tr><th>#</th><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Amount (INR)</th></tr></thead>
    <tbody>${linesRows}</tbody>
  </table>
  <p><strong>Payment</strong> — ${escapeHtml(inv.paymentMode)}<br/>${formatPaymentBlock(inv)}</p>
  ${inv.notes?.trim() ? `<p><strong>Notes</strong><br/>${escapeHtml(inv.notes.trim())}</p>` : ""}
  <p style="font-size:1.1rem"><strong>Total payable: ₹${inv.totalInr.toFixed(2)}</strong></p>
</body>
</html>`;
}

export function downloadQuickBillInvoiceHtml(inv: QuickBillInvoice): void {
  const html = buildQuickBillInvoiceDownloadHtml(inv);
  const safeName = inv.billNumber.replace(/[^\w.-]+/g, "_") || "quick-bill";
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
