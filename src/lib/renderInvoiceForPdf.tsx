import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ServiceInvoiceTemplate } from "../components/service/ServiceInvoiceTemplate";
import type { ServiceInvoiceViewModel } from "../types/serviceInvoice";
import { captureInvoicePdfBlob } from "./captureInvoicePdf";

const LAYOUT_POLL_MS = 80;
const LAYOUT_DEADLINE_MS = 8000;

async function waitForInvoiceLayout(root: HTMLElement): Promise<HTMLElement> {
  const deadline = Date.now() + LAYOUT_DEADLINE_MS;
  let printRoot: HTMLElement | null = null;

  while (Date.now() < deadline) {
    const candidate = root.querySelector(".service-invoice-print-root");
    if (candidate instanceof HTMLElement) {
      printRoot = candidate;
      const expectQr = printRoot.querySelector("[data-expect-einvoice-qr='1']") != null;
      const imgs = Array.from(printRoot.querySelectorAll("img"));
      const pending = imgs.some((img) => !img.complete);
      const qrReady =
        !expectQr || printRoot.querySelector("[data-einvoice-qr-ready='true']") != null;
      if (!pending && qrReady) break;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, LAYOUT_POLL_MS));
  }

  if (!(printRoot instanceof HTMLElement)) {
    throw new Error("Could not render invoice for PDF.");
  }

  const imgs = Array.from(printRoot.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        }),
    ),
  );
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  return printRoot;
}

/** Renders the formal invoice off-screen and returns a PDF blob (table-row download). */
export async function captureInvoicePdfFromViewModel(
  data: ServiceInvoiceViewModel,
  idPrefix = "inv-dl",
): Promise<Blob> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-12000px";
  host.style.top = "0";
  host.style.width = "794px";
  host.style.background = "#ffffff";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    flushSync(() => {
      root.render(<ServiceInvoiceTemplate data={data} idPrefix={idPrefix} />);
    });
    const printRoot = await waitForInvoiceLayout(host);
    return await captureInvoicePdfBlob(printRoot);
  } finally {
    root.unmount();
    document.body.removeChild(host);
  }
}
