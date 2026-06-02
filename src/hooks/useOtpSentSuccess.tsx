import { useCallback, useEffect, useState } from "react";
import { OtpSentSuccessModal } from "../components/ui/OtpSentSuccessModal";

const AUTO_DISMISS_MS = 2800;

type OtpSentState = {
  open: boolean;
  subtitle: string;
};

const initial: OtpSentState = { open: false, subtitle: "" };

export function useOtpSentSuccess() {
  const [state, setState] = useState<OtpSentState>(initial);

  const closeOtpSent = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const showOtpSent = useCallback((subtitle?: string) => {
    setState({ open: true, subtitle: subtitle?.trim() ?? "" });
  }, []);

  useEffect(() => {
    if (!state.open) return;
    const t = window.setTimeout(closeOtpSent, AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [state.open, closeOtpSent]);

  const otpSentModal = (
    <OtpSentSuccessModal open={state.open} subtitle={state.subtitle} onClose={closeOtpSent} />
  );

  return { showOtpSent, closeOtpSent, otpSentModal };
}
