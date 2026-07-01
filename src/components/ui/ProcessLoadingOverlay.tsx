import { useEffect, useState } from "react";
import { LOTTIE_APP_LOADING } from "../../lib/lottieAssets";
import { prefetchLottieAnimation } from "../../lib/lottieCache";
import { LottieAnimation } from "./LottieAnimation";

type Props = {
  open: boolean;
  title: string;
  hint?: string;
  statusMessages?: string[];
  statusIntervalMs?: number;
};

export function ProcessLoadingOverlay({
  open,
  title,
  hint,
  statusMessages,
  statusIntervalMs = 2200,
}: Props) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    prefetchLottieAnimation(LOTTIE_APP_LOADING);
  }, []);

  useEffect(() => {
    if (!open) {
      setMsgIdx(0);
      return;
    }
    if (!statusMessages?.length) return;
    const id = window.setInterval(
      () => setMsgIdx((i) => (i + 1) % statusMessages.length),
      statusIntervalMs,
    );
    return () => window.clearInterval(id);
  }, [open, statusMessages, statusIntervalMs]);

  if (!open) return null;

  const statusLine = statusMessages?.length ? statusMessages[msgIdx] : null;

  return (
    <div
      className="fixed inset-0 z-[210] flex flex-col items-center justify-center bg-stone-900/75 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="process-loading-title"
      aria-busy="true"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white px-6 py-8 text-center shadow-2xl">
        <LottieAnimation
          src={LOTTIE_APP_LOADING}
          className="mx-auto h-44 w-44"
          ariaLabel={title}
        />
        <h2 id="process-loading-title" className="mt-2 text-base font-semibold text-zimson-950">
          {title}
        </h2>
        {statusLine ? (
          <p className="mt-2 text-sm font-medium text-zimson-700 transition-opacity">{statusLine}</p>
        ) : null}
        {hint ? <p className="mt-2 text-sm text-stone-600">{hint}</p> : null}
      </div>
    </div>
  );
}
