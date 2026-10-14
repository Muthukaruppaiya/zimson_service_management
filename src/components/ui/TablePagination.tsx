import { PAGE_SIZE_OPTIONS, type Pagination } from "../../lib/usePagination";

type Props = {
  pagination: Pagination<unknown>;
  className?: string;
};

function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) out.push("gap");
    out.push(sorted[i]!);
  }
  return out;
}

const btn =
  "inline-flex h-8 min-w-8 items-center justify-center border border-rlx-rule bg-white px-2 text-xs font-semibold text-rlx-ink transition hover:border-rlx-green hover:text-rlx-green disabled:cursor-not-allowed disabled:opacity-35";

export function TablePagination({ pagination, className = "" }: Props) {
  const { page, pageSize, totalRows, totalPages, startIndex, endIndex, setPage, setPageSize } = pagination;
  if (totalRows <= PAGE_SIZE_OPTIONS[0]) return null;

  return (
    <div
      className={`mt-3 flex flex-col gap-2 border-t border-rlx-rule pt-3 sm:flex-row sm:items-center sm:justify-between ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center gap-3 text-xs text-rlx-ink-muted">
        <span>
          Showing <span className="font-semibold text-rlx-ink">{startIndex.toLocaleString()}</span>–
          <span className="font-semibold text-rlx-ink">{endIndex.toLocaleString()}</span> of{" "}
          <span className="font-semibold text-rlx-ink">{totalRows.toLocaleString()}</span>
        </span>
        <label className="inline-flex items-center gap-1.5">
          <span>Rows</span>
          <select
            className="h-8 border border-rlx-rule bg-white px-1.5 text-xs text-rlx-ink"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {totalPages > 1 ? (
        <nav className="flex flex-wrap items-center gap-1" aria-label="Pagination">
          <button type="button" className={btn} disabled={page <= 1} onClick={() => setPage(1)} aria-label="First page">
            «
          </button>
          <button type="button" className={btn} disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
            ‹
          </button>
          {pageWindow(page, totalPages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-rlx-ink-muted">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                aria-current={p === page ? "page" : undefined}
                className={
                  p === page
                    ? "inline-flex h-8 min-w-8 items-center justify-center border border-rlx-green bg-rlx-green px-2 text-xs font-semibold text-white"
                    : btn
                }
              >
                {p}
              </button>
            ),
          )}
          <button type="button" className={btn} disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Next page">
            ›
          </button>
          <button
            type="button"
            className={btn}
            disabled={page >= totalPages}
            onClick={() => setPage(totalPages)}
            aria-label="Last page"
          >
            »
          </button>
        </nav>
      ) : null}
    </div>
  );
}
