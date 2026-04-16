type StepperProps = {
  steps: string[];
  activeIndex: number;
};

export function Stepper({ steps, activeIndex }: StepperProps) {
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
      {steps.map((label, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <li key={label} className="flex items-center gap-2 sm:contents">
            <span
              className={[
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                done
                  ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
                  : active
                    ? "bg-zimson-500 text-white shadow-sm"
                    : "bg-zimson-100/80 text-stone-600 ring-1 ring-zimson-200",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                  done
                    ? "bg-emerald-600 text-white"
                    : active
                      ? "bg-white/20 text-white"
                      : "bg-white text-zimson-800",
                ].join(" ")}
              >
                {done ? "✓" : i + 1}
              </span>
              {label}
            </span>
            {i < steps.length - 1 ? (
              <span className="hidden text-stone-300 sm:inline" aria-hidden>
                →
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
