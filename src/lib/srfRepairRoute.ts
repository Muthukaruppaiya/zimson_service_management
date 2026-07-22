export type SrfRepairRoute = "send_to_ho" | "store_self";

/** User-facing label: dispatch watch to centralized service centre. */
export const SRF_ROUTE_LABEL_SEND_TO_SC = "Send to centralized service centre (CSC)";

/** User-facing label: repair at the store without dispatch. */
export const SRF_ROUTE_LABEL_INSTORE = "Repair at in-store";

export const SRF_REPAIR_ROUTE_OPTIONS: Array<{ value: SrfRepairRoute; label: string; hint: string }> = [
  {
    value: "send_to_ho",
    label: SRF_ROUTE_LABEL_SEND_TO_SC,
    hint: "Watch is sent to the centralized service centre for repair and return.",
  },
  {
    value: "store_self",
    label: SRF_ROUTE_LABEL_INSTORE,
    hint: "Technician repairs at your store — assign, complete, and bill locally.",
  },
];

export const STORE_SELF_STATUS_LABELS: Record<string, string> = {
  store_self_pending: "In-store repair — pending assign",
  store_self_assigned: "In-store repair — assigned",
  store_self_working: "In-store repair — in progress",
};

export function storeSelfStatusLabel(status: string): string {
  return STORE_SELF_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function normalizeSrfRepairRoute(raw: unknown): SrfRepairRoute {
  return String(raw ?? "").trim() === "store_self" ? "store_self" : "send_to_ho";
}

export function repairRouteLabel(route: SrfRepairRoute | string | null | undefined): string {
  return route === "store_self" ? SRF_ROUTE_LABEL_INSTORE : SRF_ROUTE_LABEL_SEND_TO_SC;
}
