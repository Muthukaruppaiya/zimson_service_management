import QRCode from "qrcode/lib/browser.js";
import { useEffect, useState } from "react";
import {
  EINVOICE_QR_OPTIONS,
  EINVOICE_QR_RENDER_SIZE,
  einvoiceQrEncodeText,
} from "../../lib/einvoiceQr";

type Props = {
  /** NIC SignedQRCode from IRP (used to resolve IRN when irn prop is missing). */
  signedPayload?: string | null;
  /** Printed IRN — preferred QR content for clear scanning. */
  irn?: string | null;
  size?: number;
  className?: string;
};

/** GST e-invoice QR — encodes IRN for clear scanning; shows IRN below the code. */
export function EinvoiceSignedQr({
  signedPayload,
  irn,
  size = EINVOICE_QR_RENDER_SIZE,
  className = "",
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const displayIrn = einvoiceQrEncodeText(signedPayload, irn);

  useEffect(() => {
    const text = einvoiceQrEncodeText(signedPayload, irn);
    if (!text) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(text, {
      ...EINVOICE_QR_OPTIONS,
      width: size,
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [signedPayload, irn, size]);

  if (!src || !displayIrn) return null;

  return (
    <div
      className={`inv-einvoice-qr flex flex-col items-center gap-1 ${className}`}
      data-einvoice-qr-ready="true"
      aria-label={`E-invoice QR IRN ${displayIrn}`}
    >
      <img
        src={src}
        alt={`E-invoice QR ${displayIrn}`}
        width={size}
        height={size}
        className="inv-einvoice-qr-img block border border-stone-300 bg-white p-1"
        loading="eager"
        decoding="async"
      />
      <p className="inv-einvoice-qr-label text-center text-[8px] font-semibold uppercase tracking-wide text-stone-600">
        E-invoice QR
      </p>
    </div>
  );
}
