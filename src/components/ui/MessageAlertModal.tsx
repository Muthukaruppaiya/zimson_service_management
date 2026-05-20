type MessageAlertModalProps = {
  open: boolean;
  title?: string;
  message: string;
  onClose: () => void;
  confirmLabel?: string;
};

export function MessageAlertModal({
  open,
  title = "Notice",
  message,
  onClose,
  confirmLabel = "OK",
}: MessageAlertModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="message-alert-title"
      aria-describedby="message-alert-body"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-red-200 bg-red-50 px-5 py-4">
          <h2 id="message-alert-title" className="text-base font-bold text-red-900">
            {title}
          </h2>
        </div>
        <p id="message-alert-body" className="px-5 py-4 text-sm leading-relaxed text-stone-800">
          {message}
        </p>
        <div className="flex justify-end border-t border-stone-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-zimson-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zimson-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
