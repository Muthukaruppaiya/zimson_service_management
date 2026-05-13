type StepperProps = {
  steps: string[];
  activeIndex: number;
};

export function Stepper({ steps, activeIndex }: StepperProps) {
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5">
      {steps.map((label, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <li key={label} className="flex items-center gap-2 sm:contents">
            <span
              className={[
                "inline-flex items-center gap-2 border px-3 py-1.5 text-xs font-semibold tracking-wide transition",
                done
                  ? "border-rlx-green/30 bg-rlx-green-light text-rlx-green"
                  : active
                    ? "border-rlx-gold/60 bg-rlx-green text-white shadow-sm"
                    : "border-rlx-rule bg-white text-rlx-ink-muted",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  done
                    ? "bg-rlx-green text-white"
                    : active
                      ? "bg-rlx-gold text-rlx-green-deep"
                      : "bg-rlx-rule text-rlx-ink-muted",
                ].join(" ")}
              >
                {done ? "✓" : i + 1}
              </span>
              {label}
            </span>
            {i < steps.length - 1 ? (
              <span className="hidden text-rlx-rule sm:inline" aria-hidden>›</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
