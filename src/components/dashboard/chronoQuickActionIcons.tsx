/** Illustrated quick-action icons matching ChronoSync reference artwork. */

import type { ReactNode } from "react";
import type { DashboardQuickLinkId } from "../../lib/dashboardQuickLinks";

const VB = "0 0 64 64";

type IconProps = { size?: number };

function IconFrame({ children, size }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox={VB}
      {...(size ? { width: size, height: size } : {})}
      fill="none"
      aria-hidden
      className="dashboard-quick-tile-svg"
    >
      {children}
    </svg>
  );
}

function IconQuickBill({ size }: IconProps) {
  return (
    <IconFrame size={size}>
      <ellipse cx="46" cy="46" rx="7" ry="2.5" fill="#B8860B" opacity="0.35" />
      <ellipse cx="46" cy="43" rx="7" ry="2.2" fill="#F5C542" stroke="#C9A227" strokeWidth="0.8" />
      <ellipse cx="46" cy="40" rx="7" ry="2.2" fill="#F5C542" stroke="#C9A227" strokeWidth="0.8" />
      <ellipse cx="46" cy="37" rx="7" ry="2.2" fill="#FDE68A" stroke="#D97706" strokeWidth="0.8" />
      <ellipse cx="46" cy="34" rx="7" ry="2.2" fill="#FDE68A" stroke="#D97706" strokeWidth="0.8" />
      <rect x="14" y="22" width="28" height="24" rx="2" fill="#B8C4D4" stroke="#64748B" strokeWidth="1" />
      <rect x="14" y="40" width="28" height="6" rx="1" fill="#1B3A8F" />
      <rect x="18" y="26" width="20" height="10" rx="1" fill="#94A3B8" />
      <path d="M22 30h12M22 33h8" stroke="#E2E8F0" strokeWidth="1" strokeLinecap="round" />
      <rect x="30" y="18" width="6" height="8" rx="0.5" fill="white" stroke="#CBD5E1" strokeWidth="0.8" />
      <path d="M31 20h4M31 22h4M31 24h3" stroke="#94A3B8" strokeWidth="0.6" strokeLinecap="round" />
    </IconFrame>
  );
}

function IconSrfBooking({ size }: IconProps) {
  return (
    <IconFrame size={size}>
      <path d="M22 18h20l2.5 4H19.5L22 18z" fill="#C9A227" stroke="#A8850F" strokeWidth="0.8" />
      <path d="M22 46h20l2.5-4H19.5L22 46z" fill="#2C3E5C" stroke="#1E293B" strokeWidth="0.8" />
      <rect x="19" y="22" width="26" height="4" rx="1" fill="#2C3E5C" />
      <rect x="19" y="38" width="26" height="4" rx="1" fill="#2C3E5C" />
      <circle cx="32" cy="32" r="13" fill="#D4AF37" stroke="#A8850F" strokeWidth="1" />
      <circle cx="32" cy="32" r="10" fill="white" stroke="#CBD5E1" strokeWidth="0.8" />
      <path d="M32 24v1M32 39v1M25 32h-1M39 32h1M27.8 27.8l.7.7M35.5 35.5l.7.7M36.2 27.8l-.7.7M28.5 35.5l-.7.7" stroke="#374151" strokeWidth="0.9" strokeLinecap="round" />
      <line x1="32" y1="32" x2="32" y2="26" stroke="#1B3A8F" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="32" y1="32" x2="36" y2="34" stroke="#1B3A8F" strokeWidth="1" strokeLinecap="round" />
      <circle cx="32" cy="32" r="1.2" fill="#1B3A8F" />
    </IconFrame>
  );
}

function IconPartsOrder({ size }: IconProps) {
  return (
    <IconFrame size={size}>
      <path d="M38 18c-2 2-6 2-8 0" stroke="#1B3A8F" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <circle cx="28" cy="20" r="7" fill="#1B3A8F" stroke="#102570" strokeWidth="0.8" />
      <circle cx="28" cy="20" r="2.5" fill="#E8EDF8" />
      <circle cx="40" cy="16" r="5" fill="#F5C542" stroke="#D97706" strokeWidth="0.8" />
      <circle cx="40" cy="16" r="1.8" fill="#FEF3C7" />
      <path d="M16 30h32l-3 14H19l-3-14z" fill="#A67C52" stroke="#78350F" strokeWidth="1" />
      <path d="M16 30l3-4h26l3 4" fill="#C4A484" stroke="#78350F" strokeWidth="0.8" />
      <path d="M22 34h20" stroke="#78350F" strokeWidth="0.8" opacity="0.5" />
    </IconFrame>
  );
}

