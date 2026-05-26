import { sanitizeTextInput } from "../../lib/inputSanitize";

export type WatchServiceDetailValues = {
  caseType: string;
  strapChainType: string;
  natureOfRepair: string;
  chainCount: string;
  customerRemarks: string;
};

type Props = {
  idPrefix: string;
  values: WatchServiceDetailValues;
  onChange: (patch: Partial<WatchServiceDetailValues>) => void;
  inputClass: string;
  disabled?: boolean;
};

export function WatchServiceDetailFields({ idPrefix, values, onChange, inputClass, disabled }: Props) {
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-case-type`} className="text-xs font-medium text-stone-600">
          Case Type
        </label>
        <input
          id={`${idPrefix}-case-type`}
          value={values.caseType}
          disabled={disabled}
          onChange={(e) => onChange({ caseType: sanitizeTextInput(e.target.value, 120) })}
          className={inputClass}
          placeholder="e.g. Oyster, Jubilee"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-strap-chain`} className="text-xs font-medium text-stone-600">
          Strap / Chain Type
        </label>
        <input
          id={`${idPrefix}-strap-chain`}
          value={values.strapChainType}
          disabled={disabled}
          onChange={(e) => onChange({ strapChainType: sanitizeTextInput(e.target.value, 120) })}
          className={inputClass}
          placeholder="e.g. Steel bracelet, leather"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-nature-repair`} className="text-xs font-medium text-stone-600">
          Nature of Repair
        </label>
        <input
          id={`${idPrefix}-nature-repair`}
          value={values.natureOfRepair}
          disabled={disabled}
          onChange={(e) => onChange({ natureOfRepair: sanitizeTextInput(e.target.value, 240) })}
          className={inputClass}
          placeholder="e.g. Full service, battery only"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-chain-count`} className="text-xs font-medium text-stone-600">
          Chain Count
        </label>
        <input
          id={`${idPrefix}-chain-count`}
          value={values.chainCount}
          disabled={disabled}
          onChange={(e) => onChange({ chainCount: sanitizeTextInput(e.target.value, 32) })}
          className={inputClass}
          placeholder="e.g. 12"
          inputMode="numeric"
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${idPrefix}-cust-remarks`} className="text-xs font-medium text-stone-600">
          Customer Remarks
        </label>
        <textarea
          id={`${idPrefix}-cust-remarks`}
          rows={2}
          value={values.customerRemarks}
          disabled={disabled}
          onChange={(e) => onChange({ customerRemarks: sanitizeTextInput(e.target.value, 2000) })}
          className={inputClass}
          placeholder="Customer notes for this job"
        />
      </div>
    </>
  );
}
