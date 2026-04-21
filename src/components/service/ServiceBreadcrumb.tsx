import { Link } from "react-router-dom";
import { ServiceNavBar } from "./ServiceNavBar";

const linkClass =
  "text-sm font-medium text-zimson-800 underline decoration-zimson-300 underline-offset-2 hover:text-zimson-950";

export function ServiceBreadcrumb({ current, className = "" }: { current: string; className?: string }) {
  return (
    <>
      <nav
        className={`mb-3 flex flex-wrap items-center gap-2 text-sm text-stone-600 ${className}`.trim()}
        aria-label="Breadcrumb"
      >
        <Link to="/service" className={linkClass}>
          Service
        </Link>
        <span aria-hidden className="text-stone-400">
          /
        </span>
        <span className="font-medium text-stone-900">{current}</span>
      </nav>
      <ServiceNavBar />
    </>
  );
}
