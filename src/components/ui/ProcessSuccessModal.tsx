import type { ReactNode } from "react";
import { AppModal } from "./AppModal";
import { modalFooterClass } from "../../lib/appModalStyles";
import { HomeLink, homeLinkIconClass } from "./HomeLink";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  actions: ReactNode;
  onBackdropClick?: () => void;
  /** `premium` uses navy/gold styling (default for success flows) */
  tone?: "success" | "premium";
  /** Adds a Home link to the footer; turn off when `actions` already has one. */
  showHome?: boolean;
};

export function ProcessSuccessModal({
  open,
  title,
  description,
  children,
  actions,
  onBackdropClick,
  tone = "success",
  showHome = true,
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
      footer={
        <div className={modalFooterClass}>
          {showHome ? <HomeLink className={`${homeLinkIconClass} mr-auto`} /> : null}
          {actions}
        </div>
      }
    >
      {children}
    </AppModal>
  );
}
