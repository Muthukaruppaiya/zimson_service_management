import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LOTTIE_WHATSAPP_SENDING } from "../../lib/lottieAssets";
import { DeliveryAckModal } from "../ui/DeliveryAckModal";
import { LottieAnimation } from "../ui/LottieAnimation";

export type SendOutcome = { ok: true; message: string } | { ok: false; message: string };

type SendChannel = "whatsapp" | "email";

type MessagingSendContextValue = {
  runWhatsAppSend: (task: () => Promise<SendOutcome>) => Promise<void>;
  runEmailSend: (task: () => Promise<SendOutcome>) => Promise<void>;
  sending: boolean;
  whatsappSending: boolean;
  emailSending: boolean;
};

const MessagingSendContext = createContext<MessagingSendContextValue | null>(null);

const SENDING_COPY: Record<
  SendChannel,
  { title: string; hint: string; successTitle: string; errorTitle: string }
> = {
  whatsapp: {
    title: "Sending on WhatsApp…",
    hint: "Please wait until delivery completes. Do not close this screen.",
    successTitle: "WhatsApp sent successfully",
    errorTitle: "WhatsApp could not be sent",
  },
  email: {
    title: "Sending email…",
    hint: "Please wait until the invoice email is delivered. Do not close this screen.",
    successTitle: "Email sent successfully",
    errorTitle: "Email could not be sent",
  },
};

export function WhatsAppSendProvider({ children }: { children: ReactNode }) {
  const [channel, setChannel] = useState<SendChannel | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successTitle, setSuccessTitle] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorTitle, setErrorTitle] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const runSend = useCallback(async (kind: SendChannel, task: () => Promise<SendOutcome>) => {
    const copy = SENDING_COPY[kind];
    setChannel(kind);
    setSuccessOpen(false);
    setErrorOpen(false);
    try {
      const outcome = await task();
      if (outcome.ok) {
        setSuccessTitle(copy.successTitle);
        setSuccessMessage(outcome.message);
        setSuccessOpen(true);
      } else {
        setErrorTitle(copy.errorTitle);
        setErrorMessage(outcome.message);
        setErrorOpen(true);
      }
    } catch (e) {
      setErrorTitle(copy.errorTitle);
      setErrorMessage(
        e instanceof Error
          ? e.message
          : kind === "whatsapp"
            ? "Could not send on WhatsApp."
            : "Could not send email.",
      );
      setErrorOpen(true);
    } finally {
      setChannel(null);
    }
  }, []);

  const runWhatsAppSend = useCallback(
    (task: () => Promise<SendOutcome>) => runSend("whatsapp", task),
    [runSend],
  );

  const runEmailSend = useCallback(
    (task: () => Promise<SendOutcome>) => runSend("email", task),
    [runSend],
  );

  const sending = channel !== null;
  const value = useMemo(
    () => ({
      runWhatsAppSend,
      runEmailSend,
      sending,
      whatsappSending: channel === "whatsapp",
      emailSending: channel === "email",
    }),
    [runWhatsAppSend, runEmailSend, sending, channel],
  );

  const sendingCopy = channel ? SENDING_COPY[channel] : null;

  return (
    <MessagingSendContext.Provider value={value}>
      {children}

      {sending && sendingCopy ? (
        <div
          className="fixed inset-0 z-[220] flex flex-col items-center justify-center bg-stone-900/75 px-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="msg-sending-title"
          aria-busy="true"
        >
          <div className="w-full max-w-xs rounded-2xl bg-white px-6 py-8 text-center shadow-2xl">
            <LottieAnimation
              src={LOTTIE_WHATSAPP_SENDING}
              className="mx-auto h-44 w-44"
              ariaLabel={sendingCopy.title}
            />
            <h2 id="msg-sending-title" className="mt-2 text-base font-semibold text-zimson-950">
              {sendingCopy.title}
            </h2>
            <p className="mt-2 text-sm text-stone-600">{sendingCopy.hint}</p>
          </div>
        </div>
      ) : null}

      <DeliveryAckModal
        open={successOpen}
        variant="success"
        title={successTitle}
        message={successMessage || undefined}
        onClose={() => setSuccessOpen(false)}
      />

      <DeliveryAckModal
        open={errorOpen}
        variant="error"
        title={errorTitle}
        message={errorMessage || undefined}
        onClose={() => setErrorOpen(false)}
      />
    </MessagingSendContext.Provider>
  );
}

export function useMessagingSend(): MessagingSendContextValue {
  const ctx = useContext(MessagingSendContext);
  if (!ctx) {
    throw new Error("useMessagingSend must be used within WhatsAppSendProvider");
  }
  return ctx;
}

/** @deprecated Use useMessagingSend — kept for existing call sites. */
export function useWhatsAppSend(): Pick<
  MessagingSendContextValue,
  "runWhatsAppSend" | "sending" | "whatsappSending"
> {
  const { runWhatsAppSend, sending, whatsappSending } = useMessagingSend();
  return { runWhatsAppSend, sending: whatsappSending || sending, whatsappSending };
}

export function useEmailSend(): Pick<
  MessagingSendContextValue,
  "runEmailSend" | "sending" | "emailSending"
> {
  const { runEmailSend, sending, emailSending } = useMessagingSend();
  return { runEmailSend, sending: emailSending || sending, emailSending };
}
