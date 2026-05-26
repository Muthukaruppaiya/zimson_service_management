import { createRoot } from "react-dom/client";
import { ServiceInvoiceTemplate } from "../components/service/ServiceInvoiceTemplate";
import type { ServiceInvoiceViewModel } from "../types/serviceInvoice";
import { captureInvoicePdfBlob } from "./captureInvoicePdf";

async function waitForInvoiceLayout(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
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
    root.render(<ServiceInvoiceTemplate data={data} idPrefix={idPrefix} />);
    await waitForInvoiceLayout(host);

    const printRoot = host.querySelector(".service-invoice-print-root");
    if (!(printRoot instanceof HTMLElement)) {
      throw new Error("Could not render invoice for PDF.");
    }
    return await captureInvoicePdfBlob(printRoot);
  } finally {
    root.unmount();
    document.body.removeChild(host);
  }
}
