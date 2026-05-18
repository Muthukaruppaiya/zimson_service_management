import { invoiceBarcodeImageSrc, invoiceQrImageSrc } from "../../lib/invoiceScanCodes";

type Props = {
  url: string;
  /** Approximate visual size in pixels (default 220). */
  size?: number;
  /** Optional caption above the code. */
  caption?: string;
  /** Render mode (default barcode). */
  mode?: "barcode" | "qr";
  className?: string;
};

/**
 * Barcode for a customer-facing URL (tracking, photo capture, etc.).
 * Encode the exact URL the server returned so it matches SMS / copy-paste.
 */
export function CustomerLinkQr({ url, size = 160, caption, mode = "barcode", className = "" }: Props) {
  if (!url.trim()) return null;
  const width = Math.max(180, size);
  const isQr = mode === "qr";
  return (
    <div className={className}>
      {caption ? <p className="text-xs text-stone-600">{caption}</p> : null}
      <img
        src={isQr ? invoiceQrImageSrc(url, width) : invoiceBarcodeImageSrc(url, width)}
        alt={isQr ? "QR code for link" : "Barcode for link"}
        width={width}
        height={isQr ? width : 72}
        className="mx-auto mt-1 block rounded-lg border border-stone-200 bg-white p-1 shadow-sm"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
