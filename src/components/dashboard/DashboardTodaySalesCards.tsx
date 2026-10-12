import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiJson, useApiMode } from "../../lib/api";

type TodaySales = {
  quickBills: { count: number; revenue: number };
  srf: { count: number; revenue: number; advance: number };
};

const HIDDEN_ROLES = new Set(["technician", "delivery_boy"]);
const REFRESH_MS = 60_000;

function formatInr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
}

function RupeeArt({ tone }: { tone: "green" | "gold" }) {
  const stroke = tone === "green" ? "#1f6b4a" : "#b8860b";
  const fill = tone === "green" ? "#e6f4ec" : "#fdf3dc";
  return (
    <svg viewBox="0 0 48 48" className="dashboard-kpi-illustration h-11 w-11 shrink-0" aria-hidden>
      <circle cx="24" cy="24" r="20" fill={fill} stroke={stroke} strokeWidth="2" />
      <path
        d="M17 15h14M17 21h14M20 15c6 0 8 3 8 6s-3 6-8 6h-3l10 9"
        fill="none"
        stroke={stroke}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SalesCard({
  to,
  label,
  count,
  sub,
  tone,
}: {
  to: string;
  label: string;
  count: number | null;
  sub: string;
  tone: "green" | "gold";
}) {
  return (
    <Link to={to} className="cs-card cs-kpi-card dashboard-kpi-card group">
      <div className="cs-kpi-card__inner">
        <div className="cs-kpi-card__header">
          <p className="cs-kpi-label">{label}</p>
          <span className="cs-status-label cs-status-label--spacer" aria-hidden />
        </div>
        <div className="cs-kpi-card__body">
          <div className="cs-kpi-card__metric">
            <div className="cs-kpi-card__value-row">
              <p className="cs-kpi-value tabular-nums">{count ?? "—"}</p>
            </div>
            <div className="cs-kpi-card__sparkline-slot" />
          </div>
          <RupeeArt tone={tone} />
        </div>
        <p className="cs-kpi-sub font-semibold text-emerald-800">{sub}</p>
      </div>
    </Link>
  );
}

export function DashboardTodaySalesCards() {
  const apiMode = useApiMode();
  const { user } = useAuth();
  const [data, setData] = useState<TodaySales | null>(null);
  const hidden = !user || HIDDEN_ROLES.has(user.role);

  useEffect(() => {
    if (!apiMode || hidden) return;
    let cancelled = false;
    const load = () =>
      apiJson<TodaySales>("/api/dashboard/today-sales")
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch(() => {});
    void load();
    const t = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [apiMode, hidden]);

  if (!apiMode || hidden) return null;

  const qb = data?.quickBills;
  const srf = data?.srf;
  return (
    <>
      <SalesCard
        to="/service/quick-bill-history"
        label="Today's Quick Bills"
        count={qb ? qb.count : null}
        sub={qb ? `Revenue ${formatInr(qb.revenue)}` : "Revenue —"}
        tone="green"
      />
      <SalesCard
        to="/service/srf-register"
        label="Today's SRF"
        count={srf ? srf.count : null}
        sub={
          srf
            ? `Revenue ${formatInr(srf.revenue)}${srf.advance > 0 ? ` · Advance ${formatInr(srf.advance)}` : ""}`
            : "Revenue —"
        }
        tone="gold"
      />
    </>
  );
}
