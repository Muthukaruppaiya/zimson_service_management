import { Link } from "react-router-dom";

function IconHome({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  );
}

/** Rounded icon button for the shared app-modal footers. */
export const homeLinkIconClass =
  "inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 hover:text-rlx-green";

/** Square-cornered icon button matching the inventory / user success pop-ups. */
export const homeLinkFlatClass =
  "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center border border-rlx-rule bg-white text-stone-700 transition hover:bg-stone-50 hover:text-rlx-green";

/** Icon-only "Home" exit for success pop-ups; navigates to the dashboard. */
export function HomeLink({ className = homeLinkIconClass, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Link to="/" className={className} onClick={onClick} title="Go to home" aria-label="Go to home">
      <IconHome />
    </Link>
  );
}
