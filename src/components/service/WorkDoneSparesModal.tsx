import { SearchableCombobox, type ComboboxOption } from "./SearchableCombobox";
import { WorkDonePackagePicker, type WorkDoneSpareLine } from "./WorkDonePackagePicker";
import { AppModal } from "../ui/AppModal";
import { formatInr } from "../../lib/formatInr";
import type { SrfServicePackageSnapshot } from "../../types/servicePackage";

type JobSummary = {
  reference: string;
  customerName: string;
  watchBrand: string;
  watchModel: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  saveLabel: string;
  job: JobSummary | null;
  lines: WorkDoneSpareLine[];
  onLinesChange: (lines: WorkDoneSpareLine[]) => void;
  selectedPackage: SrfServicePackageSnapshot | null;
  onPackageChange: (pkg: SrfServicePackageSnapshot | null) => void;
  saving?: boolean;
  error?: string | null;
  onSave: () => void;
  spareOptions: ComboboxOption[];
  unitPrice: (spareId: string) => number;
  stockQty: (spareId: string) => number | undefined;
  stockLabel: string;
  onSparePicked?: (spareId: string) => void;
  onSpareChange?: (index: number, spareId: string) => void;
};

function spareDisplayName(options: ComboboxOption[], spareId: string) {
  const label = options.find((o) => o.value === spareId)?.label ?? spareId;
  return label.replace(/\s[·—-]\s(?:Out of stock|HO \d+|Stock \d+).*$/i, "").trim() || label;
}

