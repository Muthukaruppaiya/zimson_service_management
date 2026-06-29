import { useRef } from "react";
import { SRF_DOCUMENT_ACCEPT, validateBrandMailFile } from "../../lib/brandMailUpload";

type Props = {
  file: File | null;
  onChange: (file: File | null) => void;
  required?: boolean;
  disabled?: boolean;
  label?: string;
  hint?: string;
  error?: string | null;
};

export function BrandMailAttachmentField({
  file,
  onChange,
  required = false,
  disabled = false,
  label,
  hint,
  error,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const title = label ?? (required ? "Upload brand mail / document *" : "Upload brand mail / document (optional)");

  return (
    <div>
      <p className="text-sm font-medium text-stone-700">{title}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-stone-500">{hint}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={SRF_DOCUMENT_ACCEPT}
          disabled={disabled}
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            if (!picked) {
              onChange(null);
              return;
            }
            const validationError = validateBrandMailFile(picked);
            if (validationError) {
              onChange(null);
              e.target.value = "";
              return;
            }
            onChange(picked);
          }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50"
        >
          Choose file
        </button>
        {file ? (
          <>
            <span className="max-w-[14rem] truncate text-xs text-stone-700" title={file.name}>
              {file.name}
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="text-xs font-semibold text-rose-700 hover:underline"
            >
              Remove
            </button>
          </>
        ) : (
          <span className="text-xs text-stone-500">PDF or image · max 10 MB</span>
        )}
      </div>
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
