import type { ReactNode } from "react";
import type { SrfJob } from "../types/srfJob";
import { isInterHoReceiverLocal } from "./srfAccess";

export type SupervisorStatusTone = "rose" | "violet" | "sky" | "emerald" | "amber" | "indigo" | "stone";

export type SupervisorStatusMeta = {
  shortLabel: string;
  title: string;
  tone: SupervisorStatusTone;
  icon: "flag" | "brand" | "outward" | "check" | "clock" | "reject" | "transfer" | "wrench" | "inbox";
};

/** Soft text tint only — no chip/box background. */
const TONE_CLASS: Record<SupervisorStatusTone, string> = {
  rose: "text-rose-700",
  violet: "text-violet-700",
  sky: "text-sky-700",
  emerald: "text-emerald-700",
  amber: "text-amber-800",
  indigo: "text-indigo-700",
  stone: "text-stone-700",
};

const SHORT_STATUS: Record<string, string> = {
  draft: "Draft",
  photo_pending: "Photo capture pending",
  at_store: "At store",
  store_self_pending: "In-store — waiting for assign",
  store_self_assigned: "In-store — work in progress",
  store_self_working: "In-store — repair in progress",
  pending_ho_transit: "Pending dispatch to HO",
  in_transit_sc: "In transit to HO",
  awaiting_sc_inward: "Waiting for HO inward",
  received_at_sc: "Waiting for assigning",
  sent_to_other_ho: "Sent to other HO",
  assigned: "Work in progress",
  estimate_ok: "Estimate approved",
  reestimate_required: "Re-estimate required",
  customer_rejected: "Customer rejected estimate",
  inter_ho_reestimate_pending_sender: "Inter-HO re-estimate — awaiting sender",
  inter_ho_reestimate_customer_accepted: "Inter-HO re-estimate accepted",
  inter_ho_brand_estimate_pending_sender: "Inter-HO brand estimate — awaiting sender",
  inter_ho_brand_estimate_customer_accepted: "Inter-HO brand estimate accepted",
  brand_outward_pending: "Brand outward pending",
  brand_dispatch_pending: "Brand dispatch pending",
  sent_to_brand: "Sent to brand",
  brand_estimate_pending: "Awaiting brand estimate",
  brand_estimate_customer_pending: "Brand estimate with customer",
  brand_estimate_customer_accepted: "Brand estimate accepted",
  brand_approved: "Brand repair approved",
  brand_repair_in_progress: "Brand repair in progress",
  received_from_brand: "Received from brand",
  brand_credit_note_pending: "Brand credit note pending",
  brand_credit_note_pending_ho: "Brand credit note — HO pending",
  brand_credit_note_pending_accounts: "Brand credit note — accounts pending",
  brand_credit_note_active: "Brand credit note active",
  ready_for_outward: "Ready for outward",
  pending_store_transit: "Pending store transit",
  dispatched_to_store: "Dispatched to store",
  awaiting_store_inward: "Awaiting store inward",
  received_at_store: "Received at store",
  closed: "Closed",
  cancelled: "Cancelled",
};

