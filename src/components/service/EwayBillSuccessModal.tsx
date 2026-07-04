import { ProcessSuccessModal } from "../ui/ProcessSuccessModal";
import type { EdocUiResult } from "../../lib/edocResultMessage";
import { resolveEwayDocumentUrl } from "../../lib/einvoicePortal";

const btnPrimary =
  "inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-rlx-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rlx-green-deep disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";
const btnSecondary =
  "inline-flex w-full min-w-0 items-center justify-center rounded-xl border border-rlx-gold bg-white px-4 py-2.5 text-sm font-semibold text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green-light disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto no-underline";

type Props = {
  open: boolean;
  edoc: EdocUiResult;
  documentNumber?: string | null;
  /** e.g. "Delivery challan", "Brand dispatch ODC" */
  documentLabel?: string;
  onPrintDocument?: () => void;
  onClose: () => void;
};

export function EwayBillSuccessModal({
  open,
  edoc,
  documentNumber,
  documentLabel = "Delivery challan / ODC",
  onPrintDocument,
  onClose,
}: Props) {
  const ewayPdfUrl = resolveEwayDocumentUrl({ pdfUrl: edoc.pdfUrl });
  const docNo = String(documentNumber ?? "").trim();

  return (
    <ProcessSuccessModal
      open={open}
      title="E-way bill generated"
      description={docNo ? `${documentLabel} ${docNo}` : documentLabel}
      onBackdropClick={onClose}
      actions={
        <>
          {ewayPdfUrl ? (
            <a href={ewayPdfUrl} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
              Open GST e-way bill PDF
            </a>
          ) : null}
          {onPrintDocument ? (
            <button type="button" className={ewayPdfUrl ? btnSecondary : btnPrimary} onClick={onPrintDocument}>
              Print {documentLabel.toLowerCase()}
            </button>
          ) : null}
          <button type="button" className={btnSecondary} onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/80 px-4 py-3 text-center">
        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">E-way bill number</p>
        <p className="mt-1 font-mono text-xl font-bold text-stone-900">{edoc.ewayBillNo}</p>
        {edoc.ewayValidUpto ? (
          <p className="mt-2 text-xs text-stone-600">Valid until {edoc.ewayValidUpto}</p>
        ) : null}
      </div>
      {ewayPdfUrl ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-emerald-200 bg-stone-50">
          <iframe
            title="GST e-way bill PDF"
            src={ewayPdfUrl}
            className="h-72 w-full bg-white"
          />
          <p className="border-t border-emerald-100 px-3 py-2 text-center text-[11px] text-stone-600">
            GST e-way bill PDF from Masters India. Use{" "}
            <a href={ewayPdfUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-rlx-green underline">
              Open GST e-way bill PDF
            </a>{" "}
            if the preview does not load.
          </p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          E-way bill number was generated, but the GST e-way bill PDF was not included in the API response. Generate
          again or check Masters India e-doc settings.
        </p>
      )}
    </ProcessSuccessModal>
  );
}
