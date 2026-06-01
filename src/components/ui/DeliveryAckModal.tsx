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
  if (!open) return null;

  const isSuccess = variant === "success";

  return (
    <div
      className="fixed inset-0 z-[230] flex items-center justify-center bg-stone-900/70 p-4 backdrop-blur-sm print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-ack-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white px-6 py-8 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl font-bold shadow-md ${
            isSuccess ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
          }`}
          aria-hidden
        >
          {isSuccess ? "✓" : "!"}
        </div>
        <h2 id="delivery-ack-title" className="mt-5 text-lg font-semibold text-stone-900">
          {title}
        </h2>
        {message ? <p className="mt-2 text-sm leading-relaxed text-stone-600">{message}</p> : null}
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            className="min-w-[8rem] rounded-xl bg-zimson-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zimson-700"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
