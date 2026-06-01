import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LOTTIE_WHATSAPP_SENDING } from "../../lib/lottieAssets";
import { LottieAnimation } from "../ui/LottieAnimation";
import { ProcessSuccessModal } from "../ui/ProcessSuccessModal";

type SendOutcome = { ok: true; message: string } | { ok: false; message: string };

type WhatsAppSendContextValue = {
  /** Blocks the UI with sending animation until the task finishes, then shows success or error. */
  runWhatsAppSend: (task: () => Promise<SendOutcome>) => Promise<void>;
  sending: boolean;
};

const WhatsAppSendContext = createContext<WhatsAppSendContextValue | null>(null);

export function WhatsAppSendProvider({ children }: { children: ReactNode }) {
  const [sending, setSending] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const runWhatsAppSend = useCallback(async (task: () => Promise<SendOutcome>) => {
    setSending(true);
    setSuccessOpen(false);
    setErrorOpen(false);
    try {
      const outcome = await task();
      if (outcome.ok) {
        setSuccessMessage(outcome.message);
        setSuccessOpen(true);
      } else {
        setErrorMessage(outcome.message);
        setErrorOpen(true);
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Could not send on WhatsApp.");
      setErrorOpen(true);
    } finally {
      setSending(false);
    }
  }, []);

  const value = useMemo(
    () => ({ runWhatsAppSend, sending }),
    [runWhatsAppSend, sending],
  );

  return (
    <WhatsAppSendContext.Provider value={value}>
      {children}

      {sending ? (
        <div
          className="fixed inset-0 z-[220] flex flex-col items-center justify-center bg-stone-900/75 px-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wa-sending-title"
          aria-busy="true"
        >
          <div className="w-full max-w-xs rounded-2xl bg-white px-6 py-8 text-center shadow-2xl">
            <LottieAnimation
              src={LOTTIE_WHATSAPP_SENDING}
              className="mx-auto h-44 w-44"
              ariaLabel="Sending on WhatsApp"
            />
            <h2 id="wa-sending-title" className="mt-2 text-base font-semibold text-zimson-950">
              Sending on WhatsApp…
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              Please wait until delivery completes. Do not close this screen.
            </p>
          </div>
        </div>
      ) : null}

      <ProcessSuccessModal
        open={successOpen}
        title="WhatsApp sent successfully"
        description={successMessage || "Your message was delivered to the customer."}
        onBackdropClick={undefined}
        actions={
          <button
            type="button"
            className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 sm:w-auto"
            onClick={() => setSuccessOpen(false)}
          >
            OK
          </button>
        }
      />

      <ProcessSuccessModal
        open={errorOpen}
        title="WhatsApp could not be sent"
        description={errorMessage}
        onBackdropClick={undefined}
        actions={
          <button
            type="button"
            className="inline-flex w-full min-w-0 items-center justify-center rounded-xl bg-zimson-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700 sm:w-auto"
            onClick={() => setErrorOpen(false)}
          >
            OK
          </button>
        }
      />
    </WhatsAppSendContext.Provider>
  );
}

export function useWhatsAppSend(): WhatsAppSendContextValue {
  const ctx = useContext(WhatsAppSendContext);
  if (!ctx) {
    throw new Error("useWhatsAppSend must be used within WhatsAppSendProvider");
  }
  return ctx;
}
