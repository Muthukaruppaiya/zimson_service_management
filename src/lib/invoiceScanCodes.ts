/** Code 128 barcode — bars only; show the reference as separate HTML for print clarity. */
export function documentBarcodeImageSrc(
  value: string,
  opts?: { scale?: number; height?: number },
): string {
  const text = encodeURIComponent(value.trim());
  const scale = opts?.scale ?? 2;
  const height = opts?.height ?? 8;
  return `https://bwipjs-api.metafloor.com/?bcid=code128&text=${text}&scale=${scale}&height=${height}&includetext=false`;
}

/** Code 128 barcode image (bwip-js API). */
export function invoiceBarcodeImageSrc(value: string, width = 220): string {
  const scale = Math.max(2, Math.floor(width / 110));
  return documentBarcodeImageSrc(value, { scale, height: 8 });
}

/** QR code image encoding the invoice number (or other scan payload). */
export function invoiceQrImageSrc(value: string, size = 128): string {
  const text = encodeURIComponent(value.trim());
  const pixels = Math.max(120, Math.min(256, Math.floor(size)));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${pixels}x${pixels}&data=${text}`;
}
