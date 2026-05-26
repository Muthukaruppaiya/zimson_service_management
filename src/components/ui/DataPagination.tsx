type DataPaginationProps = {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
};

export function DataPagination({ currentPage, totalPages, onPrev, onNext }: DataPaginationProps) {
  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-rlx-rule pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[11px] text-rlx-ink-muted">
        Page <span className="font-semibold text-rlx-ink">{currentPage}</span> of{" "}
        <span className="font-semibold text-rlx-ink">{totalPages}</span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={onPrev}
          className="border border-rlx-rule bg-white px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rlx-ink transition hover:border-rlx-green hover:text-rlx-green disabled:opacity-35"
        >
          ← Prev
        </button>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={onNext}
          className="border border-rlx-rule bg-white px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-rlx-ink transition hover:border-rlx-green hover:text-rlx-green disabled:opacity-35"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
