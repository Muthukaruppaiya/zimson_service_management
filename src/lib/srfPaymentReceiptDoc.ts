import { formatInr } from "./formatInr";
import { openPrintDocument } from "./inventoryDocuments";
import { inrAmountToWords } from "./inrAmountToWords";
import type { SrfPaymentReceiptView } from "../types/srfPaymentReceipt";

function esc(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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

export function kindTitle(kind: string): string {
  return kind === "booking_advance" ? "Advance receipt" : "Payment receipt";
}

export function buildSrfPaymentReceiptHtml(data: SrfPaymentReceiptView): string {
  const title = kindTitle(data.kind);
  const words = data.amountInWords || inrAmountToWords(data.amountInr);
  return `
  <style>
    body { font-family: Poppins, "Segoe UI", sans-serif; margin: 0; padding: 20px; color: #0d1b2a; background: #fff; }
    .doc { max-width: 720px; margin: 0 auto; border: 1px solid #1b3a8f; padding: 22px 24px 18px; background: #fff; }
    .top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .brand { font-size: 13px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: #1b3a8f; }
    .store { margin-top: 6px; font-size: 12px; line-height: 1.45; color: #334155; }
    .title { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #1b3a8f; text-align: right; }
    .meta { margin-top: 4px; font-size: 12px; text-align: right; color: #475569; }
    .gold { height: 4px; margin: 14px 0 16px; background: linear-gradient(90deg, #1b3a8f, #c9a227, #1b3a8f); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; font-size: 12.5px; }
    .k { color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .v { margin-top: 2px; font-weight: 600; color: #0d1b2a; }
    .amt { margin-top: 16px; border: 1px solid #1b3a8f; background: #f7f5ee; padding: 12px 14px; }
    .amt-l { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #1b3a8f; }
    .amt-n { margin-top: 4px; font-size: 28px; font-weight: 800; color: #1b3a8f; }
    .amt-w { margin-top: 4px; font-size: 12px; font-style: italic; color: #334155; }
    .note { margin-top: 12px; font-size: 12px; color: #475569; }
    .foot { margin-top: 22px; display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; font-size: 11px; color: #64748b; }
    .sign { width: 210px; border-top: 1px solid #0d1b2a; text-align: center; padding-top: 6px; color: #0d1b2a; font-weight: 600; }
    .disc { margin-top: 14px; font-size: 10px; color: #94a3b8; }
    @media print { body { padding: 0; } .doc { border: none; } }
  </style>
  <div class="doc">
    <div class="top">
      <div>
        <div class="brand">Zimson Watch Care</div>
        <div class="store">
          ${esc(data.storeName || "Zimson")}<br/>
          ${esc(data.storeAddress || "")}${data.storeAddress ? "<br/>" : ""}
          ${data.storePhone ? `Ph: ${esc(data.storePhone)}` : ""}
          ${data.storeGstin ? ` · GSTIN: ${esc(data.storeGstin)}` : ""}
        </div>
      </div>
      <div>
        <h1 class="title">${esc(title)}</h1>
        <div class="meta">No. <strong>${esc(data.receiptNo)}</strong><br/>${esc(fmtDate(data.collectedAt))}</div>
      </div>
    </div>
    <div class="gold"></div>
    <div class="grid">
      <div><div class="k">Received from</div><div class="v">${esc(data.customerName)}</div></div>
      <div><div class="k">Mobile</div><div class="v">${esc(data.phone)}</div></div>
      <div><div class="k">SRF no.</div><div class="v">${esc(data.srfReference)}</div></div>
      <div><div class="k">Watch</div><div class="v">${esc([data.watchBrand, data.watchModel, data.serial].filter(Boolean).join(" · ") || "—")}</div></div>
      <div><div class="k">Mode</div><div class="v">${esc(data.paymentSummary || data.paymentMode)}</div></div>
      <div><div class="k">Collected by</div><div class="v">${esc(data.collectedByName || "—")}</div></div>
    </div>
    <div class="amt">
      <div class="amt-l">Amount received</div>
      <div class="amt-n">${esc(formatInr(data.amountInr))}</div>
      <div class="amt-w">${esc(words)}</div>
    </div>
    ${data.note ? `<p class="note">${esc(data.note)}</p>` : ""}
    <p class="note">Total received on this SRF: <strong>${esc(formatInr(data.totalPaidInr))}</strong>
      ${data.estimateTotalInr > 0 ? ` · Estimate: ${esc(formatInr(data.estimateTotalInr))}` : ""}</p>
    <div class="foot">
      <div>Customer copy · Computer generated</div>
      <div class="sign">Authorised signatory</div>
    </div>
    <p class="disc">This is an acknowledgement of payment received against the service request. It is not a tax invoice. GST invoice is issued at billing.</p>
  </div>`;
}

export function printSrfPaymentReceipt(data: SrfPaymentReceiptView): void {
  openPrintDocument(`${kindTitle(data.kind)} ${data.receiptNo}`, buildSrfPaymentReceiptHtml(data));
}
