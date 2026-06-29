export type AnalyticsViewKey =
  | "sales"
  | "srf"
  | "quick_bill"
  | "b2b_b2c"
  | "purchase"
  | "store"
  | "region"
  | "margin";

export type AnalyticsTopicDef = {
  key: AnalyticsViewKey;
  label: string;
  description: string;
  superAdminOnly?: boolean;
};

export const ANALYTICS_TOPICS: AnalyticsTopicDef[] = [
  { key: "sales", label: "Sales overview", description: "Total revenue, daily trend, SRF vs quick bill" },
  { key: "srf", label: "SRF pipeline", description: "Opened, closed, waiting — all statuses" },
  { key: "quick_bill", label: "Quick bill", description: "Walk-in billing volume and payment modes" },
  { key: "b2b_b2c", label: "B2B / B2C", description: "Corporate vs retail customer mix" },
  { key: "purchase", label: "Purchases", description: "GRN spend by vendor and HSN" },
  { key: "margin", label: "Sales vs purchase", description: "Revenue, GRN spend and gross margin" },
  { key: "store", label: "Store performance", description: "Sales ranking by store" },
  { key: "region", label: "Regional sales", description: "Compare regions (super admin)", superAdminOnly: true },
];

export function analyticsTopicsForRole(role: string | undefined): AnalyticsTopicDef[] {
  return ANALYTICS_TOPICS.filter((t) => !t.superAdminOnly || role === "super_admin");
}

export function topicMeta(key: AnalyticsViewKey): AnalyticsTopicDef {
  return ANALYTICS_TOPICS.find((t) => t.key === key) ?? ANALYTICS_TOPICS[0];
}
