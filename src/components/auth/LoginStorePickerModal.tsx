type LoginStorePickerModalProps = {
  open: boolean;
  stores: { id: string; name: string }[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: (storeId: string) => void;
};

export function LoginStorePickerModal({
  open,
  stores,
  busy = false,
  onClose,
  onConfirm,
}: LoginStorePickerModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-store-picker-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-sky-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-sky-100 bg-sky-50 px-5 py-4">
          <h2 id="login-store-picker-title" className="text-base font-semibold text-sky-950">
            Select your store
          </h2>
          <p className="mt-1 text-sm text-sky-900/80">
            Your account is linked to more than one store. Choose the location you are working from today.
          </p>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-5 py-4">
          <ul className="space-y-2">
            {stores.map((store) => (
              <li key={store.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onConfirm(store.id)}
                  className="flex w-full items-center justify-between rounded-xl border border-zimson-200 bg-white px-4 py-3 text-left text-sm font-semibold text-zimson-900 transition hover:border-sky-400 hover:bg-sky-50/60 disabled:opacity-60"
                >
                  <span>{store.name}</span>
                  <span className="text-xs font-medium text-sky-700">Select →</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-stone-200 px-5 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
