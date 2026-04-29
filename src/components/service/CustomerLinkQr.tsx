function barcodeImageSrc(value: string, width: number): string {
  const text = encodeURIComponent(value);
  const scale = Math.max(2, Math.floor(width / 220));
  return `https://bwipjs-api.metafloor.com/?bcid=code128&text=${text}&scale=${scale}&includetext=true&textxalign=center`;
}

function qrImageSrc(value: string, size: number): string {
  const text = encodeURIComponent(value);
  const pixels = Math.max(160, Math.min(512, Math.floor(size)));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${pixels}x${pixels}&data=${text}`;
}

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
        src={isQr ? qrImageSrc(url, width) : barcodeImageSrc(url, width)}
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
