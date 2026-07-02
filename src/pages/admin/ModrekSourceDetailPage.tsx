import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DSProvider } from "@/design-system";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight, Upload, RefreshCw, Loader2, CheckCircle2, XCircle,
  Clock, FileText, Layers, Boxes, Sparkles, AlertCircle, Play,
} from "lucide-react";
import { toast } from "sonner";

const STAGES: { key: string; label: string; kind: string; order: number }[] = [
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
    if (j.data?.length) {
      const jobIds = j.data.map((x: any) => x.id);
      const { data: ev } = await supabase.from("processing_events")
        .select("*").in("job_id", jobIds).order("created_at", { ascending: false }).limit(80);
      setEvents((ev ?? []) as any);
    } else setEvents([]);
  };

  useEffect(() => { load(); }, [id]);

  // Realtime updates
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
    setUploading(true);
    try {
      const form = new FormData();
      form.append("version_id", currentVersion.id);
      form.append("file", file);
      const { data, error } = await supabase.functions.invoke("modrek-upload", { body: form });
      if (error) throw error;
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
  const runNow = async () => {
    const { error } = await supabase.functions.invoke("modrek-worker", { body: {} });
    if (error) toast.error(error.message); else { toast.success("تم تشغيل عامل المعالجة"); await loadVersionData(currentVersion.id); }
  };

  const stageIdx = useMemo(() => {
    const s = currentVersion?.pipeline_stage ?? "uploaded";
    const i = STAGES.findIndex((x) => x.key === s);
    return i < 0 ? 0 : i;
  }, [currentVersion?.pipeline_stage]);

  if (loading) {
    return <DSProvider><div className="py-20 text-center"><Loader2 className="h-8 w-8 mx-auto animate-spin text-blue-600" /></div></DSProvider>;
  }
  if (!source) return <DSProvider><div className="p-8">المصدر غير موجود</div></DSProvider>;

  return (
    <DSProvider>
      <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to="/admin/modrek-library"><Button variant="ghost" size="icon"><ArrowRight className="h-4 w-4" /></Button></Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{source.title}</h1>
              <p className="text-xs text-slate-500">النسخة الحالية: v{currentVersion?.version_number ?? 1} • الحالة: {source.status}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={runNow}><Play className="h-4 w-4 ml-1" /> تشغيل العامل الآن</Button>
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Upload className="h-4 w-4 ml-1" />}
              رفع ملف
            </Button>
            <input ref={fileRef} type="file" className="hidden"
              accept=".pdf,.docx,.pptx,.txt,image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
          </div>
        </div>

        {/* Pipeline stepper */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-600" /> خط أنابيب المعالجة</CardTitle>
              <div className="text-xs text-slate-500">{currentVersion?.progress_pct ?? 0}%</div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={currentVersion?.progress_pct ?? 0} className="h-2" />
            <div className="grid grid-cols-2 md:grid-cols-9 gap-2">
              {STAGES.map((s, i) => {
                const state = i < stageIdx ? "done" : i === stageIdx ? "active" : "pending";
                const failed = currentVersion?.pipeline_stage === "failed";
                return (
                  <div key={s.key} className={`rounded-lg border p-2 text-center text-[11px]
                    ${failed && i === stageIdx ? "bg-rose-50 border-rose-200 text-rose-700"
                    : state === "done" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : state === "active" ? "bg-blue-50 border-blue-300 text-blue-700 shadow-sm"
                    : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                    <div className="flex justify-center mb-1">
                      {failed && i === stageIdx ? <XCircle className="h-4 w-4" />
                        : state === "done" ? <CheckCircle2 className="h-4 w-4" />
                        : state === "active" ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Clock className="h-4 w-4" />}
                    </div>
                    <div className="font-medium">{s.label}</div>
                  </div>
                );
              })}
            </div>
            {currentVersion?.error_message && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <div className="flex-1">{currentVersion.error_message}</div>
                <Button size="sm" variant="outline" onClick={() => restartStage("detect")}><RefreshCw className="h-3.5 w-3.5 ml-1" /> إعادة من البداية</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={FileText} label="أحرف مستخرجة" value={(currentVersion?.extracted_text?.length ?? 0).toLocaleString("ar-EG")} tone="blue" />
          <Kpi icon={Layers} label="وحدات معرفية" value={units.length} tone="violet" />
          <Kpi icon={Boxes} label="Chunks" value={chunkStats.total} tone="amber" />
          <Kpi icon={Sparkles} label="Embeddings" value={`${chunkStats.embedded}/${chunkStats.total}`} tone="emerald" />
        </div>

        <Tabs defaultValue="jobs" dir="rtl">
          <TabsList>
            <TabsTrigger value="jobs">المهام ({jobs.length})</TabsTrigger>
            <TabsTrigger value="text">النص المستخرج</TabsTrigger>
            <TabsTrigger value="units">الوحدات ({units.length})</TabsTrigger>
            <TabsTrigger value="events">السجل ({events.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="space-y-2">
            {jobs.length === 0 && <EmptyText>لا توجد مهام بعد. ابدأ برفع ملف.</EmptyText>}
            {jobs.map((j) => (
              <Card key={j.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <StatusDot s={j.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{j.kind}</span>
                      <Badge variant="secondary" className="text-[10px]">order {j.stage_order}</Badge>
                      <Badge variant="outline" className="text-[10px]">محاولة {j.attempts}/{j.max_attempts ?? 3}</Badge>
                    </div>
                    {j.error && <div className="text-xs text-rose-600 mt-1 truncate">{j.error}</div>}
                    {j.status === "running" && <Progress value={j.progress_pct} className="h-1 mt-2" />}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">{j.finished_at ? new Date(j.finished_at).toLocaleTimeString("ar-EG") : "—"}</div>
                  {(j.status === "failed" || j.status === "retrying") && (
                    <Button size="sm" variant="outline" onClick={() => retryJob(j.id)}>
                      <RefreshCw className="h-3.5 w-3.5 ml-1" /> إعادة
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="text">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-slate-500 mb-2">
                  اللغة: {currentVersion?.extracted_language ?? "—"} • الأحرف: {(currentVersion?.extracted_text?.length ?? 0).toLocaleString("ar-EG")}
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm max-h-[500px] overflow-auto bg-slate-50 p-3 rounded-lg border">
                  {currentVersion?.extracted_text ?? "لا يوجد نص مستخرج بعد."}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="units" className="space-y-2">
            {units.length === 0 && <EmptyText>لا توجد وحدات معرفية بعد.</EmptyText>}
            {units.map((u) => (
              <Card key={u.id}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-[10px]">{u.kind}</Badge>
                    {u.title && <span className="font-semibold text-sm">{u.title}</span>}
                    {u.confidence != null && <span className="text-[10px] text-slate-500">ثقة {Math.round(u.confidence * 100)}%</span>}
                    <span className="text-[10px] text-slate-500 mr-auto">{u.word_count} كلمة</span>
                  </div>
                  {u.content_text && <div className="text-xs text-slate-600 line-clamp-3">{u.content_text}</div>}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="events" className="space-y-1">
            {events.length === 0 && <EmptyText>لا توجد أحداث بعد.</EmptyText>}
            {events.map((e) => (
              <div key={e.id} className={`text-xs p-2 rounded border flex items-start gap-2
                ${e.level === "error" ? "bg-rose-50 border-rose-200 text-rose-700"
                : e.level === "warn" ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-slate-50 border-slate-200 text-slate-700"}`}>
                <span className="tabular-nums text-[10px] opacity-70">{new Date(e.created_at).toLocaleTimeString("ar-EG")}</span>
                <span className="flex-1">{e.message}</span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </DSProvider>
  );
}

function Kpi({ icon: Icon, label, value, tone }: any) {
  const tones: any = {
    blue: "bg-blue-50 text-blue-600", emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600", violet: "bg-violet-50 text-violet-600",
  };
  return (
    <Card>
      <CardContent className="p-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-slate-500">{label}</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums">{value}</p>
        </div>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusDot({ s }: { s: string }) {
  const map: any = {
    pending:   { c: "bg-slate-300",   t: "قيد الانتظار" },
    running:   { c: "bg-blue-500 animate-pulse", t: "قيد التشغيل" },
    succeeded: { c: "bg-emerald-500", t: "نجح" },
    failed:    { c: "bg-rose-500",    t: "فشل" },
    retrying:  { c: "bg-amber-500 animate-pulse", t: "إعادة محاولة" },
    cancelled: { c: "bg-slate-400",   t: "أُلغي" },
  };
  const m = map[s] ?? map.pending;
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${m.c}`} title={m.t} />;
}

function EmptyText({ children }: any) {
  return <div className="text-center text-sm text-slate-500 py-8">{children}</div>;
}
