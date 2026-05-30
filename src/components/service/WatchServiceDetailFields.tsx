import { WatchCatalogSinglePicker } from "./WatchCatalogSinglePicker";
import {
  NATURE_OF_REPAIR_OPTIONS,
  normalizeNatureOfRepair,
  natureOfRepairLabel,
} from "../../lib/natureOfRepair";
import { parseWatchCatalogMultiValue } from "../../lib/watchCatalogMulti";
import { sanitizeMultilineTextInput, sanitizeTextInput } from "../../lib/inputSanitize";

export type WatchServiceDetailValues = {
  caseType: string;
  strapChainType: string;
  natureOfRepair: string;
  chainCount: string;
  customerRemarks: string;
};

export function emptyWatchServiceDetailValues(): WatchServiceDetailValues {
  return {
    caseType: "",
    strapChainType: "",
    natureOfRepair: "",
    chainCount: "",
    customerRemarks: "",
  };
}

function singleCatalogFromApi(raw: string | null | undefined): string {
  const parts = parseWatchCatalogMultiValue(raw ?? "");
  return parts[0] ?? String(raw ?? "").trim();
}

export function watchServiceDetailsFromApi(row: {
  caseType?: string | null;
  strapChainType?: string | null;
  natureOfRepair?: string | null;
  chainCount?: string | null;
  customerRemarks?: string | null;
}): WatchServiceDetailValues {
  return {
    caseType: singleCatalogFromApi(row.caseType),
    strapChainType: singleCatalogFromApi(row.strapChainType),
    natureOfRepair: normalizeNatureOfRepair(row.natureOfRepair),
    chainCount: row.chainCount?.trim() ?? "",
    customerRemarks: row.customerRemarks?.trim() ?? "",
  };
}

export function watchServiceDetailsToApiPayload(v: WatchServiceDetailValues) {
  return {
    caseType: v.caseType.trim(),
    strapChainType: v.strapChainType.trim(),
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
  const taxNote =
    NATURE_OF_REPAIR_OPTIONS.find((o) => o.value === values.natureOfRepair)?.taxNote ?? "";

  return (
    <>
      <div className={pairRow}>
        <WatchCatalogSinglePicker
          kind="case-types"
          idPrefix={idPrefix}
          inputClass={inputClass}
          disabled={disabled}
          value={values.caseType}
          onChange={(caseType) => onChange({ caseType })}
        />
        <WatchCatalogSinglePicker
          kind="strap-chain-types"
          idPrefix={idPrefix}
          inputClass={inputClass}
          disabled={disabled}
          value={values.strapChainType}
          onChange={(strapChainType) => onChange({ strapChainType })}
        />
      </div>
      <div className={pairRow}>
        <div className="min-w-0">
          <label htmlFor={`${idPrefix}-nature-repair`} className="text-xs font-medium text-stone-600">
            Nature of repair
          </label>
          <select
            id={`${idPrefix}-nature-repair`}
            value={values.natureOfRepair}
            disabled={disabled}
            onChange={(e) => onChange({ natureOfRepair: e.target.value })}
            className={inputClass}
          >
            <option value="">Select nature of repair…</option>
            {NATURE_OF_REPAIR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.taxNote})
              </option>
            ))}
          </select>
          {values.natureOfRepair ? (
            <p className="mt-1 text-[10px] text-stone-500">
              Invoice: {natureOfRepairLabel(values.natureOfRepair)}
              {taxNote ? ` · ${taxNote}` : ""}
            </p>
          ) : null}
        </div>
        <div className="min-w-0">
          <label htmlFor={`${idPrefix}-chain-count`} className="text-xs font-medium text-stone-600">
            Chain count
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
          Customer remarks
        </label>
        <textarea
          id={`${idPrefix}-cust-remarks`}
          rows={2}
          disabled={disabled}
          value={values.customerRemarks}
          onChange={(e) => onChange({ customerRemarks: sanitizeMultilineTextInput(e.target.value) })}
          className={inputClass}
          placeholder="Optional notes from customer"
        />
      </div>
    </>
  );
}
