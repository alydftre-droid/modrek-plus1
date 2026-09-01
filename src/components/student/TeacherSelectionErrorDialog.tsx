import { useState } from "react";
import { AlertCircle, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ErrorLike = { code?: unknown; message?: unknown; details?: unknown; hint?: unknown; status?: unknown };

export interface TeacherSelectionDiagnostic {
  title: string;
  reason: string;
  code: string;
  details: string;
  hint: string;
  operation: string;
  source: string;
  report: string;
}

interface BuildDiagnosticOptions {
  error: unknown;
  source: string;
  stage: string;
  grade: string;
  category: string;
}

const readable = (value: unknown, fallback: string) => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return fallback;
};

export function buildTeacherSelectionDiagnostic({ error, source, stage, grade, category }: BuildDiagnosticOptions): TeacherSelectionDiagnostic {
  const value = (error && typeof error === "object" ? error : {}) as ErrorLike;
  const reason = readable(value.message, error instanceof Error ? error.message : "خطأ غير معروف من قاعدة البيانات");
  const code = readable(value.code ?? value.status, "NO_ERROR_CODE");
  const details = readable(value.details, "لا توجد تفاصيل إضافية");
  const hint = readable(value.hint, "لا يوجد اقتراح من قاعدة البيانات");
  const operation = "select_my_teacher";
  const route = typeof window === "undefined" ? "غير متاح" : `${window.location.pathname}${window.location.search}`;
  const report = [
    "تقرير خطأ اختيار المعلم — Modrek Plus",
    `العملية: ${operation}`,
    `رمز الخطأ: ${code}`,
    `الرسالة الأصلية: ${reason}`,
    `التفاصيل: ${details}`,
    `اقتراح قاعدة البيانات: ${hint}`,
    `الملف/الدالة: ${source}`,
    `المرحلة: ${stage || "فارغ"}`,
    `الصف: ${grade || "فارغ"}`,
    `المادة: ${category || "فارغ"}`,
    `المسار: ${route}`,
    `الوقت UTC: ${new Date().toISOString()}`,
  ].join("\n");
  return { title: "تعذّر اختيار المعلم", reason, code, details, hint, operation, source, report };
}

interface Props {
  diagnostic: TeacherSelectionDiagnostic | null;
  onOpenChange: (open: boolean) => void;
}

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
};

export default function TeacherSelectionErrorDialog({ diagnostic, onOpenChange }: Props) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!diagnostic) return;
    try {
      await copyText(diagnostic.report);
      setCopied(true);
      toast.success("تم نسخ تقرير الخطأ بالكامل");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("تعذّر النسخ التلقائي، اضغط مطولاً على التقرير لنسخه");
    }
  };

  return (
    <Dialog open={Boolean(diagnostic)} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto text-right">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />{diagnostic?.title}
          </DialogTitle>
          <DialogDescription>لم يتم إكمال الاختيار. انسخ التقرير التالي وأرسله للمطور كما هو.</DialogDescription>
        </DialogHeader>
        {diagnostic && <div className="space-y-3">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>السبب الحقيقي</AlertTitle>
            <AlertDescription className="mt-2 break-words" dir="ltr">{diagnostic.reason}</AlertDescription>
          </Alert>
          <dl className="grid gap-2 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="font-semibold">رمز الخطأ</dt><dd dir="ltr" className="break-all font-mono">{diagnostic.code}</dd>
            <dt className="font-semibold">العملية</dt><dd dir="ltr" className="break-all font-mono">{diagnostic.operation}</dd>
            <dt className="font-semibold">الملف والدالة</dt><dd dir="ltr" className="break-all font-mono">{diagnostic.source}</dd>
            <dt className="font-semibold">تفاصيل القاعدة</dt><dd dir="ltr" className="break-words">{diagnostic.details}</dd>
            <dt className="font-semibold">اقتراح الإصلاح</dt><dd dir="ltr" className="break-words">{diagnostic.hint}</dd>
          </dl>
          <div>
            <p className="mb-2 text-sm font-semibold">التقرير الكامل القابل للنسخ</p>
            <pre dir="ltr" className="max-h-56 select-text overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted p-3 text-left font-mono text-xs leading-6 text-foreground">{diagnostic.report}</pre>
          </div>
        </div>}
        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={handleCopy} disabled={!diagnostic} className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "تم النسخ" : "نسخ تقرير الخطأ"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}