function titleCaseWords(raw: string): string {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function fallbackShort(status: string): string {
  return SHORT_STATUS[status] ?? titleCaseWords(status.replace(/_/g, " "));
}

/** Icon + short label metadata for supervisor Assigning list. */
export function supervisorStatusMeta(job: SrfJob): SupervisorStatusMeta {
  if (job.interHoBrandEstimatePhase === "pending_sender" || job.status === "inter_ho_brand_estimate_pending_sender") {
    return {
      shortLabel: "Brand estimate — awaiting sender HO",
      title: "Inter-HO brand estimate — awaiting sender HO to forward to customer",
      tone: "indigo",
      icon: "transfer",
    };
  }
  if (job.interHoBrandEstimatePhase === "customer_pending") {
    return {
      shortLabel: "Brand estimate with customer",
      title: "Brand estimate sent to customer on tracking link",
      tone: "amber",
      icon: "clock",
    };
  }
  if (job.interHoBrandEstimatePhase === "customer_accepted" || job.status === "inter_ho_brand_estimate_customer_accepted") {
    return {
      shortLabel: "Brand estimate accepted",
      title: "Customer approved brand estimate — repair HO notified",
      tone: "emerald",
      icon: "check",
    };
  }
  if (job.interHoReestimatePhase === "pending_sender" || job.status === "inter_ho_reestimate_pending_sender") {
    return {
      shortLabel: "Re-estimate — awaiting sender HO",
      title: "Inter-HO re-estimate — awaiting sender HO",
      tone: "indigo",
      icon: "transfer",
    };
  }
  if (job.interHoReestimatePhase === "customer_pending") {
    return {
      shortLabel: "Re-estimate with customer",
      title: "Re-estimate sent to customer",
      tone: "amber",
      icon: "clock",
    };
  }
  if (job.interHoReestimatePhase === "customer_declined_final") {
    if (job.status === "customer_rejected" && isInterHoReceiverLocal(job)) {
      return {
        shortLabel: "Estimate not accepted — send to outward",
        title: "Estimate not accepted — send to outward",
        tone: "rose",
        icon: "outward",
      };
    }
    if (job.status === "received_at_sc" && !(job.transferSourceRegionId ?? "").trim()) {
      return {
        shortLabel: "Return inwarded — verify for outward",
        title: "Return inwarded — verify & move to outward",
        tone: "amber",
        icon: "inbox",
      };
    }
    if (job.status === "ready_for_outward") {
      const toStore = !(job.transferSourceRegionId ?? "").trim();
      return {
        shortLabel: toStore ? "Ready for outward — dispatch to store" : "Ready for outward — return to sender",
        title: toStore
          ? "Outward queue — dispatch to store"
          : "Outward queue — return DC to sender HO",
        tone: "sky",
        icon: "outward",
      };
    }
    return {
      shortLabel: "Estimate not accepted — awaiting repair HO",
      title: "Estimate not accepted — awaiting repair HO",
      tone: "rose",
      icon: "reject",
    };
  }
  if (job.interHoReestimatePhase === "customer_rejected" || job.status === "customer_rejected") {
    return {
      shortLabel: "Customer rejected estimate",
      title: "Customer rejected — negotiate or decline",
      tone: "rose",
      icon: "reject",
    };
  }
  if (job.interHoReestimatePhase === "customer_accepted" || job.status === "inter_ho_reestimate_customer_accepted") {
    return {
      shortLabel: "Customer accepted — awaiting sender approval",
      title: "Customer accepted — awaiting sender approval",
      tone: "indigo",
      icon: "clock",
    };
  }

  const status = job.status;
  const shortLabel = fallbackShort(status);
  const title = SHORT_STATUS[status] ?? titleCaseWords(status.replace(/_/g, " "));

  if (
    status === "brand_credit_note_pending" ||
    status === "brand_credit_note_pending_ho" ||
    status === "brand_credit_note_pending_accounts" ||
    status === "brand_credit_note_active" ||
    status.includes("brand")
  ) {
    return { shortLabel, title, tone: "violet", icon: "brand" };
  }
  if (status === "ready_for_outward" || status === "pending_store_transit" || status === "dispatched_to_store") {
    return { shortLabel, title, tone: "sky", icon: "outward" };
  }
  if (status === "received_at_sc") {
    return { shortLabel, title, tone: "emerald", icon: "inbox" };
  }
  if (status === "assigned" || status === "estimate_ok") {
    return { shortLabel, title, tone: "emerald", icon: status === "assigned" ? "wrench" : "check" };
  }
  if (status.includes("inter_ho") || job.interHoReestimatePhase || job.interHoBrandEstimatePhase) {
    return { shortLabel, title, tone: "indigo", icon: "transfer" };
  }
  if (status === "reestimate_required") {
    return { shortLabel, title, tone: "amber", icon: "flag" };
  }
  return { shortLabel, title, tone: "stone", icon: "clock" };
}

export function supervisorStatusBadgeClass(tone: SupervisorStatusTone): string {
  return TONE_CLASS[tone];
}

export function SupervisorStatusIcon({ icon, className = "h-3.5 w-3.5" }: { icon: SupervisorStatusMeta["icon"]; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true as const,
  };

  const paths: Record<SupervisorStatusMeta["icon"], ReactNode> = {
    flag: <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />,
    brand: (
      <>
        <path d="M20 7H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Z" />
        <path d="M12 11v4M9 13h6" />
      </>
    ),
    outward: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    reject: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m15 9-6 6M9 9l6 6" />
      </>
    ),
    transfer: (
      <>
        <path d="M7 7h11l-3-3M18 17H7l3 3" />
      </>
    ),
    wrench: (
      <>
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5Z" />
      </>
    ),
    inbox: (
      <>
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </>
    ),
  };

  return <svg {...common}>{paths[icon]}</svg>;
}

/** Filled / outline star for assign-priority toggle. */
export function PriorityAssignIcon({ filled, className = "h-4 w-4" }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.75}
    >
      <path d="M12 3.5 14.6 9l6 .6-4.5 4 1.3 5.9L12 16.8 6.6 19.5 7.9 13.6 3.4 9.6l6-.6L12 3.5Z" />
    </svg>
  );
}
