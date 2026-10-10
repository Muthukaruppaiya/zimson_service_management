type Props = {
  /** The sibling input's class (without `mt-1`), so the button matches its height exactly. */
  fieldClass: string;
  disabled: boolean;
  saving: boolean;
  title: string;
  onClick: () => void;
};

export function PickerSaveButton({ fieldClass, disabled, saving, title, onClick }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`${fieldClass} inline-flex shrink-0 items-center justify-center gap-1.5 font-semibold transition enabled:hover:border-rlx-green disabled:cursor-not-allowed disabled:opacity-50`}
      style={{ width: "auto" }}
    >
      <svg className="h-4 w-4 text-rlx-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-sm text-rlx-green">{saving ? "Saving…" : "Save"}</span>
    </button>
  );
}
