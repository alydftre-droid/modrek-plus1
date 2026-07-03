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
  Clock, FileText, Layers, Boxes, Sparkles, AlertCircle, Play, Database,
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
    return <DSProvider><div className="min-h-screen bg-gradient-to-br from-[#EFF6FF] via-white to-[#F5F3FF] py-20 text-center"><Loader2 className="h-8 w-8 mx-auto animate-spin text-blue-600" /></div></DSProvider>;
  }
  if (!source) return <DSProvider><div className="min-h-screen bg-gradient-to-br from-[#EFF6FF] via-white to-[#F5F3FF] p-8 font-black text-[#0F172A]">المصدر غير موجود</div></DSProvider>;

  return (
    <DSProvider>
      <div className="min-h-screen bg-gradient-to-br from-[#EFF6FF] via-white to-[#F5F3FF] p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0F172A] via-[#1D4ED8] to-[#7C3AED] p-5 md:p-7 shadow-[0_24px_55px_-16px_rgba(29,78,216,0.52)] ring-1 ring-white/50 flex items-center justify-between flex-wrap gap-4">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_38%)]" />
          <div className="flex items-center gap-3">
            <Link to="/admin/modrek-library" className="relative"><Button className="bg-white/15 hover:bg-white/25 text-white border border-white/25" size="icon"><ArrowRight className="h-4 w-4" /></Button></Link>
            <div className="relative h-12 w-12 rounded-2xl bg-white/15 text-white flex items-center justify-center shadow-lg ring-1 ring-white/25">
              <Database className="h-6 w-6" />
            </div>
            <div>
              <h1 className="relative text-xl md:text-2xl font-black text-white">{source.title}</h1>
              <p className="relative text-xs text-white/80 mt-1">النسخة الحالية: v{currentVersion?.version_number ?? 1} • الحالة: {source.status}</p>
            </div>
          </div>
          <div className="relative flex gap-2">
            <Button size="sm" onClick={runNow} className="bg-gradient-to-l from-[#F59E0B] to-[#EA580C] text-white hover:from-[#D97706] hover:to-[#C2410C] border-0 shadow-lg shadow-orange-500/25"><Play className="h-4 w-4 ml-1" /> تشغيل العامل الآن</Button>
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-gradient-to-l from-[#059669] to-[#047857] text-white hover:from-[#047857] hover:to-[#065F46] border-0 shadow-lg shadow-emerald-500/25">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Upload className="h-4 w-4 ml-1" />}
              رفع ملف
            </Button>
            <input ref={fileRef} type="file" className="hidden"
              accept=".pdf,.docx,.pptx,.txt,image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
          </div>
        </div>

        {/* Pipeline stepper */}
        <Card className="border-2 border-[#BFDBFE] shadow-lg bg-white overflow-hidden">
          <CardHeader className="pb-3 bg-gradient-to-l from-[#EFF6FF] to-white border-b border-[#BFDBFE]">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-black flex items-center gap-2 text-[#0F172A]"><span className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] text-white flex items-center justify-center"><Sparkles className="h-4 w-4" /></span> خط أنابيب المعالجة</CardTitle>
              <div className="text-xs font-black text-white bg-[#2563EB] px-2.5 py-1 rounded-full">{currentVersion?.progress_pct ?? 0}%</div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={currentVersion?.progress_pct ?? 0} className="h-2" />
            <div className="grid grid-cols-2 md:grid-cols-9 gap-2">
              {STAGES.map((s, i) => {
                const state = i < stageIdx ? "done" : i === stageIdx ? "active" : "pending";
                const failed = currentVersion?.pipeline_stage === "failed";
                return (
                  <div key={s.key} className={`rounded-xl border-2 p-2 text-center text-[11px] shadow-sm
                    ${failed && i === stageIdx ? "bg-gradient-to-br from-[#DC2626] to-[#BE123C] border-rose-300 text-white"
                    : state === "done" ? "bg-gradient-to-br from-[#059669] to-[#047857] border-emerald-300 text-white"
                    : state === "active" ? "bg-gradient-to-br from-[#2563EB] to-[#7C3AED] border-blue-300 text-white shadow-lg"
                    : "bg-[#F1F5F9] border-slate-300 text-slate-700"}`}>
                    <div className="flex justify-center mb-1">
                      {failed && i === stageIdx ? <XCircle className="h-4 w-4" />
                        : state === "done" ? <CheckCircle2 className="h-4 w-4" />
                        : state === "active" ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Clock className="h-4 w-4" />}
                    </div>
                    <div className="font-black">{s.label}</div>
                  </div>
                );
              })}
            </div>
            {currentVersion?.error_message && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-[#FEF2F2] border-2 border-[#FCA5A5] text-[#B91C1C] text-xs">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <div className="flex-1">{currentVersion.error_message}</div>
                <Button size="sm" onClick={() => restartStage("detect")} className="bg-[#DC2626] text-white hover:bg-[#B91C1C] border-0"><RefreshCw className="h-3.5 w-3.5 ml-1" /> إعادة من البداية</Button>
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

        <Tabs defaultValue="jobs" dir="rtl" className="rounded-2xl border-2 border-[#BFDBFE] bg-white p-3 shadow-sm">
          <TabsList className="bg-[#DBEAFE] border border-[#BFDBFE]">
            <TabsTrigger value="jobs" className="font-black data-[state=active]:bg-[#2563EB] data-[state=active]:text-white">المهام ({jobs.length})</TabsTrigger>
            <TabsTrigger value="text" className="font-black data-[state=active]:bg-[#7C3AED] data-[state=active]:text-white">النص المستخرج</TabsTrigger>
            <TabsTrigger value="units" className="font-black data-[state=active]:bg-[#059669] data-[state=active]:text-white">الوحدات ({units.length})</TabsTrigger>
            <TabsTrigger value="events" className="font-black data-[state=active]:bg-[#F59E0B] data-[state=active]:text-white">السجل ({events.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="space-y-2">
            {jobs.length === 0 && <EmptyText>لا توجد مهام بعد. ابدأ برفع ملف.</EmptyText>}
            {jobs.map((j) => (
              <Card key={j.id} className="border-2 border-[#E2E8F0] hover:border-[#93C5FD] transition-colors">
                <CardContent className="p-3 flex items-center gap-3 bg-gradient-to-l from-white to-[#F8FAFC]">
                  <StatusDot s={j.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{j.kind}</span>
                      <Badge className="text-[10px] bg-[#2563EB] text-white">order {j.stage_order}</Badge>
                      <Badge className="text-[10px] bg-[#475569] text-white">محاولة {j.attempts}/{j.max_attempts ?? 3}</Badge>
                    </div>
                    {j.error && <div className="text-xs text-rose-600 mt-1 truncate">{j.error}</div>}
                    {j.status === "running" && <Progress value={j.progress_pct} className="h-1 mt-2" />}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">{j.finished_at ? new Date(j.finished_at).toLocaleTimeString("ar-EG") : "—"}</div>
                  {(j.status === "failed" || j.status === "retrying") && (
                    <Button size="sm" onClick={() => retryJob(j.id)} className="bg-[#F59E0B] text-white hover:bg-[#D97706] border-0">
                      <RefreshCw className="h-3.5 w-3.5 ml-1" /> إعادة
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="text">
            <Card className="border-2 border-[#BFDBFE]">
              <CardContent className="p-4">
                <div className="text-xs text-slate-500 mb-2">
                  اللغة: {currentVersion?.extracted_language ?? "—"} • الأحرف: {(currentVersion?.extracted_text?.length ?? 0).toLocaleString("ar-EG")}
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm max-h-[500px] overflow-auto bg-[#F8FAFC] p-3 rounded-lg border-2 border-[#E2E8F0]">
                  {currentVersion?.extracted_text ?? "لا يوجد نص مستخرج بعد."}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="units" className="space-y-2">
            {units.length === 0 && <EmptyText>لا توجد وحدات معرفية بعد.</EmptyText>}
            {units.map((u) => (
              <Card key={u.id} className="border-2 border-[#E2E8F0] hover:border-[#A78BFA] transition-colors">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="text-[10px] bg-[#7C3AED] text-white">{u.kind}</Badge>
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
              <div key={e.id} className={`text-xs p-2 rounded-xl border-2 flex items-start gap-2
                ${e.level === "error" ? "bg-[#FEF2F2] border-[#FCA5A5] text-[#B91C1C]"
                : e.level === "warn" ? "bg-[#FFFBEB] border-[#FCD34D] text-[#B45309]"
                : "bg-[#F8FAFC] border-[#CBD5E1] text-slate-700"}`}>
                <span className="tabular-nums text-[10px] opacity-70">{new Date(e.created_at).toLocaleTimeString("ar-EG")}</span>
                <span className="flex-1">{e.message}</span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>
      </div>
    </DSProvider>
  );
}

function Kpi({ icon: Icon, label, value, tone }: any) {
  const tones: any = {
    blue: { bg: "from-[#2563EB] to-[#1D4ED8]", shadow: "shadow-blue-500/25" },
    emerald: { bg: "from-[#059669] to-[#047857]", shadow: "shadow-emerald-500/25" },
    amber: { bg: "from-[#F59E0B] to-[#EA580C]", shadow: "shadow-amber-500/25" },
    violet: { bg: "from-[#7C3AED] to-[#DB2777]", shadow: "shadow-violet-500/25" },
  };
  const t = tones[tone] ?? tones.blue;
  return (
    <Card className={`overflow-hidden border-2 border-white bg-gradient-to-br ${t.bg} text-white shadow-lg ${t.shadow}`}>
      <CardContent className="relative p-3 flex items-center justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_42%)]" />
        <div className="relative">
          <p className="text-[11px] text-white/80 font-black">{label}</p>
          <p className="text-lg font-black text-white tabular-nums">{value}</p>
        </div>
        <div className="relative h-9 w-9 rounded-lg flex items-center justify-center bg-white/20 ring-1 ring-white/25">
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
