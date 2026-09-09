import type { CustomFieldDefinition, CustomFieldValues } from "../../types/customField";

const defaultInput =
  "mt-1 w-full border border-rlx-rule bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-rlx-green";
const defaultLabel = "block text-[11px] font-semibold uppercase tracking-widest text-stone-500";

export function CustomFieldsSection({
  fields,
  values,
  onChange,
  title = "Custom fields",
  inputClass = defaultInput,
  labelClass = defaultLabel,
  variant = "card",
}: {
  fields: CustomFieldDefinition[];
  values: CustomFieldValues;
  onChange: (next: CustomFieldValues) => void;
  title?: string;
  inputClass?: string;
  labelClass?: string;
  variant?: "card" | "plain" | "grid";
}) {
  const active = fields.filter((f) => f.isActive);
  if (active.length === 0) return null;

  function setValue(key: string, value: string | boolean | number) {
    onChange({ ...values, [key]: value });
  }

  const body = (
    <div className={variant === "grid" ? "grid gap-4 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-2"}>
      {active.map((f) => {
        const raw = values[f.fieldKey];
        const str = raw == null ? "" : String(raw);
        return (
          <label key={f.id} className={f.fieldType === "textarea" || f.fieldType === "checkbox" ? "sm:col-span-2" : ""}>
            <span className={labelClass}>
              {f.label}
              {f.required ? " *" : ""}
            </span>
            {f.helpText ? <p className="mt-0.5 text-[11px] text-stone-400">{f.helpText}</p> : null}
            {f.fieldType === "textarea" ? (
              <textarea
                className={inputClass}
                rows={3}
                value={str}
                onChange={(e) => setValue(f.fieldKey, e.target.value)}
              />
            ) : f.fieldType === "dropdown" ? (
              <select className={inputClass} value={str} onChange={(e) => setValue(f.fieldKey, e.target.value)}>
                <option value="">Select…</option>
                {f.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : f.fieldType === "checkbox" ? (
              <span className="mt-2 flex items-center gap-2 text-sm text-stone-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-rlx-green"
                  checked={raw === true || raw === "true"}
                  onChange={(e) => setValue(f.fieldKey, e.target.checked)}
                />
                Yes
              </span>
            ) : (
              <input
                className={inputClass}
                type={f.fieldType === "number" ? "number" : f.fieldType === "date" ? "date" : f.fieldType === "email" ? "email" : f.fieldType === "phone" ? "tel" : "text"}
                value={str}
                onChange={(e) =>
                  setValue(f.fieldKey, f.fieldType === "number" ? e.target.value : e.target.value)
                }
              />
            )}
          </label>
        );
      })}
    </div>
  );

  if (variant === "plain" || variant === "grid") return body;

  return (
    <div className="border border-rlx-rule bg-white shadow-sm">
      <div className="border-b border-rlx-rule bg-rlx-green px-5 py-4">
        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">{title}</h3>
        <p className="mt-0.5 text-[11px] text-white/55">Extra fields configured in Settings → Custom fields.</p>
      </div>
      <div className="p-5">{body}</div>
    </div>
  );
}
