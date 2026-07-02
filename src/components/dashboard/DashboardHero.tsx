import type { SessionUser } from "../../types/user";
import { roleDashboardLabel } from "../../lib/dashboardActionCardStyles";
import { waitingActionItems, type DashboardActionItem } from "../../lib/dashboardActionItems";

type Props = {
  user: SessionUser | null;
  actionItems: DashboardActionItem[];
};

function scopeLabel(user: SessionUser | null): string {
  if (!user) return "Dashboard";
  if (user.role === "super_admin" || user.role === "admin") return "All Regions";
  if (user.role === "store_user" || user.role === "store_manager" || user.role === "store_accounts") {
    return "Your store";
  }
  if (user.regionId) return "Your region";
  return roleDashboardLabel(user.role);
}

function WatchHeroWatermark() {
  return (
    <svg
      className="dashboard-hero-watermark pointer-events-none absolute right-[-36px] top-1/2 -translate-y-1/2 text-white/[0.18]"
      viewBox="0 0 460 220"
      fill="none"
      aria-hidden
    >
      <g opacity="0.92">
        <circle cx="270" cy="110" r="98" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="270" cy="110" r="78" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
      </g>
      <g opacity="0.55" strokeLinecap="round">
        <path d="M270 28v18M270 174v18M188 110h18M334 110h18" stroke="currentColor" strokeWidth="1.1" />
        <path d="M208 50l12 12M320 158l12 12M332 50l-12 12M220 158l-12 12" stroke="currentColor" strokeWidth="1.1" />
        <path d="M216 74l18 6M208 92l20 3M208 128l20-4M216 146l17-8" stroke="currentColor" strokeWidth="1" />
        <path d="M324 74l-18 6M332 92l-20 3M332 128l-20-4M324 146l-17-8" stroke="currentColor" strokeWidth="1" />
      </g>

      <circle cx="270" cy="110" r="5" fill="currentColor" />
      <path d="M270 110V60M270 110l38 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />

      <g opacity="0.56">
        <path d="M206 32h128l10 15H196l10-15z" stroke="currentColor" strokeWidth="1.1" />
        <path d="M214 174h112l9 13H205l9-13z" stroke="currentColor" strokeWidth="1.05" />
      </g>

      <g opacity="0.5">
        <circle cx="228" cy="100" r="27" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="228" cy="100" r="10" stroke="currentColor" strokeWidth="1" />
        <circle cx="310" cy="129" r="22" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="310" cy="129" r="7.5" stroke="currentColor" strokeWidth="0.9" />
        <path d="M236 95l22-15 22 5M298 133l-24-8-10 16" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </g>

      <g opacity="0.45" strokeLinecap="round">
        <path d="M260 18l18-8M288 20l20-3M308 28l18 8" stroke="currentColor" strokeWidth="1" />
        <path d="M360 72l20-6M366 92l22 0M364 112l20 7" stroke="currentColor" strokeWidth="1" />
      </g>
    </svg>
  );
}

export function DashboardHero({ user, actionItems }: Props) {
  const firstName = (user?.displayName?.split(" ")[0] ?? "there").toUpperCase();
  const waiting = waitingActionItems(actionItems);
  const statusMessage =
    waiting.length > 0
      ? `${waiting.reduce((s, i) => s + i.count, 0)} items need your attention`
      : "System is up-to-date and performing well";

  return (
    <section id="cs-welcome" className="dashboard-hero">
      <WatchHeroWatermark />
      <h1 className="dashboard-hero-title">Welcome, {firstName}!</h1>
      <p className="dashboard-hero-sub">
        Overview: {scopeLabel(user)}
        <span className="mx-2 opacity-40">|</span>
        {statusMessage}
      </p>
    </section>
  );
}
