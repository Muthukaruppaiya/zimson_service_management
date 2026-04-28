function qrImageSrc(url: string, size: number): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;
}

type Props = {
  url: string;
  /** Pixel size for the QR square (default 160). */
  size?: number;
  /** Optional caption above the code. */
  caption?: string;
  className?: string;
};

/**
 * QR for a customer-facing URL (tracking, photo capture, etc.).
 * Encode the exact URL the server returned so it matches SMS / copy-paste.
 */
export function CustomerLinkQr({ url, size = 160, caption, className = "" }: Props) {
  if (!url.trim()) return null;
  return (
    <div className={className}>
      {caption ? <p className="text-xs text-stone-600">{caption}</p> : null}
      <img
        src={qrImageSrc(url, size)}
        alt="QR code for link"
        width={size}
        height={size}
        className="mx-auto mt-1 block rounded-lg border border-stone-200 bg-white p-1 shadow-sm"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
