import { Link } from "react-router-dom";

const linkClass =
  "text-sm font-medium text-zimson-800 underline decoration-zimson-300 underline-offset-2 hover:text-zimson-950";

export function InventoryBreadcrumb({ current }: { current: string }) {
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-2 text-sm text-stone-600" aria-label="Breadcrumb">
      <Link to="/inventory" className={linkClass}>
        Inventory
      </Link>
      <span aria-hidden className="text-stone-400">
        /
      </span>
      <span className="font-medium text-stone-900">{current}</span>
    </nav>
  );
}
