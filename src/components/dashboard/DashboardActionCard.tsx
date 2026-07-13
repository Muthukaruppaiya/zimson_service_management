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
  if (item.id === "open-srf") return "Pipeline watches";
  if (item.id.includes("approval") || item.id === "customer-approval") return "Customer OTP / link";
  if (item.id === "at-ho") return "HO repair bench";
  if (item.id.includes("handover")) return "Store handover";
  if (item.id === "store-dispatch") return "Awaiting HO dispatch";
  if (item.id === "store-odc-inward" || item.id === "sc-dc-inward") return "Transfer document";
  if (item.id.includes("assign") || item.id === "tech-queue") return "Technician bench";
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
      <div className="cs-kpi-card__inner">
        <div className="cs-kpi-card__header">
          <p className="cs-kpi-label">{item.label}</p>
          {isWaiting ? (
            <span className={`cs-status-label ${item.urgent ? "urgent" : "action"}`}>
              <span
                className={`cs-status-blinker ${item.urgent ? "cs-status-blinker-urgent" : "cs-status-blinker-action"}`}
                aria-hidden
              />
              {item.urgent ? "Pending" : "Action"}
            </span>
          ) : (
            <span className="cs-status-label cs-status-label--spacer" aria-hidden />
          )}
        </div>

        <div className="cs-kpi-card__body">
          <div className="cs-kpi-card__metric">
            <div className="cs-kpi-card__value-row">
              <p className="cs-kpi-value tabular-nums">{item.count}</p>
              {showDonut ? <ChronoMiniDonut className="shrink-0" /> : null}
            </div>
            <div className="cs-kpi-card__sparkline-slot">
              {showSparkline ? <ChronoSparkline /> : null}
            </div>
          </div>

          <ChronoKpiIcon variant={variant} className="dashboard-kpi-illustration shrink-0" />
        </div>

        <p className="cs-kpi-sub">{kpiSubtext(item)}</p>
      </div>
    </Link>
  );
}
