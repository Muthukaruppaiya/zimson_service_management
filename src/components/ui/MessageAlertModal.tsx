import { AppModal } from "./AppModal";
import { modalBtnPrimary, modalFooterClass } from "../../lib/appModalStyles";

type MessageAlertModalProps = {
  open: boolean;
  title?: string;
  message: string;
  onClose: () => void;
  confirmLabel?: string;
  variant?: "success" | "error" | "info";
};

const eyebrowByVariant: Record<NonNullable<MessageAlertModalProps["variant"]>, string> = {
  success: "Success",
  error: "Attention",
  info: "Information",
};

export function MessageAlertModal({
  open,
  title = "Notice",
  message,
  onClose,
  confirmLabel = "OK",
  variant = "error",
}: MessageAlertModalProps) {
  return (
    <AppModal
      open={open}
      onClose={onClose}
      eyebrow={eyebrowByVariant[variant]}
      title={title}
      size="sm"
      zIndex={130}
      footer={
        <div className={modalFooterClass}>
          <button type="button" onClick={onClose} className={modalBtnPrimary}>
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-slate-800">{message}</p>
    </AppModal>
  );
}