function IconBillHistory({ size }: IconProps) {
  return (
    <IconFrame size={size}>
      <rect x="18" y="22" width="28" height="34" rx="2" fill="white" stroke="#CBD5E1" strokeWidth="1" />
      <rect x="14" y="18" width="28" height="34" rx="2" fill="white" stroke="#94A3B8" strokeWidth="1" />
      <path d="M20 26h20M20 31h16M20 36h18M20 41h12" stroke="#1B3A8F" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M20 22h20M20 27h14" stroke="#93C5FD" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
    </IconFrame>
  );
}

function IconSearchSrfs({ size }: IconProps) {
  return (
    <IconFrame size={size}>
      <path d="M12 20h32a2 2 0 012 2v22H12V20z" fill="#F0D060" stroke="#D97706" strokeWidth="1" />
      <path d="M12 24h36" stroke="#D97706" strokeWidth="1" />
      <path d="M12 20l6-6h24l6 6" fill="#F5E9B8" stroke="#D97706" strokeWidth="1" />
      <circle cx="42" cy="42" r="10" fill="white" stroke="#94A3B8" strokeWidth="1.5" />
      <circle cx="42" cy="42" r="7" fill="#DBEAFE" stroke="#1B3A8F" strokeWidth="1" />
      <path d="M48 48l6 6" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" />
    </IconFrame>
  );
}

function IconAllSrfs({ size }: IconProps) {
  return (
    <IconFrame size={size}>
      <path d="M16 20h28M16 28h28M16 36h28M16 44h20" stroke="#1B3A8F" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 18l2 2-2 2" stroke="#1B3A8F" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 26l2 2-2 2" stroke="#16A34A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 34h4" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 42l2 2-2 2" stroke="#1B3A8F" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="11" cy="19" r="1" fill="#1B3A8F" />
      <circle cx="11" cy="27" r="1" fill="#16A34A" />
    </IconFrame>
  );
}

function IconCustomerMaster({ size }: IconProps) {
  return (
    <IconFrame size={size}>
      <circle cx="32" cy="24" r="8" fill="#E8EDF8" stroke="#1B3A8F" strokeWidth="1.2" />
      <path d="M14 50c3-8 9-12 18-12s15 4 18 12" stroke="#1B3A8F" strokeWidth="1.5" strokeLinecap="round" />
    </IconFrame>
  );
}

export function ChronoQuickActionIcon({
  id,
  className = "",
  size,
}: {
  id: DashboardQuickLinkId;
  className?: string;
  size?: number;
}) {
  const wrap = (node: ReactNode) => (
    <span className={`dashboard-quick-tile-icon inline-flex items-center justify-center ${className}`}>
      {node}
    </span>
  );

  switch (id) {
    case "quick_bill":
      return wrap(<IconQuickBill size={size} />);
    case "srf_booking":
      return wrap(<IconSrfBooking size={size} />);
    case "parts_order":
      return wrap(<IconPartsOrder size={size} />);
    case "quick_bill_history":
      return wrap(<IconBillHistory size={size} />);
    case "srf_register":
      return wrap(<IconSearchSrfs size={size} />);
    case "srf_master":
      return wrap(<IconAllSrfs size={size} />);
    case "store_billing":
      return wrap(<IconQuickBill size={size} />);
    case "service_billing":
      return wrap(<IconBillHistory size={size} />);
    case "customer_master":
      return wrap(<IconCustomerMaster size={size} />);
    case "store_dispatch":
      return wrap(<IconPartsOrder size={size} />);
    case "store_assign":
      return wrap(<IconSearchSrfs size={size} />);
    default:
      return wrap(<IconAllSrfs size={size} />);
  }
}
