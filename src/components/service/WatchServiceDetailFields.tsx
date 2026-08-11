import type { ReactNode } from "react";
import { WatchCatalogSinglePicker } from "./WatchCatalogSinglePicker";
import { NATURE_OF_REPAIR_OPTIONS, normalizeNatureOfRepair } from "../../lib/natureOfRepair";
import { parseWatchCatalogMultiValue } from "../../lib/watchCatalogMulti";
import { sanitizeMultilineTextInput, sanitizeTextInput } from "../../lib/inputSanitize";

export type WatchServiceDetailValues = {
  caseType: string;
  strapChainType: string;
  natureOfRepair: string;
  chainCount12Phase: string;
  chainCount6Phase: string;
  customerRemarks: string;
};

export function emptyWatchServiceDetailValues(): WatchServiceDetailValues {
  return {
    caseType: "",
    strapChainType: "",
    natureOfRepair: "",
    chainCount12Phase: "",
    chainCount6Phase: "",
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
  chainCount12Phase?: string | null;
  chainCount6Phase?: string | null;
  /** @deprecated Legacy single chain count — mapped to 12 phase when new fields empty. */
  chainCount?: string | null;
  customerRemarks?: string | null;
}): WatchServiceDetailValues {
  const legacyChain = row.chainCount?.trim() ?? "";
  return {
    caseType: singleCatalogFromApi(row.caseType),
    strapChainType: singleCatalogFromApi(row.strapChainType),
    natureOfRepair: normalizeNatureOfRepair(row.natureOfRepair),
    chainCount12Phase: row.chainCount12Phase?.trim() || legacyChain,
    chainCount6Phase: row.chainCount6Phase?.trim() ?? "",
    customerRemarks: row.customerRemarks?.trim() ?? "",
  };
}

export function watchServiceDetailsToApiPayload(v: WatchServiceDetailValues) {
  return {
    caseType: v.caseType.trim(),
    strapChainType: v.strapChainType.trim(),
    natureOfRepair: v.natureOfRepair.trim(),
    chainCount12Phase: v.chainCount12Phase.trim(),
    chainCount6Phase: v.chainCount6Phase.trim(),
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
  stockWatchStoreOptions?: { id: string; name: string }[];
  stockWatchStoreId?: string;
  onStockWatchStoreChange?: (storeId: string) => void;
  /** 2 = default pairs; 3 = denser SRF booking layout. */
  columns?: 2 | 3;
  /** Optional field(s) inserted at the start of the first detail row (e.g. Serial). */
  leadingFields?: ReactNode;
};

export function WatchServiceDetailFields({
  idPrefix,
  values,
  onChange,
  inputClass,
  disabled,
  stockWatchStoreOptions = [],
  stockWatchStoreId = "",
  onStockWatchStoreChange,
  columns = 2,
  leadingFields,
}: Props) {
  const dense = columns === 3;
  const pairRow = dense
    ? "grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3 md:items-start"
    : "grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:items-start";
  const isStockWatch = normalizeNatureOfRepair(values.natureOfRepair) === "internal_service";

  const casePicker = (
    <WatchCatalogSinglePicker
      kind="case-types"
      idPrefix={idPrefix}
      inputClass={inputClass}
      disabled={disabled}
      value={values.caseType}
      onChange={(caseType) => onChange({ caseType })}
    />
  );
  const strapPicker = (
    <WatchCatalogSinglePicker
      kind="strap-chain-types"
      idPrefix={idPrefix}
      inputClass={inputClass}
      disabled={disabled}
      value={values.strapChainType}
      onChange={(strapChainType) => onChange({ strapChainType })}
    />
  );
  const natureField = (
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
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
  const chain12 = (
    <div className="min-w-0">
      <label htmlFor={`${idPrefix}-chain-count-12`} className="text-xs font-medium text-stone-600">
        12 Side Count
      </label>
      <input
        id={`${idPrefix}-chain-count-12`}
        value={values.chainCount12Phase}
        disabled={disabled}
        onChange={(e) => onChange({ chainCount12Phase: sanitizeTextInput(e.target.value, 32) })}
        className={inputClass}
        placeholder="e.g. 12"
        inputMode="numeric"
      />
    </div>
  );
  const chain6 = (
    <div className="min-w-0">
      <label htmlFor={`${idPrefix}-chain-count-6`} className="text-xs font-medium text-stone-600">
        6 Side Count
      </label>
      <input
        id={`${idPrefix}-chain-count-6`}
        value={values.chainCount6Phase}
        disabled={disabled}
        onChange={(e) => onChange({ chainCount6Phase: sanitizeTextInput(e.target.value, 32) })}
        className={inputClass}
        placeholder="e.g. 6"
        inputMode="numeric"
      />
    </div>
  );

  return (
    <>
      {dense ? (
        <>
          <div className={pairRow}>
            {leadingFields}
            {casePicker}
            {strapPicker}
          </div>
          <div className={pairRow}>
            {natureField}
            {chain12}
            {chain6}
          </div>
        </>
      ) : (
        <>
          {leadingFields ? <div className={pairRow}>{leadingFields}</div> : null}
          <div className={pairRow}>
            {casePicker}
            {strapPicker}
          </div>
          <div className={pairRow}>{natureField}</div>
          <div className={pairRow}>
            {chain12}
            {chain6}
          </div>
        </>
      )}
      {isStockWatch && onStockWatchStoreChange ? (
        <div className={pairRow}>
          <div className="min-w-0">
            <label htmlFor={`${idPrefix}-stock-watch-store`} className="text-xs font-medium text-stone-600">
              Stock watch location (store)
            </label>
            <select
              id={`${idPrefix}-stock-watch-store`}
              value={stockWatchStoreId}
              disabled={disabled || stockWatchStoreOptions.length === 0}
              onChange={(e) => onStockWatchStoreChange(e.target.value)}
              className={inputClass}
            >
              <option value="">Select store…</option>
              {stockWatchStoreOptions.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-cust-remarks`} className="text-xs font-medium text-stone-600">
          Customer Remarks
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
