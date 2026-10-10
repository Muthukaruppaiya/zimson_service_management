import type { ButtonHTMLAttributes } from "react";
import { IconPrint } from "./TableActionIcons";

type Variant = "light" | "solid" | "dark" | "none";

const VARIANT_CLASS: Record<Variant, string> = {
  light: "border border-rlx-gold/60 bg-white text-rlx-green hover:border-rlx-gold hover:bg-rlx-green-light",
  solid: "bg-rlx-green text-white shadow-sm hover:bg-rlx-green-deep",
  dark: "bg-white/15 text-white ring-1 ring-inset ring-white/25 hover:bg-white/25",
  none: "",
};

const SIZE_CLASS = {
  sm: "h-8 w-8 [&>svg]:h-4 [&>svg]:w-4",
  md: "h-10 w-10 [&>svg]:h-5 [&>svg]:w-5",
} as const;

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Tooltip and screen-reader text, e.g. "Print estimate". */
  label?: string;
  variant?: Variant;
  size?: keyof typeof SIZE_CLASS;
};

export function PrintIconButton({
  label = "Print",
  variant = "light",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${className}`.trim()}
      {...rest}
    >
      <IconPrint />
    </button>
  );
}
