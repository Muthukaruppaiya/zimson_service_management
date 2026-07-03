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
          {onPrintDocument ? (
            <button type="button" className={btnPrimary} onClick={onPrintDocument}>
              Print {documentLabel.toLowerCase()}
            </button>
          ) : null}
          {ewayPdfUrl ? (
            <a href={ewayPdfUrl} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
              Open e-way bill (PDF)
            </a>
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
      {!ewayPdfUrl ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          E-way PDF was not returned by the portal. You can retrieve it from the{" "}
          <a
            href="https://ewaybillgst.gov.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
          >
            GST e-way bill portal
          </a>{" "}
          using the bill number above.
        </p>
      ) : null}
    </ProcessSuccessModal>
  );
}
