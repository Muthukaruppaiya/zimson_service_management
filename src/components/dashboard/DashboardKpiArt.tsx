import { ChronoKpiIcon, kpiIllustrationVariant } from "./chronoSyncIcons";

type Props = {
  id: string;
  className?: string;
};

/** @deprecated Use ChronoKpiIcon via DashboardActionCard */
export function DashboardKpiArt({ id, className = "" }: Props) {
  return <ChronoKpiIcon variant={kpiIllustrationVariant(id)} size={40} className={className} />;
}
