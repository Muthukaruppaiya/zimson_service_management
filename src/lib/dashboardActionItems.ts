import type { SessionUser } from "../types/user";
import type { SrfJob } from "../types/srfJob";
import { jobVisibleToServiceCentre, jobVisibleToStoreUser, technicianCanActOnJob } from "./srfAccess";
import { computeDashboardOverviewStats } from "./dashboardOverviewStats";

export type DashboardActionItem = {
  id: string;
  label: string;
  /** Primary metric — documents for DC/TD queues, watches for SRF queues */
  count: number;
  sublabel?: string;
  hint: string;
  to: string;
  urgent: boolean;
  accent: string;
};

function isAwaitingCustomerApproval(job: SrfJob): boolean {
  if (job.status === "brand_estimate_customer_pending") return true;
  if (job.status === "reestimate_required") return true;
  if (job.status === "estimate_ok") return true;
  if (job.interHoReestimatePhase === "customer_pending") return true;
  if (job.interHoBrandEstimatePhase === "customer_pending") return true;
  return false;
}

function countScPendingDcInward(jobs: SrfJob[], user: SessionUser) {
  const inTransit = jobs.filter(
    (j) => j.status === "in_transit_sc" && jobVisibleToServiceCentre(j, user) && j.dcNumber,
  );
  const documents = new Set(inTransit.map((j) => j.dcNumber!));
  return { documents: documents.size, watches: inTransit.length };
}

function countStorePendingInward(jobs: SrfJob[], user: SessionUser) {
  const inTransit = jobs.filter(
    (j) =>
      j.status === "dispatched_to_store" &&
      jobVisibleToStoreUser(j, user) &&
      j.outwardDcNumber,
  );
  const documents = new Set(inTransit.map((j) => j.outwardDcNumber!));
  return { documents: documents.size, watches: inTransit.length };
}

function buildServiceCentreLogisticsItems(jobs: SrfJob[], user: SessionUser): DashboardActionItem[] {
  const inward = countScPendingDcInward(jobs, user);
  const readyOutward = jobs.filter(
    (j) => j.status === "ready_for_outward" && jobVisibleToServiceCentre(j, user),
  );
  const brandPending = jobs.filter(
    (j) => j.status === "brand_outward_pending" && jobVisibleToServiceCentre(j, user),
  );

  return [
    {
      id: "sc-dc-inward",
      label: "Transfer Inward",
      count: inward.documents,
      sublabel:
        inward.watches > 0
          ? `${inward.watches} watch${inward.watches === 1 ? "" : "es"} on transfer`
          : undefined,
      hint: "Scan or select transfer document at logistics inward",
      to: "/service-centre/logistics?tab=inward",
      urgent: inward.documents > 0,
      accent: "border-l-orange-500",
    },
    {
      id: "sc-odc-outward",
      label: "Store Return Queue",
      count: readyOutward.length,
      sublabel: readyOutward.length > 0 ? "Repaired — ready to dispatch to store" : undefined,
      hint: "Create ODC and send watches back to booking store",
      to: "/service-centre/logistics?tab=outward",
      urgent: readyOutward.length > 0,
      accent: "border-l-cyan-500",
    },
    {
      id: "sc-brand-dispatch",
      label: "Brand Outward",
      count: brandPending.length,
      hint: "Post outward DC to brand workshop",
      to: "/service-centre/logistics?tab=outward",
      urgent: brandPending.length > 0,
      accent: "border-l-violet-500",
    },
  ];
}

function buildSupervisorItems(jobs: SrfJob[], user: SessionUser): DashboardActionItem[] {
  const received = jobs.filter(
    (j) => j.status === "received_at_sc" && jobVisibleToServiceCentre(j, user),
  );
  const readyOutward = jobs.filter(
    (j) => j.status === "ready_for_outward" && jobVisibleToServiceCentre(j, user),
  );
  const brandPending = jobs.filter(
    (j) => j.status === "brand_outward_pending" && jobVisibleToServiceCentre(j, user),
  );

  return [
    {
      id: "sc-assign",
      label: "Assign Technician",
      count: received.length,
      hint: "Watches inwarded at HO awaiting assignment",
      to: "/service-centre/supervisor",
      urgent: received.length > 0,
      accent: "border-l-sky-500",
    },
    {
      id: "sc-odc-outward",
      label: "Store Return Queue",
      count: readyOutward.length,
      hint: "Repaired watches ready for store dispatch",
      to: "/service-centre/logistics?tab=outward",
      urgent: readyOutward.length > 0,
      accent: "border-l-cyan-500",
    },
    {
      id: "sc-brand-dispatch",
      label: "Brand Outward",
      count: brandPending.length,
      hint: "Clerk must post brand outward DC",
      to: "/service-centre/logistics?tab=outward",
      urgent: brandPending.length > 0,
      accent: "border-l-violet-500",
    },
  ];
}

