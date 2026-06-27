/**
 * Renders the on-screen tax invoice DOM to a PDF blob (for WhatsApp document header).
 * Tailwind v4 uses oklch() in the main bundle — we strip those sheets on clone and inject
 * hex-only stone invoice CSS so html2canvas/html2pdf match the classic grey ERP layout.
 */

import serviceInvoiceCss from "../styles/service-invoice.css?raw";

const A4_WIDTH_PX = 794;

function stripNonInvoiceStylesheets(doc: Document): void {
  doc.querySelectorAll("style, link[rel='stylesheet']").forEach((node) => node.remove());
}

function injectInvoiceStyles(doc: Document): void {
  const el = doc.createElement("style");
  el.setAttribute("data-invoice-pdf", "true");
  el.textContent = serviceInvoiceCss;
  doc.head.appendChild(el);
}

function prepareCloneForCapture(clonedRoot: HTMLElement): void {
  clonedRoot.classList.add("inv-pdf-capture");
  clonedRoot.style.width = `${A4_WIDTH_PX}px`;
  clonedRoot.style.maxWidth = `${A4_WIDTH_PX}px`;
  clonedRoot.style.margin = "0";
  clonedRoot.style.boxShadow = "none";
  clonedRoot.style.backgroundColor = "#ffffff";
  clonedRoot.style.color = "#0d1b2a";

  clonedRoot.querySelectorAll("img").forEach((img) => {
    const raw = img.getAttribute("src") ?? "";
    if (raw.startsWith("/")) {
      img.src = `${window.location.origin}${raw}`;
    }
  });
}

export async function captureInvoicePdfBlob(
  root: HTMLElement,
  /** @deprecated style copy no longer used; kept for API compat */
  _styleSource?: HTMLElement,
): Promise<Blob> {
  const html2pdf = (await import("html2pdf.js")).default;

  const worker = html2pdf()
    .set({
      margin: [0.25, 0.25, 0.25, 0.25],
      filename: "invoice.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        width: A4_WIDTH_PX,
        windowWidth: A4_WIDTH_PX,
        onclone: (clonedDoc, clonedElement) => {
          stripNonInvoiceStylesheets(clonedDoc);
          injectInvoiceStyles(clonedDoc);

          const clonedRoot =
            clonedElement instanceof HTMLElement &&
            clonedElement.classList.contains("service-invoice-print-root")
              ? clonedElement
              : clonedDoc.querySelector(".service-invoice-print-root");

          if (clonedRoot instanceof HTMLElement) {
            prepareCloneForCapture(clonedRoot);
          }
        },
      },
      jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], before: ".inv-page-terms" },
    })
    .from(root);

  const blob = (await worker.outputPdf("blob")) as Blob;
  if (!(blob instanceof Blob) || blob.size < 100) {
    throw new Error("Could not generate invoice PDF. Try Print invoice first, then send again.");
  }
  return blob;
}

export function findInvoicePrintRoot(): HTMLElement | null {
  const el = document.querySelector(".service-invoice-print-root");
  return el instanceof HTMLElement ? el : null;
}

/** Ensures upload/messaging APIs receive a PDF blob (html2pdf may omit MIME type). */
export function ensureApplicationPdfBlob(blob: Blob): Blob {
  if (blob.type === "application/pdf") return blob;
  return new Blob([blob], { type: "application/pdf" });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const trimmed = filename.trim();
  const name = /\.\w{2,5}$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Downloads the on-screen `.service-invoice-print-root` as a PDF file. */
export async function downloadServiceInvoicePdfFromPage(filename: string): Promise<void> {
  const blob = await captureInvoicePdfFromPage();
  triggerBlobDownload(blob, filename);
}

/** Captures invoice even when the print root is `display:none` (e.g. store billing). */
export async function captureInvoicePdfFromPage(): Promise<Blob> {
  const root = findInvoicePrintRoot();
  if (!root) {
    throw new Error("Invoice is not on screen. View the invoice below, then try again.");
  }

  const style = window.getComputedStyle(root);
  const hidden = style.display === "none" || style.visibility === "hidden" || root.offsetParent === null;

  if (!hidden) {
    return captureInvoicePdfBlob(root);
  }

  const clone = root.cloneNode(true) as HTMLElement;
  clone.style.position = "fixed";
  clone.style.left = "-12000px";
  clone.style.top = "0";
  clone.style.display = "block";
  clone.style.visibility = "visible";
  clone.style.opacity = "1";
  clone.style.pointerEvents = "none";
  clone.style.zIndex = "-1";
  clone.style.backgroundColor = "#ffffff";
  clone.style.width = `${A4_WIDTH_PX}px`;
  document.body.appendChild(clone);
  try {
    return await captureInvoicePdfBlob(clone);
  } finally {
    document.body.removeChild(clone);
  }
}
