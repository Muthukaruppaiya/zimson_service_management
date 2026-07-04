import { useState } from "react";
import { resolveEwayDocumentUrl } from "../../lib/einvoicePortal";
import { printBrandDispatchDocument } from "../../lib/serviceDocuments";
import type { SrfJob } from "../../types/srfJob";
import { EwayBillModal } from "./EwayBillModal";
import type { EdocUiResult } from "../../lib/edocResultMessage";

const btnPrimary =
  "inline-flex items-center justify-center rounded-xl bg-violet-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-900 disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center justify-center rounded-xl border border-violet-300 bg-white px-4 py-2.5 text-sm font-semibold text-violet-900 transition hover:bg-violet-50 disabled:opacity-50 no-underline";

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        role="dialog"
        aria-labelledby="brand-send-details-title"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 id="brand-send-details-title" className="text-lg font-semibold text-violet-950">
              Send to brand — details
            </h3>
            <p className="font-mono text-sm font-semibold text-violet-900">{job.reference}</p>
            <p className="text-xs text-stone-500">{new Date(loggedAt).toLocaleString()}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm">
            Close
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-violet-100">
          <table className="min-w-full text-left text-sm">
            <tbody>
              <tr className="border-b border-violet-50">
                <th className="w-44 bg-violet-50/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-800">
                  Status
                </th>
                <td className="px-3 py-2 font-semibold uppercase tracking-wide text-violet-900">
                  {job.status.replaceAll("_", " ")}
                </td>
              </tr>
              <tr className="border-b border-violet-50">
                <th className="bg-violet-50/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-800">
                  Customer
                </th>
                <td className="px-3 py-2">
                  {job.customerName} · {job.phone}
                </td>
              </tr>
              <tr className="border-b border-violet-50">
                <th className="bg-violet-50/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-800">
                  Watch
                </th>
                <td className="px-3 py-2">
                  {job.watchBrand} {job.watchModel}
                  {job.serial ? ` · ${job.serial}` : ""}
                </td>
              </tr>
              <tr className="border-b border-violet-50">
                <th className="bg-violet-50/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-800">
                  Dispatch ref
                </th>
                <td className="px-3 py-2 font-semibold text-violet-900">{job.brandDispatchRef?.trim() || "—"}</td>
              </tr>
              <tr className="border-b border-violet-50">
                <th className="bg-violet-50/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-800">
                  Dispatch note
                </th>
                <td className="px-3 py-2 text-stone-700">
                  {job.brandDispatchClerkNote?.trim() || job.brandDispatchNote?.trim() || "—"}
                </td>
              </tr>
              <tr className="border-b border-violet-50">
                <th className="bg-violet-50/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-800">
                  Brand ODC / DC
                </th>
                <td className="px-3 py-2 font-mono font-semibold text-violet-900">{job.brandOdcNumber ?? "—"}</td>
              </tr>
              {transferDcLabel ? (
                <tr className="border-b border-violet-50">
                  <th className="bg-violet-50/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-800">
                    Transfer DC
                  </th>
                  <td className="px-3 py-2 font-mono text-stone-800">{transferDcLabel}</td>
                </tr>
              ) : null}
              <tr>
                <th className="bg-violet-50/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-800">
                  E-way bill
                </th>
                <td className="px-3 py-2">
                  {ewayBillNo ? (
                    <div>
                      <p className="font-mono text-base font-bold text-emerald-800">{ewayBillNo}</p>
                      {ewayValidUpto ? (
                        <p className="mt-0.5 text-xs text-stone-600">Valid until {ewayValidUpto}</p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-stone-500">No e-way bill on this dispatch</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {ewayPdfUrl ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-emerald-200 bg-stone-50">
            <p className="border-b border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-emerald-900">
              GST e-way bill PDF (API response)
            </p>
            <iframe title="GST e-way bill PDF" src={ewayPdfUrl} className="h-64 w-full bg-white" />
          </div>
        ) : ewayBillNo ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            E-way bill number is saved, but the GST PDF URL was not stored on this record (older generate). Regenerate
            e-way on a new dispatch to capture the PDF response.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className={btnPrimary}
            onClick={() => printBrandDispatchDocument(job)}
            disabled={!job.brandOdcNumber && !job.brandDispatchRef}
          >
            Print brand ODC / DC
          </button>
          {onPrintTransferDc && transferDcLabel ? (
            <button type="button" className={btnSecondary} onClick={onPrintTransferDc}>
              Print transfer DC ({transferDcLabel})
            </button>
          ) : null}
          {canCreateBrandEway ? (
            <button type="button" className={btnSecondary} onClick={() => setEwayOpen(true)}>
              Create e-way bill
            </button>
          ) : null}
          {ewayPdfUrl ? (
            <a href={ewayPdfUrl} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
              Open GST e-way bill PDF
            </a>
          ) : null}
          <button type="button" className={btnSecondary} onClick={onClose}>
            Done
          </button>
        </div>
      </div>

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
    </div>
  );
}
