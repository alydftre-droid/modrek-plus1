import * as XLSX from "xlsx";

export function exportToExcel<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  sheetName = "Report",
) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const fname = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, fname);
}

// Uses browser print for reliable Arabic/RTL PDF output.
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function exportToPdfViaPrint(
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=800");
  if (!w) return;
  const style = `
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: "Cairo", "Tahoma", Arial, sans-serif; direction: rtl; color: #111; }
      h1 { font-size: 18px; margin: 0 0 12px; border-bottom: 2px solid #2563EB; padding-bottom: 6px; }
      .meta { font-size: 11px; color: #666; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #E5E7EB; padding: 6px 8px; text-align: right; }
      th { background: #F3F4F6; font-weight: 700; }
      tr:nth-child(even) td { background: #FAFAFA; }
    </style>`;
  const safeTitle = escapeHtml(title);
  const body = `
    <h1>${safeTitle}</h1>
    <div class="meta">تاريخ التصدير: ${escapeHtml(new Date().toLocaleString("ar-EG"))}</div>
    <table>
      <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows
        .map(
          (r) =>
            `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`,
        )
        .join("")}</tbody>
    </table>`;
  w.document.write(
    `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${safeTitle}</title>${style}</head><body>${body}<script>setTimeout(()=>window.print(),300);</script></body></html>`,
  );
  w.document.close();
}
