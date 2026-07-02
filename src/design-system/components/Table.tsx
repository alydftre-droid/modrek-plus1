import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown, Inbox, Loader2 } from "lucide-react";

export interface DSColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  align?: "start" | "center" | "end";
}

export interface DSTableProps<T> {
  columns: DSColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyLabel?: string;
  rowKey?: (row: T, index: number) => string | number;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSortChange?: (key: string, dir: "asc" | "desc") => void;
  onRowClick?: (row: T) => void;
}

export function DSTable<T>({
  columns, data, loading, emptyLabel = "لا توجد بيانات",
  rowKey, sortKey, sortDir, onSortChange, onRowClick,
}: DSTableProps<T>) {
  const align = (a?: "start" | "center" | "end") =>
    a === "center" ? "text-center" : a === "end" ? "text-end" : "text-start";

  return (
    <div className="w-full overflow-x-auto rounded-[14px] border border-[#E2E8F0] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
            {columns.map((c) => {
              const isActive = sortKey === c.key;
              const nextDir: "asc" | "desc" = isActive && sortDir === "asc" ? "desc" : "asc";
              const SortIcon = !c.sortable ? null : isActive ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
              return (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  className={`h-11 px-4 font-bold text-[13px] text-[#334155] ${align(c.align)}`}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-[#0F172A]"
                      onClick={() => onSortChange?.(c.key, nextDir)}
                    >
                      {c.header}
                      {SortIcon && <SortIcon className="h-3.5 w-3.5" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#2563EB] mx-auto" />
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center">
                <div className="inline-flex flex-col items-center gap-2 text-[#94A3B8]">
                  <Inbox className="h-8 w-8" />
                  <span className="text-[13px] font-semibold">{emptyLabel}</span>
                </div>
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={rowKey ? rowKey(row, i) : i}
                className={`border-b border-[#E2E8F0] last:border-0 transition-colors ${
                  onRowClick ? "cursor-pointer hover:bg-[#F8FAFC]" : ""
                }`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 text-[#0F172A] ${align(c.align)}`}>
                    {c.render(row, i)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export interface DSPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
}
export function DSPagination({ page, pageSize, total, onPageChange }: DSPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 mt-3 text-[13px] text-[#475569]">
      <div>عرض {from}-{to} من {total}</div>
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-9 w-9 inline-flex items-center justify-center rounded-[8px] border border-[#E2E8F0] text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40"
          aria-label="السابق"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="px-3 h-9 inline-flex items-center rounded-[8px] bg-[#F1F5F9] font-semibold text-[#0F172A]">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-9 w-9 inline-flex items-center justify-center rounded-[8px] border border-[#E2E8F0] text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40"
          aria-label="التالي"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
