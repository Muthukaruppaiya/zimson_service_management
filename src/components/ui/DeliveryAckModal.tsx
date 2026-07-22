import { AppModal } from "./AppModal";
import { modalBtnPrimary, modalFooterClass } from "../../lib/appModalStyles";

type Props = {
  open: boolean;
  variant?: "success" | "error";
  title: string;
  message?: string;
  onClose: () => void;
};

export function DeliveryAckModal({
  open,
  variant = "success",
  title,
  message,
  onClose,
}: Props) {
  const isSuccess = variant === "success";

  return (
    <AppModal
      open={open}
      onClose={onClose}
      eyebrow={isSuccess ? "Completed" : "Notice"}
      title={title}
      size="sm"
      zIndex={230}
      closeOnBackdrop={false}
      footer={
        <div className={`${modalFooterClass} justify-center`}>
          <button type="button" className={modalBtnPrimary} onClick={onClose}>
            OK
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center py-2 text-center">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl font-bold shadow-md ${
            isSuccess ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
          }`}
          aria-hidden
        >
          {isSuccess ? "✓" : "!"}
        </div>
        {message ? <p className="mt-4 text-sm leading-relaxed text-slate-600">{message}</p> : null}
      </div>
    </AppModal>
  );
}
