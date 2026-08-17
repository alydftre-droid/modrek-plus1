import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight, Upload, RefreshCw, Loader2, CheckCircle2, XCircle,
  Clock, FileText, Layers, Boxes, Sparkles, AlertCircle, Play, Database,
  Cpu, Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { computeModrekFileFingerprint, registerModrekUpload } from "@/lib/modrekUpload";
import {
  ModrekShell, ModrekCard, ModrekButton, ModrekHero, ModrekEyebrow,
  ModrekStat, ModrekPill, ModrekEmpty,
} from "@/features/modrek/premium";

const STAGES: { key: string; label: string; kind: string; order: number }[] = [
  { key: "queued",               label: "في الانتظار",          kind: "detect",           order: 5 },
  { key: "uploaded",             label: "الرفع",               kind: "detect",           order: 10 },
  { key: "detecting",            label: "الاكتشاف",            kind: "detect",           order: 10 },
  { key: "ocr",                  label: "OCR",                 kind: "ocr",              order: 20 },
  { key: "text_extraction",      label: "استخراج النص",        kind: "extract_text",     order: 20 },
  { key: "structure_analysis",   label: "تحليل البنية",        kind: "structure",        order: 30 },
  { key: "knowledge_extraction", label: "استخراج المعرفة",     kind: "chunk",            order: 40 },
  { key: "embedding",            label: "توليد Embeddings",    kind: "embed",            order: 50 },
  { key: "indexing",             label: "الفهرسة",              kind: "index",            order: 60 },
  { key: "completed",            label: "مكتمل",               kind: "index",            order: 60 },
];

