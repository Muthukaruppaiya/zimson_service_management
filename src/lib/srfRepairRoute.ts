export type SrfRepairRoute = "send_to_ho" | "store_self";

export const SRF_REPAIR_ROUTE_OPTIONS: Array<{ value: SrfRepairRoute; label: string; hint: string }> = [
  {
    value: "send_to_ho",
    label: "Send to HO",
    hint: "",
  },
  {
    value: "store_self",
    label: "Repair by self",
    hint: "",
  },
];

export function normalizeSrfRepairRoute(raw: unknown): SrfRepairRoute {
  return String(raw ?? "").trim() === "store_self" ? "store_self" : "send_to_ho";
}

export function repairRouteLabel(route: SrfRepairRoute | string | null | undefined): string {
  return route === "store_self" ? "Repair by self (store)" : "Send to HO";
}
