import { WatchCatalogMultiPicker } from "./WatchCatalogMultiPicker";
import { sanitizeTextInput } from "../../lib/inputSanitize";
import { formatWatchCatalogMultiValue, parseWatchCatalogMultiValue } from "../../lib/watchCatalogMulti";

export type WatchServiceDetailValues = {
  caseTypes: string[];
  strapChainTypes: string[];
  natureOfRepair: string;
  chainCount: string;
  customerRemarks: string;
};

export function emptyWatchServiceDetailValues(): WatchServiceDetailValues {
  return {
    caseTypes: [],
    strapChainTypes: [],
    natureOfRepair: "",
    chainCount: "",
    customerRemarks: "",
  };
}

export function watchServiceDetailsFromApi(row: {
  caseType?: string | null;
  strapChainType?: string | null;
  natureOfRepair?: string | null;
  chainCount?: string | null;
  customerRemarks?: string | null;
}): WatchServiceDetailValues {
  return {
    caseTypes: parseWatchCatalogMultiValue(row.caseType ?? ""),
    strapChainTypes: parseWatchCatalogMultiValue(row.strapChainType ?? ""),
    natureOfRepair: row.natureOfRepair?.trim() ?? "",
    chainCount: row.chainCount?.trim() ?? "",
    customerRemarks: row.customerRemarks?.trim() ?? "",
  };
}

export function watchServiceDetailsToApiPayload(v: WatchServiceDetailValues) {
  return {
    caseType: formatWatchCatalogMultiValue(v.caseTypes),
    strapChainType: formatWatchCatalogMultiValue(v.strapChainTypes),
    natureOfRepair: v.natureOfRepair.trim(),
    chainCount: v.chainCount.trim(),
    customerRemarks: v.customerRemarks.trim(),
  };
}

type Props = {
  idPrefix: string;
  values: WatchServiceDetailValues;
  onChange: (patch: Partial<WatchServiceDetailValues>) => void;
  inputClass: string;
  disabled?: boolean;
  apiMode?: boolean;
};

export function WatchServiceDetailFields({
  idPrefix,
  values,
  onChange,
  inputClass,
  disabled,
}: Props) {
  const pairRow = "grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 md:items-start";

  return (
    <>
      <div className={pairRow}>
        <WatchCatalogMultiPicker
          kind="case-types"
          idPrefix={idPrefix}
          inputClass={inputClass}
          disabled={disabled}
          selected={values.caseTypes}
          onChange={(caseTypes) => onChange({ caseTypes })}
        />
        <WatchCatalogMultiPicker
          kind="strap-chain-types"
          idPrefix={idPrefix}
          inputClass={inputClass}
          disabled={disabled}
          selected={values.strapChainTypes}
          onChange={(strapChainTypes) => onChange({ strapChainTypes })}
        />
      </div>
      <div className={pairRow}>
        <div className="min-w-0">
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
        <div className="min-w-0">
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
      </div>
      <div className="min-w-0">
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
