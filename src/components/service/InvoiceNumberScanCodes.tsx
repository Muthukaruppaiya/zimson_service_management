import { invoiceBarcodeImageSrc } from "../../lib/invoiceScanCodes";
// import { invoiceQrImageSrc } from "../../lib/invoiceScanCodes"; // uncomment with QR block below

type Props = {
  invoiceNumber: string;
  className?: string;
};

/** Barcode for the store invoice number on printed / saved invoices (QR commented for later). */
export function InvoiceNumberScanCodes({ invoiceNumber, className = "" }: Props) {
  const code = invoiceNumber.trim();
  if (!code) return null;

  return (
    <div
      className={`mt-2 flex flex-col items-center gap-1 print:mt-1 ${className}`}
      aria-label={`Invoice scan codes for ${code}`}
    >
      <img
        src={invoiceBarcodeImageSrc(code, 200)}
        alt={`Barcode ${code}`}
        width={200}
        height={56}
        className="block rounded border border-stone-200 bg-white p-0.5 print:max-h-[48px] print:w-[180px]"
        loading="eager"
        decoding="async"
      />
      {/* QR — re-enable when needed
      <img
        src={invoiceQrImageSrc(code, 112)}
        alt={`QR code ${code}`}
        width={112}
        height={112}
        className="block rounded border border-stone-200 bg-white p-0.5 print:h-[88px] print:w-[88px]"
        loading="eager"
        decoding="async"
      />
      */}
      <p className="max-w-[200px] text-center font-mono text-[9px] text-stone-500 print:text-[7pt]">{code}</p>
    </div>
  );
}
