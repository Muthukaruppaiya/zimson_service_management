import type { DashboardQuickLinkId } from "../../lib/dashboardQuickLinks";
import { ChronoQuickActionIcon } from "./chronoQuickActionIcons";

type Props = { id: DashboardQuickLinkId; className?: string };

export function DashboardQuickLinkIcon({ id, className }: Props) {
  return <ChronoQuickActionIcon id={id} className={className} />;
}
