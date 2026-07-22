import { useState } from "react";
import { resolveEwayDocumentUrl } from "../../lib/einvoicePortal";
import { printBrandDispatchDocument } from "../../lib/serviceDocuments";
import type { SrfJob } from "../../types/srfJob";
import { EwayBillModal } from "./EwayBillModal";
import type { EdocUiResult } from "../../lib/edocResultMessage";
import { AppModal, AppModalDetailGrid, AppModalDetailRow } from "../ui/AppModal";
import { modalBtnGold, modalBtnPrimary, modalBtnSecondary, modalFooterClass } from "../../lib/appModalStyles";

type Props = {
  job: SrfJob;
  onClose: () => void;
  onEwayUpdated?: (edoc: EdocUiResult) => void;
  /** Optional: print linked store↔HO delivery challan when available. */
  onPrintTransferDc?: () => void;
  transferDcLabel?: string | null;
  /** E-way PDF from linked transfer DC (if brand row has no own e-way). */
  transferEwayPdfUrl?: string | null;
  transferEwayBillNo?: string | null;
  transferEwayValidUpto?: string | null;
};

export function BrandSendDetailsModal({
  job,
  onClose,
  onEwayUpdated,
  onPrintTransferDc,
  transferDcLabel,
  transferEwayPdfUrl,
  transferEwayBillNo,
  transferEwayValidUpto,
}: Props) {
  const [ewayOpen, setEwayOpen] = useState(false);
  const [liveEdoc, setLiveEdoc] = useState<EdocUiResult | null>(null);
  const brandPdfUrl = resolveEwayDocumentUrl({
    pdfUrl: liveEdoc?.pdfUrl ?? job.edocEwayPdfUrl,
  });
  const transferPdfUrl = resolveEwayDocumentUrl({ pdfUrl: transferEwayPdfUrl });
  const ewayPdfUrl = brandPdfUrl ?? transferPdfUrl;
  const ewayBillNo =
    liveEdoc?.ewayBillNo?.trim() || job.edocEwayBillNo?.trim() || transferEwayBillNo?.trim() || "";
  const ewayValidUpto =
    liveEdoc?.ewayValidUpto?.trim() || job.edocEwayValidUpto?.trim() || transferEwayValidUpto?.trim() || "";
  const loggedAt = job.brandDispatchClerkAt ?? job.brandSentAt ?? job.createdAt;
  const canCreateBrandEway = Boolean(job.brandOdcNumber?.trim()) && !ewayBillNo;

  return (
    <>
      <AppModal
        open
        onClose={onClose}
        eyebrow="Brand dispatch"
        title="Send to brand — details"
        subtitle={job.reference}
        description={new Date(loggedAt).toLocaleString()}
        size="lg"
        zIndex={60}
        footer={
          <div className={modalFooterClass}>
            <button
              type="button"
              className={modalBtnPrimary}
              onClick={() => printBrandDispatchDocument(job)}
              disabled={!job.brandOdcNumber && !job.brandDispatchRef}
            >
              Print brand ODC / DC
            </button>
            {onPrintTransferDc && transferDcLabel ? (
              <button type="button" className={modalBtnGold} onClick={onPrintTransferDc}>
                Print transfer DC ({transferDcLabel})
              </button>
            ) : null}
            {canCreateBrandEway ? (
              <button type="button" className={modalBtnSecondary} onClick={() => setEwayOpen(true)}>
                Create e-way bill
              </button>
            ) : null}
            {ewayPdfUrl ? (
              <a href={ewayPdfUrl} target="_blank" rel="noopener noreferrer" className={`${modalBtnSecondary} no-underline`}>
                Open GST e-way bill PDF
              </a>
            ) : null}
            <button type="button" className={modalBtnSecondary} onClick={onClose}>
              Done
            </button>
          </div>
        }
      >
        <AppModalDetailGrid>
          <AppModalDetailRow label="Status">
            <span className="font-semibold uppercase tracking-wide text-zimson-900">
              {job.status.replaceAll("_", " ")}
            </span>
          </AppModalDetailRow>
          <AppModalDetailRow label="Customer">
            {job.customerName} · {job.phone}
          </AppModalDetailRow>
          <AppModalDetailRow label="Watch">
            {job.watchBrand} {job.watchModel}
            {job.serial ? ` · ${job.serial}` : ""}
          </AppModalDetailRow>
          <AppModalDetailRow label="Dispatch ref">
            <span className="font-semibold text-zimson-900">{job.brandDispatchRef?.trim() || "—"}</span>
          </AppModalDetailRow>
          <AppModalDetailRow label="Dispatch note">
            {job.brandDispatchClerkNote?.trim() || job.brandDispatchNote?.trim() || "—"}
          </AppModalDetailRow>
          <AppModalDetailRow label="Brand ODC / DC">
            <span className="font-mono font-semibold text-zimson-900">{job.brandOdcNumber ?? "—"}</span>
          </AppModalDetailRow>
          {transferDcLabel ? (
            <AppModalDetailRow label="Transfer DC">
              <span className="font-mono">{transferDcLabel}</span>
            </AppModalDetailRow>
          ) : null}
          <AppModalDetailRow label="E-way bill" last>
            {ewayBillNo ? (
              <div>
                <p className="font-mono text-base font-bold text-emerald-800">{ewayBillNo}</p>
                {ewayValidUpto ? (
                  <p className="mt-0.5 text-xs text-slate-600">Valid until {ewayValidUpto}</p>
                ) : null}
              </div>
            ) : (
              <span className="text-slate-500">No e-way bill on this dispatch</span>
            )}
          </AppModalDetailRow>
        </AppModalDetailGrid>

        {ewayPdfUrl ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
            <p className="border-b border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-emerald-900">
              GST e-way bill PDF (API response)
            </p>
            <iframe title="GST e-way bill PDF" src={ewayPdfUrl} className="h-64 w-full bg-white" />
          </div>
        ) : ewayBillNo ? (
          <p className="mt-3 rounded-xl border border-rlx-gold/35 bg-rlx-gold-light/40 px-3 py-2 text-xs text-rlx-gold-dark">
            E-way bill number is saved, but the GST PDF URL was not stored on this record (older generate). Regenerate
            e-way on a new dispatch to capture the PDF response.
          </p>
        ) : null}
      </AppModal>

      {ewayOpen ? (
        <EwayBillModal
          open
          kind="brand"
          resourceId={job.id}
          onClose={() => setEwayOpen(false)}
          onSuccess={(edoc) => {
            setLiveEdoc(edoc);
            onEwayUpdated?.(edoc);
            setEwayOpen(false);
          }}
          onPrintDocument={() => printBrandDispatchDocument(job)}
        />
      ) : null}
    </>
  );
}
