import {
  SERVICE_WARRANTY_MONTHS,
  formatWarrantyMonthsLabel,
} from "../../lib/serviceWarranty";

type Props = {
  value: number | null;
  onChange: (months: number) => void;
  disabled?: boolean;
};

export function WarrantyMonthsPicker({ value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {SERVICE_WARRANTY_MONTHS.map((months) => {
        const active = value === months;
        return (
          <button
            key={months}
            type="button"
            disabled={disabled}
            onClick={() => onChange(months)}
            className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              active
                ? "border-zimson-600 bg-zimson-600 text-white shadow-sm"
                : "border-zimson-200 bg-white text-zimson-900 hover:border-zimson-400 hover:bg-zimson-50"
            }`}
          >
            {formatWarrantyMonthsLabel(months)}
          </button>
        );
      })}
    </div>
  );
}
