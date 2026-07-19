import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock3, FileSearch, Loader2, RefreshCw, Radio, XCircle } from "lucide-react";

type BookRow = {
  id: string;
  title: string;
  status: string;
  processing_progress: number | null;
  processing_stage: string | null;
  processing_error: string | null;
  page_count: number | null;
};

type JobRow = {
  id: string;
  kind: string;
  state: string;
  progress: number | null;
  attempts: number | null;
  max_attempts: number | null;
  page_number: number | null;
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type ProcessingEventRow = {
  id: string;
  event_key: string;
  level: string;
  message: string;
  progress: number | null;
  data: Record<string, unknown> | null;
  created_at: string;
};

const pipelineStages = [
  { key: "v2_pipeline_enqueued", aliases: ["publish_started", "book_enqueued", "queue_job_created"], label: "النشر", detail: "إدراج الكتاب في خط v2" },
  { key: "dispatcher_claimed", aliases: ["worker_picked_job", "job_claimed"], label: "الموزّع", detail: "استلام المهمة من الطابور" },
  { key: "v2_pdf_downloaded", aliases: ["pdf_downloaded"], label: "PDF", detail: "تنزيل الملف" },
  { key: "v2_page_count", aliases: ["page_count_detected"], label: "الصفحات", detail: "عدّ الصفحات" },
  { key: "v2_pages_enqueued", label: "تجزئة", detail: "إنشاء مهام لكل صفحة" },
  { key: "ocr_finished", aliases: ["ocr_started", "pages_batch_saved"], label: "OCR", detail: "استخراج النص" },
  { key: "extraction_completed", label: "تقسيم", detail: "تقسيم المحتوى" },
  { key: "v2_build_index_delegated", aliases: ["interactive_lessons_generated", "build_index_completed"], label: "فهرس", detail: "الفهرس الذكي" },
  { key: "v2_chunk_embed_delegated", aliases: ["embeddings_started"], label: "بحث", detail: "Embeddings للبحث" },
  { key: "v2_explanations_delegated", aliases: ["page_explanations_started", "interactive_finalize_jobs_queued"], label: "شرح", detail: "الشرح التفاعلي" },
  { key: "tts_generation_started", label: "صوت", detail: "توليد الصوت" },
  { key: "v2_quiz_delegated", aliases: ["quiz_generation_completed", "quiz_generation_reused"], label: "اختبار", detail: "اختبار تمهيدي" },
  { key: "v2_finalize_done", aliases: ["book_completed"], label: "جاهز", detail: "إتاحة الكتاب" },
];

const statusLabel: Record<string, string> = {
  draft: "مسودة",
  uploading: "جاري الرفع",
  processing: "قيد المعالجة",
  ready: "جاهز",
  failed: "فشل",
  hidden: "مخفي",
  paused: "متوقف",
};

const ENV_URL = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const ENV_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "");

type ProgressResponse = {
  book: BookRow | null;
  jobs: JobRow[];
  events?: ProcessingEventRow[];
};

