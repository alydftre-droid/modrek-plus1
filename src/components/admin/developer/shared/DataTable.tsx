import { useMemo, useState, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, FileSpreadsheet, Printer, Search } from "lucide-react";
import { exportToExcel, exportToPdfViaPrint } from "./exportHelpers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  accessor: (row: T) => ReactNode;
  exportValue?: (row: T) => string | number | null | undefined;
  sortValue?: (row: T) => string | number;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  searchable?: (row: T) => string;
  pageSize?: number;
  emptyLabel?: string;
  title?: string;
  exportName?: string;
  filters?: ReactNode;
  isLoading?: boolean;
}

export function DataTable<T>({
  data,
  columns,
  searchable,
  pageSize = 15,
  emptyLabel = "لا توجد بيانات",
  title = "بيانات",
  exportName = "export",
  filters,
  isLoading,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    let list = data;
    if (query && searchable) {
      const q = query.toLowerCase().trim();
      list = list.filter((row) => searchable(row).toLowerCase().includes(q));
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        list = [...list].sort((a, b) => {
          const va = col.sortValue!(a);
          const vb = col.sortValue!(b);
          if (va < vb) return sortDir === "asc" ? -1 : 1;
          if (va > vb) return sortDir === "asc" ? 1 : -1;
          return 0;
        });
      }
    }
    return list;
  }, [data, query, searchable, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const doExportExcel = () => {
    const rows = filtered.map((row) => {
      const obj: Record<string, string | number | null | undefined> = {};
      columns.forEach((c) => {
        obj[c.header] = c.exportValue ? c.exportValue(row) : String(c.accessor(row) ?? "");
      });
      return obj;
    });
    exportToExcel(rows, exportName);
  };

  const doExportPdf = () => {
    const headers = columns.map((c) => c.header);
    const rows = filtered.map((row) =>
      columns.map((c) => (c.exportValue ? c.exportValue(row) : String(c.accessor(row) ?? ""))),
    );
    exportToPdfViaPrint(title, headers, rows);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {filtered.length.toLocaleString("ar-EG")} سجل
          </p>
        </div>
        {searchable && (
          <div className="relative sm:w-64">
            <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="بحث..."
              className="pr-8 h-9 text-sm"
            />
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 h-9">
              <Download className="h-4 w-4" />
              تصدير
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={doExportExcel}>
              <FileSpreadsheet className="h-4 w-4 ml-2" />
              Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={doExportPdf}>
              <Printer className="h-4 w-4 ml-2" />
              PDF (طباعة)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filters && (
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/40">{filters}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`text-right font-semibold text-xs px-3 py-3 whitespace-nowrap ${c.className ?? ""}`}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => handleSort(c.key)}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      {c.header}
                      {sortKey === c.key ? (
                        sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={columns.length} className="py-10 text-center text-slate-400 text-sm">جاري التحميل...</td></tr>
            ) : pageData.length === 0 ? (
              <tr><td colSpan={columns.length} className="py-10 text-center text-slate-400 text-sm">{emptyLabel}</td></tr>
            ) : (
              pageData.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/60">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2.5 text-slate-700 ${c.className ?? ""}`}>
                      {c.accessor(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
          <span>صفحة {safePage} من {totalPages}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>السابق</Button>
            <Button variant="outline" size="sm" disabled={safePage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>التالي</Button>
          </div>
        </div>
      )}
    </div>
  );
}
