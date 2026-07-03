import type { QuickBillEdocInfo } from "../../types/quickBill";
import { resolveEinvoiceDocumentUrl } from "../../lib/einvoicePortal";

type Props = {
  edoc: QuickBillEdocInfo | null | undefined;
  storedIrn?: string | null;
  storedPdfUrl?: string | null;
  /** Primary action button classes (modal footer). */
  actionBtnClass: string;
  onGenerate?: () => void;
  generating?: boolean;
};

export function QuickBillEinvoiceStatus({ edoc, storedIrn }: Pick<Props, "edoc" | "storedIrn">) {
  const irn = (edoc?.irn ?? storedIrn)?.trim() || null;

  if (!edoc && !irn) return null;

  const tone = edoc?.ok
    ? "bg-emerald-50 text-emerald-950 ring-emerald-200"
    : edoc?.skipped
      ? "bg-stone-50 text-stone-700 ring-stone-200"
      : edoc?.pending
        ? "bg-sky-50 text-sky-950 ring-sky-200"
        : "bg-amber-50 text-amber-950 ring-amber-200";

  return (
    <div className={`mt-3 rounded-lg px-3 py-2 text-xs ring-1 ${tone}`}>
      {edoc?.ok && irn ? (
        <>
          <strong>E-invoice generated</strong>
          <p className="mt-1">
            IRN: <span className="font-mono break-all">{irn}</span>
          </p>
        </>
      ) : edoc?.skipped ? (
        <>
          <strong>E-invoice skipped:</strong> {edoc.skipReason ?? "Not applicable."}
        </>
      ) : edoc?.pending ? (
        <>
          <strong>E-invoice pending.</strong> GST portal (IRP) is slow or down — the app retries automatically
          every 90 seconds. Bill is saved; IRN will appear when IRP responds.
        </>
      ) : edoc ? (
        <>
          <strong>E-invoice not generated:</strong> {edoc.error ?? edoc.skipReason ?? "GST portal (IRP) error."}{" "}
          Bill is saved; use <strong>Generate e-invoice</strong> below or retry from quick bill history.
        </>
      ) : irn ? (
        <>
          <strong>E-invoice generated</strong>
          <p className="mt-1">
            IRN: <span className="font-mono break-all">{irn}</span>
          </p>
        </>
      ) : null}
    </div>
  );
}

export function QuickBillEinvoiceActions({
  edoc,
  storedIrn,
  storedPdfUrl,
  actionBtnClass,
  onGenerate,
  generating,
}: Props) {
  const irn = (edoc?.irn ?? storedIrn)?.trim() || null;
  const docUrl = resolveEinvoiceDocumentUrl({ pdfUrl: edoc?.pdfUrl ?? storedPdfUrl });
  const canGenerate = Boolean(onGenerate) && !irn && !edoc?.skipped && !edoc?.pending;

  if (!irn && !canGenerate) return null;

  return (
    <>
      {irn && docUrl ? (
        <a
          href={docUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${actionBtnClass} no-underline`}
        >
          Open e-invoice
        </a>
      ) : null}
      {canGenerate ? (
        <button type="button" className={actionBtnClass} disabled={generating} onClick={onGenerate}>
          {generating ? "Generating e-invoice…" : "Generate e-invoice"}
        </button>
      ) : null}
    </>
  );
}
