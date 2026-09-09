import { Link } from "react-router-dom";
import { ProcessSuccessModal } from "./ProcessSuccessModal";
import { modalBtnPrimary, modalBtnSecondary } from "../../lib/appModalStyles";

export type BulkImportSuccessStat = {
  label: string;
  value: number | string;
};

type Props = {
  open: boolean;
  entityLabel: string;
  description?: string;
  stats: BulkImportSuccessStat[];
  masterHref: string;
  masterLabel: string;
  onClose: () => void;
  onImportAnother: () => void;
};

export function BulkImportSuccessModal({
  open,
  entityLabel,
  description,
  stats,
  masterHref,
  masterLabel,
  onClose,
  onImportAnother,
}: Props) {
  return (
    <ProcessSuccessModal
      open={open}
      title="Imported successfully"
      description={description ?? `${entityLabel} have been saved.`}
      onBackdropClick={onClose}
      actions={
        <>
          <Link to={masterHref} className={modalBtnSecondary} onClick={onClose}>
            {masterLabel}
          </Link>
          <button type="button" className={modalBtnSecondary} onClick={onImportAnother}>
            Import another file
          </button>
          <button type="button" className={modalBtnPrimary} onClick={onClose}>
            OK
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-rlx-green">{s.value}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>
    </ProcessSuccessModal>
  );
}