export default function ModrekSourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [source, setSource] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [currentVersion, setCurrentVersion] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [chunkStats, setChunkStats] = useState<{ total: number; embedded: number }>({ total: 0, embedded: 0 });
  const [pageSummary, setPageSummary] = useState<any>(null);
  const [retryingPages, setRetryingPages] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!id) return;
    const [src, vers] = await Promise.all([
      supabase.from("knowledge_sources").select("*").eq("id", id).maybeSingle(),
      supabase.from("knowledge_source_versions").select("*").eq("source_id", id).order("version_number", { ascending: false }),
    ]);
    if (src.error) return toast.error(src.error.message);
    setSource(src.data);
    setVersions((vers.data ?? []) as any);
    const cur = (vers.data ?? []).find((v: any) => v.is_current) ?? (vers.data ?? [])[0];
    setCurrentVersion(cur ?? null);
    if (cur) await loadVersionData(cur.id);
    setLoading(false);
  };

  const loadVersionData = async (versionId: string) => {
    const [j, u, cAll, cEmb] = await Promise.all([
      supabase.from("processing_jobs").select("*").eq("version_id", versionId).order("stage_order").order("created_at"),
      supabase.from("knowledge_units").select("id, kind, title, content_text, ordinal, word_count, confidence, page_from, page_to").eq("version_id", versionId).order("ordinal").limit(200),
      supabase.from("content_chunks").select("id", { count: "exact", head: true }).eq("version_id", versionId),
      supabase.from("content_chunks").select("id", { count: "exact", head: true }).eq("version_id", versionId).not("embedding", "is", null),
    ]);
    setJobs((j.data ?? []) as any);
    setUnits((u.data ?? []) as any);
    setChunkStats({ total: cAll.count ?? 0, embedded: cEmb.count ?? 0 });
    const { data: summary } = await supabase.rpc("modrek_version_page_summary" as any, { p_version_id: versionId });
    setPageSummary(Array.isArray(summary) ? summary[0] ?? null : summary ?? null);
    if (j.data?.length) {
      const jobIds = j.data.map((x: any) => x.id);
      const { data: ev } = await supabase.from("processing_events")
        .select("*").in("job_id", jobIds).order("created_at", { ascending: false }).limit(80);
      setEvents((ev ?? []) as any);
    } else setEvents([]);
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!currentVersion?.id) return;
    const ch = supabase.channel(`modrek-src-${currentVersion.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "processing_jobs", filter: `version_id=eq.${currentVersion.id}` },
        () => loadVersionData(currentVersion.id))
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "knowledge_source_versions", filter: `id=eq.${currentVersion.id}` },
        (payload) => setCurrentVersion((v: any) => ({ ...v, ...payload.new })))
      .subscribe();
    const timer = setInterval(() => loadVersionData(currentVersion.id), 8000);
    return () => { supabase.removeChannel(ch); clearInterval(timer); };
  }, [currentVersion?.id]);

  const onUpload = async (file: File) => {
    if (!currentVersion) { toast.error("لا توجد نسخة نشطة"); return; }
    if (file.size > 300 * 1024 * 1024) { toast.error("الحد الأقصى 300MB لكل ملف"); return; }
    setUploading(true);
    try {
      const { uploadToBunnyStorage } = await import("@/lib/bunnyStorage");
      const sha = await computeModrekFileFingerprint(file);
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const bunnyPath = `modrek/replace/${sha}/${safeName}`;
      await uploadToBunnyStorage(file, bunnyPath);
      await registerModrekUpload({
        version_id: currentVersion.id, bunny_path: bunnyPath,
        filename: file.name, mime: file.type || "application/octet-stream",
        size: file.size, sha256: sha,
      });
      toast.success("تم رفع الملف — بدأت المعالجة");
      await load();
    } catch (e: any) {
      toast.error(e.message || "فشل الرفع");
    } finally { setUploading(false); }
  };

  const retryJob = async (jobId: string) => {
    const { error } = await supabase.functions.invoke("modrek-retry", { body: { job_id: jobId } });
    if (error) toast.error(error.message); else { toast.success("أعيدت الجدولة"); await loadVersionData(currentVersion.id); }
  };
  const restartStage = async (kind: string) => {
    const { error } = await supabase.functions.invoke("modrek-retry", {
      body: { version_id: currentVersion.id, from_stage: kind },
    });
    if (error) toast.error(error.message); else { toast.success("تم إعادة تشغيل المرحلة"); await loadVersionData(currentVersion.id); }
  };
  const retryFailedPages = async () => {
    if (!currentVersion?.id) return;
    setRetryingPages(true);
    try {
      const { error } = await supabase.rpc("modrek_retry_failed_pages" as any, { p_version_id: currentVersion.id });
      if (error) throw error;
      await supabase.functions.invoke("modrek-worker", { body: {} }).catch(() => undefined);
      toast.success("تمت إعادة جدولة الصفحات الفاشلة فقط — لن تُعاد معالجة الصفحات الناجحة");
      await load();
    } catch (e: any) {
      toast.error(e.message || "تعذر إعادة جدولة الصفحات");
    } finally { setRetryingPages(false); }
  };

  const runNow = async () => {
    const { error } = await supabase.functions.invoke("modrek-worker", { body: {} });
    if (error) toast.error(error.message); else { toast.success("تم تشغيل عامل المعالجة"); await loadVersionData(currentVersion.id); }
  };

  const stageIdx = useMemo(() => {
    const s = currentVersion?.pipeline_stage ?? "uploaded";
    const i = STAGES.findIndex((x) => x.key === s);
    return i < 0 ? 0 : i;
  }, [currentVersion?.pipeline_stage]);
  const pipelineDone = currentVersion?.pipeline_stage === "completed";

  if (loading) {
    return (
      <ModrekShell>
        <div className="py-20 text-center">
          <Loader2 className="h-8 w-8 mx-auto animate-spin text-[#2563EB]" />
          <div className="mt-3 text-sm text-[#94A3B8]">جاري التحميل...</div>
        </div>
      </ModrekShell>
    );
  }
  if (!source) {
    return (
      <ModrekShell>
        <ModrekEmpty icon={Inbox} title="المصدر غير موجود" description="ربما تم حذفه أو أن الرابط غير صحيح." action={
          <Link to="/admin/modrek-library"><ModrekButton icon={ArrowRight}>العودة للمكتبة</ModrekButton></Link>
        } />
      </ModrekShell>
    );
  }

  return (
    <ModrekShell>
      <ModrekHero
        icon={Database}
        eyebrow={<ModrekEyebrow icon={Sparkles}>Modrek AI · Source</ModrekEyebrow>}
        title={source.title}
        subtitle={<>النسخة الحالية: <b>v{currentVersion?.version_number ?? 1}</b> · الحالة: <b className="text-[#2563EB]">{source.status}</b></>}
        actions={
          <>
            <Link to="/admin/modrek-library">
              <ModrekButton variant="secondary" size="md" icon={ArrowRight}>رجوع</ModrekButton>
            </Link>
            <ModrekButton variant="warning" size="md" icon={Play} onClick={runNow}>
              تشغيل العامل
            </ModrekButton>
            <ModrekButton
              variant="primary" size="md" icon={uploading ? Loader2 : Upload}
              loading={uploading} onClick={() => fileRef.current?.click()}
            >
              رفع ملف
            </ModrekButton>
            <input
              ref={fileRef} type="file" className="hidden"
              accept=".pdf,.docx,.pptx,.txt,image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }}
            />
          </>
        }
      />

      {/* Pipeline */}
      <ModrekCard padding="none">
        <div className="p-5 md:p-6 border-b border-[#F1F5F9] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-[12px] bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center ring-1 ring-[#DBEAFE]">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <div className="font-extrabold text-[15px] text-[#0F172A]">خط أنابيب المعالجة</div>
              <div className="text-[11px] text-[#94A3B8]">مراحل تحويل الملف إلى معرفة قابلة للبحث</div>
            </div>
          </div>
          <ModrekPill tone="blue">{currentVersion?.progress_pct ?? 0}%</ModrekPill>
        </div>
        <div className="p-5 md:p-6 space-y-4">
          <Progress value={currentVersion?.progress_pct ?? 0} className="h-2" />
          <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
            {STAGES.map((s, i) => {
              const state = pipelineDone || i < stageIdx ? "done" : i === stageIdx ? "active" : "pending";
              const failed = currentVersion?.pipeline_stage === "failed";
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => restartStage(s.kind)}
                  title={`إعادة تشغيل مرحلة: ${s.label}`}
                  className={cn(
                    "rounded-[12px] p-2.5 text-center text-[11px] border transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(37,99,235,0.15)]",
                    failed && i === stageIdx && "bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]",
                    !failed && state === "done" && "bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]",
                    !failed && state === "active" && "bg-white border-[#2563EB] text-[#1D4ED8] shadow-[0_8px_20px_rgba(37,99,235,0.15)] ring-2 ring-[#EFF6FF]",
                    !failed && state === "pending" && "bg-[#F8FAFC] border-[#E5E7EB] text-[#94A3B8]",
                  )}
                >
                  <div className="flex justify-center mb-1">
                    {failed && i === stageIdx ? <XCircle className="h-4 w-4" />
                      : state === "done" ? <CheckCircle2 className="h-4 w-4" />
                      : state === "active" ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Clock className="h-4 w-4" />}
                  </div>
                  <div className="font-bold">{s.label}</div>
                </button>
              );
            })}
          </div>

          {/* Per-stage retry shortcuts */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-dashed border-[#E5E7EB]">
            <span className="text-[11px] font-bold text-[#94A3B8] self-center">إعادة تشغيل مرحلة محددة:</span>
            <ModrekButton size="sm" variant="secondary" icon={RefreshCw} onClick={() => restartStage("ocr")}>OCR</ModrekButton>
            <ModrekButton size="sm" variant="secondary" icon={RefreshCw} onClick={() => restartStage("extract_text")}>استخراج النص</ModrekButton>
            <ModrekButton size="sm" variant="secondary" icon={RefreshCw} onClick={() => restartStage("structure")}>تحليل البنية</ModrekButton>
            <ModrekButton size="sm" variant="secondary" icon={RefreshCw} onClick={() => restartStage("chunk")}>Chunking</ModrekButton>
            <ModrekButton size="sm" variant="secondary" icon={RefreshCw} onClick={() => restartStage("embed")}>Embeddings</ModrekButton>
            <ModrekButton size="sm" variant="secondary" icon={RefreshCw} onClick={() => restartStage("index")}>الفهرسة</ModrekButton>
          </div>

          {currentVersion?.credits_blocked_at && (
            <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-[14px] bg-[#FFFBEB] border border-[#FDE68A]">
              <AlertCircle className="h-5 w-5 shrink-0 text-[#B45309]" />
              <div className="flex-1 text-[12px] font-bold text-[#92400E]">
                تم إيقاف المعالجة تلقائياً لعدم كفاية رصيد مزود الذكاء. كل ما تم استخراجه محفوظ، ولن يتم استهلاك المزيد من الطلبات.
                بعد إضافة الرصيد اضغط «إعادة معالجة الصفحات الفاشلة فقط».
              </div>
              <ModrekButton size="sm" variant="warning" icon={RefreshCw} onClick={retryFailedPages} disabled={retryingPages}>
                إعادة معالجة الصفحات الفاشلة فقط
              </ModrekButton>
            </div>
          )}

          {pageSummary && (
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-[14px] bg-[#F8FAFC] border border-[#E2E8F0]">
              <span className="text-[11px] font-bold text-[#64748B]">حالة الصفحات:</span>
              <span className="text-[12px] font-bold text-[#16A34A]">مكتملة {Number(pageSummary.done_pages ?? 0)}</span>
              <span className="text-[12px] font-bold text-[#DC2626]">فاشلة {Number(pageSummary.failed_pages ?? 0)}</span>
              <span className="text-[12px] font-bold text-[#2563EB]">قيد الانتظار {Number(pageSummary.pending_pages ?? 0)}</span>
              {Number(pageSummary.failed_pages ?? 0) > 0 && (
                <ModrekButton size="sm" variant="warning" icon={RefreshCw} onClick={retryFailedPages} disabled={retryingPages}>
                  إعادة الصفحات الفاشلة فقط
                </ModrekButton>
              )}
            </div>
          )}

          {currentVersion?.error_message && (
            <div className="flex items-start gap-3 p-4 rounded-[14px] bg-[#FEF2F2] border border-[#FECACA]">
              <AlertCircle className="h-5 w-5 shrink-0 text-[#DC2626] mt-0.5" />
              <div className="flex-1 text-[12px] text-[#991B1B]">{currentVersion.error_message}</div>
              <ModrekButton size="sm" variant="danger" icon={RefreshCw} onClick={() => restartStage("detect")}>
                إعادة من البداية
              </ModrekButton>
            </div>
          )}
        </div>
      </ModrekCard>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <ModrekStat label="أحرف مستخرجة" value={(currentVersion?.extracted_text?.length ?? 0).toLocaleString("ar-EG")} icon={FileText} accent="blue" />
        <ModrekStat label="وحدات معرفية" value={units.length.toLocaleString("ar-EG")} icon={Layers} accent="purple" />
        <ModrekStat label="Chunks" value={chunkStats.total.toLocaleString("ar-EG")} icon={Boxes} accent="amber" />
        <ModrekStat label="Embeddings" value={`${chunkStats.embedded}/${chunkStats.total}`} icon={Cpu} accent="emerald" />
      </div>

      {/* Tabs */}
      <ModrekCard padding="none" className="p-4">
        <Tabs defaultValue="jobs" dir="rtl">
          <TabsList className="bg-[#F1F5F9] border border-[#E5E7EB] rounded-[12px] p-1 h-11 gap-1">
            <TabsTrigger value="jobs" className="rounded-[8px] text-[13px] font-bold data-[state=active]:bg-white data-[state=active]:text-[#2563EB] data-[state=active]:shadow-[0_2px_8px_rgba(37,99,235,0.10)] text-[#64748B]">
              المهام ({jobs.length})
            </TabsTrigger>
            <TabsTrigger value="text" className="rounded-[8px] text-[13px] font-bold data-[state=active]:bg-white data-[state=active]:text-[#2563EB] data-[state=active]:shadow-[0_2px_8px_rgba(37,99,235,0.10)] text-[#64748B]">
              النص المستخرج
            </TabsTrigger>
            <TabsTrigger value="units" className="rounded-[8px] text-[13px] font-bold data-[state=active]:bg-white data-[state=active]:text-[#2563EB] data-[state=active]:shadow-[0_2px_8px_rgba(37,99,235,0.10)] text-[#64748B]">
              الوحدات ({units.length})
            </TabsTrigger>
            <TabsTrigger value="events" className="rounded-[8px] text-[13px] font-bold data-[state=active]:bg-white data-[state=active]:text-[#2563EB] data-[state=active]:shadow-[0_2px_8px_rgba(37,99,235,0.10)] text-[#64748B]">
              السجل ({events.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="space-y-2 mt-4">
            {jobs.length === 0 && <EmptyText>لا توجد مهام بعد. ابدأ برفع ملف.</EmptyText>}
            {jobs.map((j) => (
              <div key={j.id} className="rounded-[14px] bg-white border border-[#E5E7EB] p-3.5 hover:border-[#93C5FD] transition-colors">
                <div className="flex items-center gap-3">
                  <StatusDot s={j.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-[#0F172A]">{j.kind}</span>
                      <ModrekPill tone="blue" size="sm">order {j.stage_order}</ModrekPill>
                      <ModrekPill tone="slate" size="sm">محاولة {j.attempts}/{j.max_attempts ?? 3}</ModrekPill>
                      {j.input?.page_from && <ModrekPill tone="cyan" size="sm">صفحات {j.input.page_from}-{j.input.page_to ?? j.input.page_from}</ModrekPill>}
                    </div>
                    {j.status === "running" && <Progress value={j.progress_pct} className="h-1 mt-2" />}
                  </div>
                  <div className="text-[11px] text-[#94A3B8] tabular-nums">{j.finished_at ? new Date(j.finished_at).toLocaleTimeString("ar-EG") : "—"}</div>
                  {(j.status === "failed" || j.status === "retrying") && (
                    <ModrekButton size="sm" variant="warning" icon={RefreshCw} onClick={() => retryJob(j.id)}>إعادة</ModrekButton>
                  )}
                </div>
                {j.error && (
                  <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-[12px] bg-[#FEF2F2] p-3 text-left text-[11px] leading-5 text-[#991B1B]" dir="ltr">{j.error}</pre>
                )}
                {j.output?.heartbeat && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[10px] font-extrabold text-[#64748B]">آخر نبض / تفاصيل تقنية</summary>
                    <pre className="mt-2 max-h-36 overflow-auto rounded-[10px] bg-[#0F172A] p-3 text-left text-[10px] text-white" dir="ltr">{JSON.stringify(j.output.heartbeat, null, 2)}</pre>
                  </details>
                )}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="text" className="mt-4">
            <div className="rounded-[14px] bg-white border border-[#E5E7EB] p-4">
              <div className="text-[12px] text-[#94A3B8] mb-2">
                اللغة: <b className="text-[#0F172A]">{currentVersion?.extracted_language ?? "—"}</b> · الأحرف: <b className="text-[#0F172A]">{(currentVersion?.extracted_text?.length ?? 0).toLocaleString("ar-EG")}</b>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-[13px] max-h-[500px] overflow-auto bg-[#F8FAFC] p-4 rounded-[12px] border border-[#E5E7EB] text-[#334155] leading-relaxed">
                {currentVersion?.extracted_text ?? "لا يوجد نص مستخرج بعد."}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="units" className="space-y-2 mt-4">
            {units.length === 0 && <EmptyText>لا توجد وحدات معرفية بعد.</EmptyText>}
            {units.map((u) => (
              <div key={u.id} className="rounded-[14px] bg-white border border-[#E5E7EB] p-3.5 hover:border-[#C4B5FD] transition-colors">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <ModrekPill tone="purple" size="sm">{u.kind}</ModrekPill>
                  {u.title && <span className="font-bold text-sm text-[#0F172A]">{u.title}</span>}
                  {u.confidence != null && <ModrekPill tone="emerald" size="sm">ثقة {Math.round(u.confidence * 100)}%</ModrekPill>}
                  <span className="text-[11px] text-[#94A3B8] mr-auto">{u.word_count} كلمة</span>
                </div>
                {u.content_text && <div className="text-[12px] text-[#475569] line-clamp-3 leading-relaxed">{u.content_text}</div>}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="events" className="space-y-1.5 mt-4">
            {events.length === 0 && <EmptyText>لا توجد أحداث بعد.</EmptyText>}
            {events.map((e) => (
              <div
                key={e.id}
                className={cn(
                  "text-[12px] p-2.5 rounded-[10px] border flex items-start gap-2",
                  e.level === "error" && "bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]",
                  e.level === "warn" && "bg-[#FFFBEB] border-[#FEF3C7] text-[#B45309]",
                  (!e.level || (e.level !== "error" && e.level !== "warn")) && "bg-[#F8FAFC] border-[#E5E7EB] text-[#475569]",
                )}
              >
                <span className="tabular-nums text-[10px] opacity-70 shrink-0">{new Date(e.created_at).toLocaleTimeString("ar-EG")}</span>
                <span className="flex-1">
                  {e.message}
                  {e.data && Object.keys(e.data).length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[10px] font-extrabold opacity-80">تفاصيل</summary>
                      <pre className="mt-1 max-h-40 overflow-auto rounded-[8px] bg-[#0F172A] p-2 text-left text-[10px] leading-5 text-white" dir="ltr">{JSON.stringify(e.data, null, 2)}</pre>
                    </details>
                  )}
                </span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </ModrekCard>
    </ModrekShell>
  );
}

function StatusDot({ s }: { s: string }) {
  const map: any = {
    pending: { c: "bg-[#CBD5E1]", t: "قيد الانتظار" },
    running: { c: "bg-[#2563EB] animate-pulse", t: "قيد التشغيل" },
    succeeded: { c: "bg-[#22C55E]", t: "نجح" },
    failed: { c: "bg-[#EF4444]", t: "فشل" },
    retrying: { c: "bg-[#F59E0B] animate-pulse", t: "إعادة محاولة" },
    cancelled: { c: "bg-[#94A3B8]", t: "أُلغي" },
  };
  const m = map[s] ?? map.pending;
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full shrink-0", m.c)} title={m.t} />;
}

function EmptyText({ children }: any) {
  return <div className="text-center text-sm text-[#94A3B8] py-8">{children}</div>;
}
