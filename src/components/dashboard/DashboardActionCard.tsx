import { Link } from "react-router-dom";
import type { DashboardActionItem } from "../../lib/dashboardActionItems";
import {
  ChronoKpiIcon,
  ChronoMiniDonut,
  ChronoSparkline,
  kpiIllustrationVariant,
} from "./chronoSyncIcons";

type Props = {
  item: DashboardActionItem;
};

function kpiSubtext(item: DashboardActionItem): string {
  if (item.id === "open-srf") return "Active SRF pipeline";
  if (item.id.includes("approval") || item.id.includes("customer")) return "OTP / Link flow";
  if (item.id === "at-ho") return "In Repair / Bench";
  if (item.id.includes("handover")) return "OTP at store";
  if (item.id.includes("assign") || item.id === "tech-queue") return "In Repair / Bench";
  if (item.sublabel) return item.sublabel;
  const hint = item.hint;
  if (hint.length <= 40) return hint;
  return hint.split(/[.—]/)[0]?.trim() || hint;
}

export function DashboardActionCard({ item }: Props) {
  const isWaiting = item.count > 0;
  const variant = kpiIllustrationVariant(item.id);
  const showSparkline = isWaiting && (variant === "pipeline" || item.id === "open-srf");
  const showDonut = isWaiting && (variant === "workshop" || item.id === "at-ho");

  const blinkClass = isWaiting
    ? item.urgent
      ? "dashboard-kpi-blink-urgent"
      : "dashboard-kpi-blink-action"
    : "";

  return (
    <Link
      to={item.to}
      className={`cs-card cs-kpi-card dashboard-kpi-card group ${blinkClass}`}
    >
      {isWaiting ? (
        <span className={`cs-status-label ${item.urgent ? "urgent" : "action"}`}>
          <span
            className={`cs-status-blinker ${item.urgent ? "cs-status-blinker-urgent" : "cs-status-blinker-action"}`}
            aria-hidden
          />
          {item.urgent ? "Pending" : "Action"}
        </span>
      ) : null}

      <div className="cs-kpi-text min-w-0 flex-1">
        <p className="cs-kpi-label">{item.label}</p>
        <div className="flex items-end gap-2">
          <p className="cs-kpi-value tabular-nums">{item.count}</p>
          {showDonut ? <ChronoMiniDonut className="mb-1 shrink-0" /> : null}
        </div>
        {showSparkline ? <ChronoSparkline className="mt-0.5" /> : null}
        <p className="cs-kpi-sub">{kpiSubtext(item)}</p>
      </div>

      <ChronoKpiIcon variant={variant} className="dashboard-kpi-illustration shrink-0" />
    </Link>
  );
}
