/** ChronoSync-style colourful dashboard illustrations (KPI cards). */

export type KpiIllustrationVariant = "pipeline" | "approval" | "workshop" | "handover" | "logistics";

export function kpiIllustrationVariant(id: string): KpiIllustrationVariant {
  if (id.includes("handover")) return "handover";
  if (id.includes("approval") || id.includes("customer")) return "approval";
  if (id === "at-ho" || id.includes("assign") || id === "tech-queue") return "workshop";
  if (id.includes("inward") || id.includes("outward") || id.includes("dispatch") || id.includes("brand")) {
    return "logistics";
  }
  return "pipeline";
}

type SizeProps = { size?: number; className?: string };

export function ChronoKpiIcon({ variant, size, className = "" }: { variant: KpiIllustrationVariant } & SizeProps) {
  const useCssSize = className.includes("dashboard-kpi-illustration");
  const s = size ?? 52;
  const base = `shrink-0 ${className}`;
  const dimProps = useCssSize ? {} : { width: s, height: s };

  if (variant === "handover") {
    return (
      <svg className={base} viewBox="0 0 56 56" fill="none" aria-hidden {...dimProps}>
        <rect x="10" y="30" width="36" height="18" rx="2" fill="#7F1D1D" />
        <rect x="12" y="32" width="32" height="14" rx="1" fill="#991B1B" />
        <ellipse cx="28" cy="38" rx="10" ry="5" fill="#450A0A" opacity="0.35" />
        <rect x="18" y="18" width="20" height="14" rx="3" fill="#E5E7EB" stroke="#9CA3AF" strokeWidth="1" />
        <circle cx="28" cy="25" r="5" fill="#F8FAFC" stroke="#1B3A8F" strokeWidth="1.2" />
        <path d="M28 25V22M28 25l2.5 2" stroke="#1B3A8F" strokeWidth="1" strokeLinecap="round" />
        <path d="M22 18h12l2-3H20l2 3z" fill="#C9A227" />
      </svg>
    );
  }

  if (variant === "approval") {
    return (
      <svg className={base} viewBox="0 0 56 56" fill="none" aria-hidden {...dimProps}>
        <path d="M28 8l14 4v12c0 8-6 14-14 16-8-2-14-8-14-16V12l14-4z" fill="#DCFCE7" stroke="#16A34A" strokeWidth="1.2" />
        <path d="M28 8l14 4-14 4-14-4 14-4z" fill="#BBF7D0" />
        <circle cx="28" cy="26" r="9" fill="#1B3A8F" />
        <path d="M24 26l2.5 2.5L33 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (variant === "workshop") {
    return (
      <svg className={base} viewBox="0 0 56 56" fill="none" aria-hidden {...dimProps}>
        <circle cx="36" cy="20" r="10" fill="#E8EDF8" stroke="#1B3A8F" strokeWidth="1" />
        <path d="M36 14v12M30 20h12" stroke="#C9A227" strokeWidth="1.5" />
        <path d="M12 38l6-10 4 4 8-12" stroke="#1B3A8F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 42h20" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />
        <path d="M14 34l8 2-2 6" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M30 36l10-4 2 8-8 2-4-6z" fill="#F59E0B" stroke="#D97706" strokeWidth="0.8" />
      </svg>
    );
  }

  if (variant === "logistics") {
    return (
      <svg className={base} viewBox="0 0 56 56" fill="none" aria-hidden {...dimProps}>
        <rect x="9" y="23" width="24" height="18" rx="2" fill="#E8EDF8" stroke="#1B3A8F" strokeWidth="1" />
        <path d="M9 30h24" stroke="#1B3A8F" strokeWidth="1" />
        <path d="M21 23v18" stroke="#1B3A8F" strokeWidth="1" />
        <path d="M9 23l12 8 12-8" stroke="#1B3A8F" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M35 19h8M39 15l4 4-4 4" stroke="#1B3A8F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M35 27h6M35 31h10" stroke="#C9A227" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="38" cy="39" r="5" fill="#F5E9B8" stroke="#C9A227" strokeWidth="1" />
        <path d="M38 36.8v2.8l1.8 1.2" stroke="#1B3A8F" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg className={base} viewBox="0 0 56 56" fill="none" aria-hidden {...dimProps}>
      <circle cx="22" cy="22" r="7" fill="#E8EDF8" stroke="#1B3A8F" strokeWidth="1" />
      <circle cx="22" cy="22" r="3" fill="#C9A227" />
      <path d="M22 19v6M19 22h6" stroke="#1B3A8F" strokeWidth="0.8" />
      <path d="M34 14l4 2-4 2-4-2 4-2z" fill="#F5E9B8" stroke="#C9A227" strokeWidth="0.8" />
      <path d="M38 30l3 2-3 2-3-2 3-2z" fill="#E8EDF8" stroke="#1B3A8F" strokeWidth="0.8" />
      <rect x="30" y="34" width="14" height="12" rx="1.5" fill="#FEF3C7" stroke="#D97706" strokeWidth="0.8" />
      <path d="M33 38h8M33 41h6" stroke="#B45309" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function ChronoSparkline({ className = "" }: { className?: string }) {
  return (
    <svg className={`mt-0.5 ${className}`} width="48" height="14" viewBox="0 0 48 14" fill="none" aria-hidden>
      <path d="M0 10 L8 8 L16 9 L24 5 L32 6 L40 3 L48 4" stroke="#1B3A8F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="48" cy="4" r="2" fill="#C9A227" />
    </svg>
  );
}

export function ChronoMiniDonut({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <circle cx="14" cy="14" r="10" stroke="#E8EDF8" strokeWidth="4" />
      <circle cx="14" cy="14" r="10" stroke="#1B3A8F" strokeWidth="4" strokeDasharray="22 41" strokeLinecap="round" transform="rotate(-90 14 14)" />
      <circle cx="14" cy="14" r="10" stroke="#C9A227" strokeWidth="4" strokeDasharray="12 51" strokeLinecap="round" transform="rotate(40 14 14)" />
    </svg>
  );
}
