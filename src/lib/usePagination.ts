import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export type Pagination<T> = {
  pageRows: T[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  /** 1-based index of the first row on this page (0 when empty). */
  startIndex: number;
  endIndex: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
};

/** Client-side paging; jumps back to page 1 whenever the source rows change (filters, reload). */
export function usePagination<T>(rows: T[], initialPageSize = 25): Pagination<T> {
  const [page, setPageRaw] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(initialPageSize);

  useEffect(() => {
    setPageRaw(1);
  }, [rows]);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);

  const pageRows = useMemo(
    () => rows.slice((current - 1) * pageSize, current * pageSize),
    [rows, current, pageSize],
  );

  return {
    pageRows,
    page: current,
    pageSize,
    totalRows,
    totalPages,
    startIndex: totalRows === 0 ? 0 : (current - 1) * pageSize + 1,
    endIndex: Math.min(current * pageSize, totalRows),
    setPage: (p) => setPageRaw(Math.min(Math.max(1, p), totalPages)),
    setPageSize: (size) => {
      setPageSizeRaw(size);
      setPageRaw(1);
    },
  };
}
