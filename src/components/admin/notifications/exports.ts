import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { saveFile, savePdfDocument } from "@/lib/fileDownload";

export type ExportRow = Record<string, string | number | null | undefined>;

export function exportCsv(filename: string, rows: ExportRow[], headers?: string[]) {
  const cols = headers ?? Object.keys(rows[0] || {});
  const esc = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const bom = "\uFEFF";
  void saveFile(
    filename.endsWith(".csv") ? filename : `${filename}.csv`,
    new Blob([bom + csv], { type: "text/csv;charset=utf-8" }),
  );
}

export function exportXlsx(filename: string, rows: ExportRow[], sheetName = "البيانات") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  void saveFile(
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
}

export async function exportPdfFromElement(filename: string, el: HTMLElement) {
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
  const img = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW - 40;
  const imgH = (canvas.height * imgW) / canvas.width;
  let heightLeft = imgH;
  let y = 20;
  pdf.addImage(img, "PNG", 20, y, imgW, imgH);
  heightLeft -= pageH - 40;
  while (heightLeft > 0) {
    pdf.addPage();
    y = 20 - (imgH - heightLeft);
    pdf.addImage(img, "PNG", 20, y, imgW, imgH);
    heightLeft -= pageH - 40;
  }
  await savePdfDocument(filename, pdf);
}
