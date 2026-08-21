import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Database, RefreshCw, ShieldAlert, Wrench, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import {
  ModrekShell, ModrekCard, ModrekButton, ModrekHero, ModrekEyebrow,
  ModrekStat, ModrekSection, ModrekPill, ModrekEmpty,
} from "@/features/modrek/premium";

interface DiagRow {
  source_id: string;
  title: string | null;
  status: string | null;
  subject: string | null;
  grade: string | null;
  latest_version_id: string | null;
  pipeline_stage: string | null;
  versions: number;
  pages: number;
  units: number;
  chunks: number;
  embedded_chunks: number;
  lessons: number;
  numbered_lessons: number;
  linked_chunks: number;
  searchable: boolean;
  issues: string[] | null;
  updated_at: string | null;
}

const ISSUE_LABELS: Record<string, string> = {
  no_version: "لا توجد نسخة معالجة للكتاب (فشل الرفع قبل بدء الفهرسة)",
  no_pages_extracted: "لم يُستخرج أي صفحة من ملف PDF",
  no_content_chunks: "لم تُنشأ أي مقاطع نصية — لا يمكن للمساعد قراءة الكتاب",
  no_embeddings: "المقاطع موجودة لكن بدون تضمين دلالي — البحث الذكي متوقف",
  no_lesson_index: "لم يُكتشف أي درس داخل الكتاب — أعد تشغيل إصلاح الفهرسة",
  lessons_without_numbers: "الدروس بدون أرقام مطبوعة — احتمال خلط بين الدروس",
  chunks_not_linked_to_lessons: "المقاطع غير مرتبطة بالدروس — قفل الدرس غير مفعّل",
  ready_but_not_searchable: "الكتاب معتمد للطلاب لكنه غير قابل للبحث فعليًا",
};

const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(n ?? 0);

export default function ModrekIndexingDiagnosticsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DiagRow[]>([]);
  const [repairing, setRepairing] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("modrek_library_diagnostics" as any);
    if (error) toast.error("تعذر تحميل تشخيص الفهرسة: " + error.message);
    setRows(((data ?? []) as any[]) as DiagRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    books: acc.books + 1,
    pages: acc.pages + (r.pages || 0),
    chunks: acc.chunks + (r.chunks || 0),
    units: acc.units + (r.units || 0),
    lessons: acc.lessons + (r.lessons || 0),
    broken: acc.broken + ((r.issues?.length ?? 0) > 0 ? 1 : 0),
  }), { books: 0, pages: 0, chunks: 0, units: 0, lessons: 0, broken: 0 }), [rows]);

  const visible = onlyProblems ? rows.filter((r) => (r.issues?.length ?? 0) > 0) : rows;

  const repair = async (sourceId: string) => {
    setRepairing(sourceId);
    const { data, error } = await supabase.rpc("modrek_admin_repair_source" as any, { p_source_id: sourceId });
    setRepairing(null);
    if (error) { toast.error("فشل الإصلاح: " + error.message); return; }
    const info: any = data ?? {};
    toast.success(`تم إصلاح الفهرسة — دروس: ${info.lessons ?? "?"} • مقاطع مرتبطة: ${info.linked_chunks ?? info.linked ?? "?"}`);
    load();
  };

  return (
    <ModrekShell>
      <ModrekButton variant="ghost" onClick={() => navigate("/admin")}>
        <ArrowRight className="w-4 h-4" /> رجوع للوحة المطور
      </ModrekButton>

      <ModrekHero
        icon={Database}
        eyebrow={<ModrekEyebrow icon={Database}>تشخيص الفهرسة</ModrekEyebrow>}
        title="حالة فهرسة كتب مكتبة Modrek AI"
        subtitle="أعداد الصفحات والمقاطع والوحدات والدروس لكل كتاب، وسبب ظهور أي كتاب بلا فهرسة."
        actions={
          <ModrekButton onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> تحديث
          </ModrekButton>
        }
      />

      <ModrekSection title="ملخص عام">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <ModrekStat label="الكتب" value={fmt(totals.books)} icon={Database} />
          <ModrekStat label="الصفحات" value={fmt(totals.pages)} icon={Database} />
          <ModrekStat label="المقاطع النصية" value={fmt(totals.chunks)} icon={Database} />
          <ModrekStat label="الوحدات" value={fmt(totals.units)} icon={Database} />
          <ModrekStat label="الدروس" value={fmt(totals.lessons)} icon={Database} />
          <ModrekStat label="كتب بها مشاكل" value={fmt(totals.broken)} icon={ShieldAlert} />
        </div>
        <div className="mt-3">
          <ModrekButton variant={onlyProblems ? "primary" : "ghost"} onClick={() => setOnlyProblems((v) => !v)}>
            {onlyProblems ? "عرض كل الكتب" : "عرض الكتب التي بها مشاكل فقط"}
          </ModrekButton>
        </div>
      </ModrekSection>

      <ModrekSection title="تفاصيل كل كتاب">
        {loading ? (
          <ModrekCard><p className="text-sm opacity-70">جارٍ التحميل…</p></ModrekCard>
        ) : visible.length === 0 ? (
          <ModrekEmpty icon={Database} title="لا توجد كتب لعرضها" description="ارفع كتابًا من مكتبة Modrek AI ثم تابع حالته هنا." />
        ) : (
          <div className="space-y-3">
            {visible.map((r) => {
              const issues = r.issues ?? [];
              return (
                <ModrekCard key={r.source_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-base truncate">{r.title || "بدون عنوان"}</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {r.subject && <ModrekPill>{r.subject}</ModrekPill>}
                        {r.grade && <ModrekPill>{r.grade}</ModrekPill>}
                        <ModrekPill>{r.status || "غير محدد"}</ModrekPill>
                        {r.pipeline_stage && <ModrekPill>{r.pipeline_stage}</ModrekPill>}
                        {issues.length === 0 ? (
                          <ModrekPill tone="emerald">فهرسة سليمة</ModrekPill>
                        ) : (
                          <ModrekPill tone="red">{issues.length} مشكلة</ModrekPill>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <ModrekButton variant="ghost" onClick={() => navigate(`/admin/modrek-library/${r.source_id}`)}>
                        تفاصيل الكتاب
                      </ModrekButton>
                      <ModrekButton onClick={() => repair(r.source_id)} disabled={repairing === r.source_id}>
                        <Wrench className={`w-4 h-4 ${repairing === r.source_id ? "animate-spin" : ""}`} /> إعادة إصلاح الفهرسة
                      </ModrekButton>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 md:grid-cols-7 gap-2 mt-4 text-center text-xs">
                    {[
                      ["الصفحات", r.pages],
                      ["المقاطع", r.chunks],
                      ["التضمينات", r.embedded_chunks],
                      ["الوحدات", r.units],
                      ["الدروس", r.lessons],
                      ["دروس مرقّمة", r.numbered_lessons],
                      ["مقاطع مرتبطة بدرس", r.linked_chunks],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-xl border border-border/60 bg-muted/30 p-2">
                        <div className="font-bold text-sm">{fmt(Number(value))}</div>
                        <div className="opacity-70 mt-1">{label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 text-sm">
                    {issues.length === 0 ? (
                      <p className="flex items-center gap-2 text-emerald-600">
                        <CheckCircle2 className="w-4 h-4" /> الكتاب مفهرس بالكامل ويمكن للمساعد الاعتماد عليه كمصدر أول.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {issues.map((code) => (
                          <li key={code} className="flex items-start gap-2 text-destructive">
                            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{ISSUE_LABELS[code] || code}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </ModrekCard>
              );
            })}
          </div>
        )}
      </ModrekSection>
    </ModrekShell>
  );
}
