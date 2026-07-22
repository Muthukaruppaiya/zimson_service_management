import type { ReactNode } from "react";
import { AppModal } from "./AppModal";
import { modalFooterClass } from "../../lib/appModalStyles";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  actions: ReactNode;
  onBackdropClick?: () => void;
  /** `premium` uses navy/gold styling (default for success flows) */
  tone?: "success" | "premium";
};

export function ProcessSuccessModal({
  open,
  title,
  description,
  children,
  actions,
  onBackdropClick,
  tone = "success",
}: Props) {
  const premium = tone === "premium" || tone === "success";

  return (
    <AppModal
      open={open}
      onClose={() => {
        if (onBackdropClick) onBackdropClick();
      }}
      eyebrow={premium ? "Success" : "Notice"}
      title={title}
      description={description}
      size="md"
      zIndex={100}
      closeOnBackdrop={Boolean(onBackdropClick)}
      footer={<div className={modalFooterClass}>{actions}</div>}
    >
      {children}
    </AppModal>
  );
}