function levelClasses(level: string) {
  if (level === "error") return "border-rose-200 bg-rose-50 text-rose-800";
  if (level === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (level === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-blue-100 bg-blue-50 text-blue-800";
}

function stageState(events: ProcessingEventRow[], key: string, failed: boolean) {
  if (failed) return "failed";
  const hasStageEvent = (stage: typeof pipelineStages[number]) => events.some((event) => event.event_key === stage.key || stage.aliases?.includes(event.event_key));
  if (hasStageEvent({ key, label: "", detail: "" })) return "done";
  const firstMissingIndex = pipelineStages.findIndex((stage) => !hasStageEvent(stage));
  const currentKey = firstMissingIndex >= 0 ? pipelineStages[firstMissingIndex].key : "book_completed";
  return currentKey === key ? "active" : "pending";
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function asText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

export default function LibraryProcessingMonitor({ bookId, onClose }: { bookId: string; onClose?: () => void }) {
  const [book, setBook] = useState<BookRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [events, setEvents] = useState<ProcessingEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [workerTicking, setWorkerTicking] = useState(false);
  const [monitorError, setMonitorError] = useState<string | null>(null);

  const load = async () => {
    const url = new URL(`${ENV_URL}/functions/v1/library-admin`);
    url.searchParams.set("action", "book_progress");
    url.searchParams.set("id", bookId);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("يجب تسجيل الدخول أولًا.");
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: ENV_KEY,
        },
      });
    } catch (error) {
      throw new Error(`monitor_fetch_failed:${error instanceof Error ? error.message : String(error)}`);
    }
    const text = await res.text();
    const payload = text ? JSON.parse(text) as ProgressResponse & { error?: string } : null;
    if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
    setBook(payload?.book ?? null);
    setJobs(payload?.jobs ?? []);
    setEvents(((payload?.events || []) as ProcessingEventRow[]).map((event) => ({ ...event, data: (event.data || {}) as Record<string, unknown> })));
    setLastRefresh(new Date());
    setMonitorError(null);
    setLoading(false);
  };

  const tickWorker = async () => {
    if (workerTicking) return;
    setWorkerTicking(true);
    try {
      const url = new URL(`${ENV_URL}/functions/v1/library-admin`);
      url.searchParams.set("action", "worker_tick");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("يجب تسجيل الدخول أولًا.");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: ENV_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ source: "processing_monitor", book_id: bookId }),
      });
      if (!res.ok) throw new Error(`worker_tick_http_${res.status}`);
    } catch (error) {
      console.warn("[library-monitor] worker tick failed", error);
      setMonitorError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkerTicking(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const safeLoad = async () => {
      try { await load(); }
      catch (error) { console.error("[library-monitor] load failed", error); if (mounted) { setMonitorError(error instanceof Error ? error.message : String(error)); setLoading(false); } }
    };
    void safeLoad();
    const poll = window.setInterval(safeLoad, 3000);

    const channel = (supabase.channel(`library-processing-monitor-${bookId}`) as any)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "library_books", filter: `id=eq.${bookId}` }, (payload: any) => {
        setBook(payload.new as BookRow);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "library_processing_jobs", filter: `book_id=eq.${bookId}` }, () => void safeLoad())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "library_processing_events", filter: `book_id=eq.${bookId}` }, (payload: any) => {
        const next = { ...(payload.new as ProcessingEventRow), data: ((payload.new as ProcessingEventRow).data || {}) as Record<string, unknown> };
        setEvents((current) => [next, ...current.filter((event) => event.id !== next.id)].slice(0, 150));
      })
      .subscribe();

    return () => {
      mounted = false;
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [bookId]);

  useEffect(() => {
    const hasQueuedJob = jobs.some((job) => job.state === "queued" || job.state === "running");
    const isFinished = book?.status === "ready" || book?.status === "failed" || book?.status === "hidden" || book?.status === "paused";
    if (!hasQueuedJob || isFinished || workerTicking) return;
    const timer = window.setTimeout(() => void tickWorker(), 900);
    return () => window.clearTimeout(timer);
  }, [book?.status, bookId, jobs, workerTicking]);

  const sortedEvents = useMemo(() => [...events].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)), [events]);
  const completed = book?.status === "ready" || sortedEvents.some((event) => event.event_key === "book_completed");
  const failed = book?.status === "failed" || (!completed && sortedEvents.some((event) => event.level === "error"));
  const progress = Math.max(0, Math.min(100, book?.processing_progress ?? sortedEvents.find((event) => event.progress !== null)?.progress ?? 0));
  const latestError = sortedEvents.find((event) => event.level === "error") || null;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" dir="rtl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-600" />
            <h3 className="text-base font-extrabold text-slate-900">مراقبة معالجة الكتاب مباشرة</h3>
            <Badge className={failed ? "bg-rose-100 text-rose-700" : completed ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}>
              {statusLabel[book?.status || "processing"] || book?.status || "processing"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">{book?.title || "جاري تحميل بيانات الكتاب…"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void load()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> تحديث
          </Button>
          {jobs.some((job) => job.state === "queued" || job.state === "running") && (
            <Button type="button" size="sm" variant="outline" onClick={() => void tickWorker()} disabled={workerTicking} className="gap-1.5">
              {workerTicking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
              تشغيل العامل
            </Button>
          )}
          {completed && onClose && <Button type="button" size="sm" onClick={onClose}>العودة لقائمة الكتب</Button>}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> تحميل خط المعالجة…
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">{book?.processing_stage || "queued"}</span>
              <span className="font-mono text-slate-600" dir="ltr">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-slate-200 bg-white">
              <div className="h-full bg-gradient-to-r from-blue-500 via-emerald-500 to-teal-500 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <span>المهام: {jobs.length}</span>
              <span>الأحداث: {events.length}</span>
              <span>آخر تحديث: {lastRefresh ? formatTime(lastRefresh.toISOString()) : "—"}</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {pipelineStages.map((stage) => {
              const state = stageState(sortedEvents, stage.key, failed);
              const Icon = state === "done" ? CheckCircle2 : state === "failed" ? XCircle : state === "active" ? Loader2 : Clock3;
              return (
                <div key={stage.key} className={`rounded-xl border p-3 ${state === "done" ? "border-emerald-200 bg-emerald-50" : state === "failed" ? "border-rose-200 bg-rose-50" : state === "active" ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="mb-1 flex items-center gap-1.5">
                    <Icon className={`h-4 w-4 ${state === "active" ? "animate-spin text-blue-600" : state === "done" ? "text-emerald-600" : state === "failed" ? "text-rose-600" : "text-slate-400"}`} />
                    <span className="text-xs font-extrabold text-slate-900">{stage.label}</span>
                  </div>
                  <p className="text-[11px] leading-5 text-slate-600">{stage.detail}</p>
                </div>
              );
            })}
          </div>

          {(book?.processing_error || latestError) && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <div className="mb-2 flex items-center gap-2 font-extrabold"><AlertTriangle className="h-4 w-4" /> سبب التوقف الحقيقي</div>
              <pre className="whitespace-pre-wrap rounded-lg bg-white/70 p-2 text-left text-[11px]" dir="ltr">{book?.processing_error || asText(latestError?.data?.error_message || latestError?.data?.error || latestError?.message)}</pre>
              {latestError?.data && (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <DiagnosticCell label="File" value={latestError.data.file} />
                  <DiagnosticCell label="Function" value={latestError.data.function} />
                  <DiagnosticCell label="Line" value={latestError.data.line} />
                </div>
              )}
            </div>
          )}

          {monitorError && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="mb-2 flex items-center gap-2 font-extrabold"><AlertTriangle className="h-4 w-4" /> خطأ لوحة المراقبة</div>
              <pre className="whitespace-pre-wrap rounded-lg bg-white/70 p-2 text-left text-[11px]" dir="ltr">{monitorError}</pre>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-3 py-2 text-xs font-extrabold text-slate-700">Live Timeline</div>
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                {sortedEvents.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">لا توجد أحداث بعد. إذا بقيت فارغة فالمشكلة قبل تسجيل الأحداث أو في استدعاء العامل.</div>
                ) : sortedEvents.map((event) => (
                  <div key={event.id} className="p-3">
                    <div className="flex items-start gap-2">
                      <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900">{event.message}</span>
                          <span className="text-[10px] text-slate-500" dir="ltr">{formatTime(event.created_at)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${levelClasses(event.level)}`}>{event.level}</span>
                          <span className="font-mono text-[10px] text-slate-500" dir="ltr">{event.event_key}</span>
                          {event.progress !== null && <span className="text-[10px] text-slate-500">{event.progress}%</span>}
                        </div>
                        {event.data && Object.keys(event.data).length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-[10px] font-bold text-slate-500">تفاصيل تقنية</summary>
                            <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-950 p-2 text-left text-[10px] text-slate-50" dir="ltr">{JSON.stringify(event.data, null, 2)}</pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-3 py-2 text-xs font-extrabold text-slate-700">Queue / Jobs</div>
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                {jobs.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">لم يتم إنشاء Job بعد.</div>
                ) : jobs.map((job) => (
                  <div key={job.id} className="p-3 text-xs">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-extrabold text-slate-900">{job.kind}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${job.state === "failed" ? "bg-rose-100 text-rose-700" : job.state === "completed" || job.state === "done" ? "bg-emerald-100 text-emerald-700" : job.state === "running" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{job.state}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                      <span>تقدم: {job.progress ?? 0}%</span>
                      <span>محاولات: {job.attempts ?? 0}/{job.max_attempts ?? 3}</span>
                      <span>صفحة: {job.page_number ?? "—"}</span>
                      <span dir="ltr">{formatTime(job.created_at)}</span>
                    </div>
                    {job.last_error && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-rose-50 p-2 text-left text-[10px] text-rose-700" dir="ltr">{job.last_error}</pre>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function DiagnosticCell({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg bg-white/70 p-2">
      <div className="font-bold text-rose-700">{label}</div>
      <div className="mt-1 break-words font-mono text-[11px]" dir="ltr">{asText(value)}</div>
    </div>
  );
}