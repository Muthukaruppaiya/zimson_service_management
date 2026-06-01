import type { DashboardQuickLinkId } from "../../lib/dashboardQuickLinks";

type Props = { id: DashboardQuickLinkId; className?: string };

/** Simple line icons for dashboard shortcuts (easy to recognise without reading much text). */
export function DashboardQuickLinkIcon({ id, className = "h-7 w-7" }: Props) {
  const stroke = "currentColor";
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (id) {
    case "quick_bill":
      return (
        <svg {...common}>
          <path d="M9 7h6M9 11h6M9 15h4" />
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M8 3V2h8v1" />
        </svg>
      );
    case "srf_booking":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l2.5 2.5" />
          <path d="M9 3h6M9 21h6" />
        </svg>
      );
    case "quick_bill_history":
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h16M4 18h10" />
          <circle cx="18" cy="18" r="3" />
          <path d="M19.5 19.5L21 21" />
        </svg>
      );
    case "srf_register":
      return (
        <svg {...common}>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case "srf_master":
      return (
        <svg {...common}>
          <path d="M4 19V5M4 19h16M8 15v-4M12 19V9M16 19v-2" />
        </svg>
      );
    case "store_billing":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="14" rx="2" />
          <path d="M3 10h18M7 14h4" />
          <path d="M16 3v3M8 3v3" />
        </svg>
      );
    case "service_billing":
      return (
        <svg {...common}>
          <path d="M12 3v18M8 7h8M8 12h6M8 17h4" />
          <circle cx="12" cy="12" r="9" strokeDasharray="2 2" opacity="0.35" />
        </svg>
      );
    case "customer_master":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5" />
        </svg>
      );
    case "store_dispatch":
      return (
        <svg {...common}>
          <path d="M3 8h11v8H3zM14 10h4l3 3v3h-7v-6z" />
          <circle cx="7.5" cy="18" r="1.5" fill={stroke} stroke="none" />
          <circle cx="17" cy="18" r="1.5" fill={stroke} stroke="none" />
        </svg>
      );
    case "store_assign":
      return (
        <svg {...common}>
          <path d="M16 11a4 4 0 1 0-8 0M4 20v-1a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v1" />
          <path d="M19 8l2 2-2 2M21 10h-4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
        </svg>
      );
  }
}
