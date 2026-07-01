import { useCallback, useEffect, useRef } from "react";

const OTP_LEN = 6;

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  size?: "default" | "compact";
};

const boxClass = {
  default:
    "h-12 w-10 rounded-xl border-2 text-xl sm:h-14 sm:w-12 sm:text-2xl",
  compact:
    "h-9 w-8 rounded-lg border text-base sm:h-10 sm:w-9 sm:text-lg",
} as const;

export function OtpDigitInput({
  value,
  onChange,
  disabled,
  autoFocus = true,
  id,
  size = "default",
}: Props) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: OTP_LEN }, (_, i) => value[i] ?? "");

  const setDigits = useCallback(
    (next: string[]) => {
      const joined = next.join("").replace(/\D/g, "").slice(0, OTP_LEN);
      onChange(joined);
    },
    [onChange],
  );

  useEffect(() => {
    if (!autoFocus) return;
    inputRefs.current[0]?.focus();
  }, [autoFocus]);

  function focusAt(index: number) {
    const el = inputRefs.current[Math.max(0, Math.min(index, OTP_LEN - 1))];
    el?.focus();
    el?.select();
  }

  function applyPaste(raw: string, startIndex: number) {
    const chars = raw.replace(/\D/g, "").slice(0, OTP_LEN - startIndex).split("");
    if (chars.length === 0) return;
    const next = [...digits];
    chars.forEach((ch, offset) => {
      next[startIndex + offset] = ch;
    });
    setDigits(next);
    focusAt(startIndex + chars.length);
  }

  return (
    <div className={size === "compact" ? "mt-1" : "mt-2"} id={id}>
      <div
        className={`flex justify-center ${size === "compact" ? "gap-1.5" : "gap-2 sm:gap-2.5"}`}
        role="group"
        aria-label="6-digit OTP"
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            disabled={disabled}
            value={digit}
            aria-label={`Digit ${index + 1} of ${OTP_LEN}`}
            onChange={(e) => {
              const ch = e.target.value.replace(/\D/g, "").slice(-1);
              const next = [...digits];
              next[index] = ch;
              setDigits(next);
              if (ch) focusAt(index + 1);
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                if (digits[index]) {
                  const next = [...digits];
                  next[index] = "";
                  setDigits(next);
                } else if (index > 0) {
                  const next = [...digits];
                  next[index - 1] = "";
                  setDigits(next);
                  focusAt(index - 1);
                }
                e.preventDefault();
              } else if (e.key === "ArrowLeft" && index > 0) {
                focusAt(index - 1);
                e.preventDefault();
              } else if (e.key === "ArrowRight" && index < OTP_LEN - 1) {
                focusAt(index + 1);
                e.preventDefault();
              }
            }}
            onPaste={(e) => {
              e.preventDefault();
              applyPaste(e.clipboardData.getData("text"), index);
            }}
            onFocus={(e) => e.target.select()}
            className={`${boxClass[size]} text-center font-mono font-bold tracking-widest transition ${
              digit
                ? "border-zimson-500 bg-zimson-50 text-stone-900 shadow-sm"
                : "border-stone-300 bg-white text-stone-400"
            } focus:border-zimson-600 focus:bg-white focus:text-stone-900 focus:outline-none focus:ring-2 focus:ring-zimson-200 disabled:opacity-60`}
          />
        ))}
      </div>
    </div>
  );
}
