/** Code 128 barcode image (bwip-js API). */
export function invoiceBarcodeImageSrc(value: string, width = 220): string {
  const text = encodeURIComponent(value.trim());
  const scale = Math.max(2, Math.floor(width / 220));
  return `https://bwipjs-api.metafloor.com/?bcid=code128&text=${text}&scale=${scale}&includetext=true&textxalign=center`;
}

/** QR code image encoding the invoice number (or other scan payload). */
export function invoiceQrImageSrc(value: string, size = 128): string {
  const text = encodeURIComponent(value.trim());
  const pixels = Math.max(120, Math.min(256, Math.floor(size)));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${pixels}x${pixels}&data=${text}`;
}