export function WorkDoneSparesModal({
  open,
  onClose,
  title,
  saveLabel,
  job,
  lines,
  onLinesChange,
  selectedPackage,
  onPackageChange,
  saving,
  error,
  onSave,
  spareOptions,
  unitPrice,
  stockQty,
  stockLabel,
  onSparePicked,
  onSpareChange,
}: Props) {
  function updateLine(idx: number, patch: Partial<WorkDoneSpareLine>) {
    onLinesChange(lines.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  }

  function removeLine(idx: number) {
    if (lines.length <= 1) {
      onLinesChange([{ spareId: "", qty: "1" }]);
      return;
    }
    onLinesChange(lines.filter((_, i) => i !== idx));
  }

  const extraAmount = lines.reduce((sum, line) => {
    if (line.fromPackage || !line.spareId) return sum;
    const qty = Number(line.qty || 0);
    const unit = unitPrice(line.spareId);
    return sum + (unit > 0 && Number.isFinite(qty) ? unit * qty : 0);
  }, 0);
  const packageAmount = selectedPackage ? Number(selectedPackage.priceInr) || 0 : 0;
  const extraCount = lines.filter((l) => !l.fromPackage && l.spareId).length;

  return (
    <AppModal
      open={open}
      onClose={saving ? () => undefined : onClose}
      closeOnBackdrop={!saving}
      size="xl"
      zIndex={60}
      title={title}
      subtitle={job?.reference}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-xs text-slate-500">
            {selectedPackage ? (
              <span>
                Package {formatInr(packageAmount)}
                {extraCount > 0 ? ` + extra ${formatInr(extraAmount)}` : ""}
                <span className="mx-1.5 text-slate-300">·</span>
                <span className="font-semibold text-slate-800">{formatInr(packageAmount + extraAmount)}</span>
              </span>
            ) : extraAmount > 0 ? (
              <span>
                Extra spares <span className="font-semibold text-slate-800">{formatInr(extraAmount)}</span>
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="border border-rlx-rule bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="bg-rlx-green px-5 py-2 text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-rlx-green/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : saveLabel}
            </button>
          </div>
        </div>
      }
    >
      {error ? (
        <p className="mb-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        <WorkDonePackagePicker
          watchBrand={job?.watchBrand ?? ""}
          lines={lines}
          onLinesChange={onLinesChange}
          selected={selectedPackage}
          onSelectedChange={onPackageChange}
          disabled={saving}
        />

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Used spares</p>
          </div>
          <div className="space-y-2 p-3">
            {lines.map((line, idx) => {
              const qty = Number(line.qty || 0);
              const unit = line.spareId ? unitPrice(line.spareId) : 0;
              const stock = line.spareId ? stockQty(line.spareId) : undefined;
              const lineShort =
                line.spareId && stock != null && Number.isFinite(qty) && qty > 0 && qty > stock;
              const outOfStock = line.spareId && stock != null && stock <= 0;
              const noPrice = Boolean(line.spareId) && unit <= 0;
              const warn = Boolean(lineShort || outOfStock || noPrice);
              const fromPackage = Boolean(line.fromPackage);
              const amountLabel = fromPackage
                ? "Incl."
                : unit > 0
                  ? formatInr(unit * (Number.isFinite(qty) ? qty : 0))
                  : "—";
              const stockText = !line.spareId
                ? ""
                : `${stockLabel} ${stock != null ? stock : "…"}${outOfStock ? " · Out" : ""}${
                    lineShort && !outOfStock ? ` · need ${qty}` : ""
                  }${noPrice && !fromPackage ? " · no price" : ""}`;
              return (
                <div
                  key={`${idx}-${fromPackage ? "pkg" : "extra"}`}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                    warn
                      ? "border-rose-300 bg-rose-50/40"
                      : fromPackage
                        ? "border-rlx-green/25 bg-rlx-green/[0.03]"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    {fromPackage ? (
                      <p className="truncate px-2 text-sm font-medium text-slate-800">
                        {spareDisplayName(spareOptions, line.spareId)}
                      </p>
                    ) : (
                      <SearchableCombobox
                        id={`work-done-spare-${idx}`}
                        value={line.spareId}
                        options={spareOptions}
                        placeholder="Search spare…"
                        disabled={saving}
                        inputClass="w-full rounded-md border border-rlx-rule bg-white px-2.5 py-1.5 text-sm disabled:bg-stone-50 disabled:opacity-70"
                        onChange={(nextId) => {
                          if (onSpareChange) {
                            onSpareChange(idx, nextId);
                            return;
                          }
                          updateLine(idx, { spareId: nextId });
                          if (nextId) onSparePicked?.(nextId);
                        }}
                      />
                    )}
                  </div>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    aria-label="Qty"
                    value={line.qty}
                    disabled={saving}
                    onChange={(e) => updateLine(idx, { qty: e.target.value })}
                    className={`w-14 shrink-0 rounded-md border bg-white px-2 py-1.5 text-center text-sm outline-none focus:border-rlx-green disabled:opacity-60 ${
                      lineShort ? "border-rose-400" : "border-rlx-rule"
                    }`}
                  />
                  <p className="w-24 shrink-0 truncate text-right text-xs font-semibold tabular-nums text-slate-800">
                    {amountLabel}
                  </p>
                  <p
                    className={`hidden w-28 shrink-0 truncate text-right text-[11px] sm:block ${
                      warn ? "font-semibold text-rose-700" : "text-slate-500"
                    }`}
                  >
                    {stockText}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    disabled={saving}
                    className="shrink-0 px-1.5 text-lg leading-none text-rose-600 hover:text-rose-800 disabled:opacity-40"
                    aria-label={fromPackage ? "Not used" : "Remove"}
                    title={fromPackage ? "Not used" : "Remove"}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => onLinesChange([...lines, { spareId: "", qty: "1" }])}
              disabled={saving}
              className="w-full rounded-lg border border-dashed border-rlx-rule bg-white py-2 text-xs font-semibold uppercase tracking-widest text-rlx-green transition hover:border-rlx-green hover:bg-rlx-green/5 disabled:opacity-50"
            >
              + Add extra spare
            </button>
          </div>
        </section>
      </div>
    </AppModal>
  );
}