function buildStoreItems(jobs: SrfJob[], user: SessionUser): DashboardActionItem[] {
  const inward = countStorePendingInward(jobs, user);
  const atStore = jobs.filter(
    (j) =>
      j.status === "at_store" &&
      j.repairRoute !== "store_self" &&
      jobVisibleToStoreUser(j, user),
  );
  const handover = jobs.filter(
    (j) => j.status === "received_at_store" && jobVisibleToStoreUser(j, user),
  );
  const approval = jobs.filter(
    (j) => jobVisibleToStoreUser(j, user) && isAwaitingCustomerApproval(j),
  );

  return [
    {
      id: "store-odc-inward",
      label: "Return Inward",
      count: inward.documents,
      sublabel:
        inward.watches > 0
          ? `${inward.watches} watch${inward.watches === 1 ? "" : "es"} in transit`
          : undefined,
      hint: "Scan or select return transfer at store dispatch inward",
      to: "/service/store-dispatch",
      urgent: inward.documents > 0,
      accent: "border-l-orange-500",
    },
    {
      id: "store-dispatch",
      label: "Send to Workshop",
      count: atStore.length,
      hint: "Watches at store ready to send for repair",
      to: "/service/store-dispatch",
      urgent: atStore.length > 0,
      accent: "border-l-blue-500",
    },
    {
      id: "store-handover",
      label: "Pickup Queue",
      count: handover.length,
      hint: "Customer pickup and billing",
      to: "/service/store-billing",
      urgent: handover.length > 0,
      accent: "border-l-emerald-500",
    },
    {
      id: "store-approval",
      label: "Sign-off Pending",
      count: approval.length,
      hint: "Estimate / re-estimate OTP pending",
      to: "/service/store-assign",
      urgent: approval.length > 0,
      accent: "border-l-violet-500",
    },
  ];
}

function buildTechnicianItems(jobs: SrfJob[], user: SessionUser): DashboardActionItem[] {
  const queue = jobs.filter(
    (j) =>
      technicianCanActOnJob(j, user) &&
      (j.status === "assigned" ||
        j.status === "estimate_ok" ||
        j.status === "reestimate_required"),
  );

  return [
    {
      id: "tech-queue",
      label: "My Workbench",
      count: queue.length,
      hint: "Assigned SRFs on your workbench",
      to: "/service-centre/technician",
      urgent: queue.length > 0,
      accent: "border-l-sky-500",
    },
  ];
}

function buildOverviewItems(jobs: SrfJob[], user: SessionUser): DashboardActionItem[] {
  const stats = computeDashboardOverviewStats(jobs, user);
  return [
    {
      id: "open-srf",
      label: "SRFs In Progress",
      count: stats.openServiceRequests,
      hint: "Watches moving through pipeline",
      to: "/service/srf-register",
      urgent: false,
      accent: "border-l-amber-400",
    },
    {
      id: "customer-approval",
      label: "Sign-off Pending",
      count: stats.awaitingCustomerApproval,
      hint: "Estimate OTP or link awaiting customer",
      to: "/service/store-assign",
      urgent: false,
      accent: "border-l-violet-400",
    },
    {
      id: "at-ho",
      label: "Workshop Queue",
      count: stats.atHeadOffice,
      hint: "On HO repair bench",
      to: "/service/watch-inventory",
      urgent: false,
      accent: "border-l-sky-400",
    },
    {
      id: "handover",
      label: "Pickup Queue",
      count: stats.readyForHandover,
      hint: "Ready for customer handover",
      to: "/service/store-billing",
      urgent: stats.readyForHandover > 0,
      accent: "border-l-emerald-400",
    },
  ];
}

export function dashboardActionSectionTitle(user: SessionUser | null | undefined): string {
  if (!user) return "Your action queue";
  switch (user.role) {
    case "service_centre_clerk":
      return "Front desk — logistics action queue";
    case "service_centre_supervisor":
      return "Supervisor — action queue";
    case "store_user":
    case "store_manager":
    case "store_accounts":
      return "Store front desk — action queue";
    case "technician":
      return "Technician — your queue";
    default:
      return "Today's overview";
  }
}

export function computeDashboardActionItems(
  jobs: SrfJob[],
  user: SessionUser | null | undefined,
): DashboardActionItem[] {
  if (!user) return [];

  switch (user.role) {
    case "service_centre_clerk":
    case "ho_manager":
      return buildServiceCentreLogisticsItems(jobs, user);
    case "service_centre_supervisor":
      return buildSupervisorItems(jobs, user);
    case "store_user":
    case "store_manager":
    case "store_accounts":
      return buildStoreItems(jobs, user);
    case "technician":
      return buildTechnicianItems(jobs, user);
    default:
      return buildOverviewItems(jobs, user);
  }
}

export function waitingActionItems(items: DashboardActionItem[]): DashboardActionItem[] {
  return items.filter((i) => i.count > 0);
}

export function waitingActionHeadline(items: DashboardActionItem[]): string {
  const waiting = waitingActionItems(items);
  if (waiting.length === 0) return "";

  const docQueues = waiting.filter((i) => i.id.includes("inward"));
  const docCount = docQueues.reduce((s, i) => s + i.count, 0);

  if (docQueues.length > 0 && waiting.length === docQueues.length) {
    return `${docCount} transfer document${docCount === 1 ? "" : "s"} waiting for your action`;
  }

  if (waiting.length === 1) {
    const w = waiting[0];
    return `${w.count} ${w.label.toLowerCase()}${w.sublabel ? ` · ${w.sublabel}` : ""}`;
  }

  const total = waiting.reduce((s, i) => s + i.count, 0);
  return `${total} item${total === 1 ? "" : "s"} across ${waiting.length} queues need your action`;
}

/** True when this role sees logistics-style DC/TD counts (not generic SRF pipeline). */
export function usesRoleActionQueue(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  return (
    user.role === "service_centre_clerk" ||
    user.role === "service_centre_supervisor" ||
    user.role === "ho_manager" ||
    user.role === "store_user" ||
    user.role === "store_manager" ||
    user.role === "store_accounts" ||
    user.role === "technician"
  );
}
