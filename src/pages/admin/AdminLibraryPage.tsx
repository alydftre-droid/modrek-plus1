import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, Loader2, Plus, RefreshCw, Trash2, Eye, EyeOff, Play, Pause, ChevronRight, FileText, Image as ImageIcon, Sparkles, Layers, GraduationCap, HardDrive, Volume2 } from "lucide-react";
import { uploadBookToBunny } from "@/lib/studentLibrary";
import { resolveBunnyStorageUrl } from "@/lib/bunnyStorage";
import { useAuth } from "@/hooks/useAuth";
import LibraryUploadPage from "@/components/admin/LibraryUploadPage";
import LibraryProcessingMonitor from "@/components/admin/LibraryProcessingMonitor";

interface AdminBook {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  pdf_path: string | null;
  education_type: string;
  stage_id: string | null;
  grade_id: string | null;
  section_id: string | null;
  track_id: string | null;
  subject_id: string | null;
  subject_name_ar: string | null;
  page_count: number | null;
  file_size: number | null;
  status: string;
  processing_progress: number;
  processing_stage: string | null;
  processing_error: string | null;
  access_tier: string;
  created_at: string;
}

interface Stats {
  books: number; pages: number; subjects: number; stages: number;
  ready: number; processing: number; failed: number; audioClips: number; storageBytes: number;
}

// Taxonomy shapes and normalizers previously lived here for the legacy
// UploadWizard. The new wizard (LibraryUploadWizardV2) queries Supabase
// directly, so those helpers are gone by design.

const getEnvValue = (value: unknown) => String(value || "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
const FUNCTIONS_BASE_URL = getEnvValue(import.meta.env.VITE_SUPABASE_URL);
const FUNCTIONS_PUBLISHABLE_KEY = getEnvValue(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY);


const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "bg-slate-100 text-slate-700" },
  uploading: { label: "جاري الرفع", color: "bg-blue-100 text-blue-700" },
  processing: { label: "قيد المعالجة", color: "bg-amber-100 text-amber-700" },
  ready: { label: "جاهز", color: "bg-emerald-100 text-emerald-700" },
  failed: { label: "فشل", color: "bg-rose-100 text-rose-700" },
  paused: { label: "متوقف", color: "bg-orange-100 text-orange-700" },
  hidden: { label: "مخفي", color: "bg-zinc-200 text-zinc-700" },
};

type EducationValue = "عام" | "أزهر" | "both";

function sectionCodeToEducationValue(code?: string): EducationValue {
  if (code === "azhar") return "أزهر";
  if (code === "shared") return "both";
  return "عام";
}

function formatBytes(bytes: number) {
  if (!bytes) return "0";
  const units = ["ب", "ك.ب", "م.ب", "غ.ب"];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

async function callAdminRaw(action: string, method: "GET" | "POST", body?: unknown) {
  if (!FUNCTIONS_BASE_URL || !FUNCTIONS_PUBLISHABLE_KEY) {
    throw new Error("إعدادات الاتصال بالخلفية غير مكتملة.");
  }

  const [actionName, ...queryParts] = action.split("&");
  const url = new URL(`${FUNCTIONS_BASE_URL}/functions/v1/library-admin`);
  url.searchParams.set("action", actionName);
  if (queryParts.length > 0) {
    new URLSearchParams(queryParts.join("&")).forEach((value, key) => url.searchParams.set(key, value));
  }

  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("يجب تسجيل الدخول أولًا.");

  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "apikey": FUNCTIONS_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

export default function AdminLibraryPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [books, setBooks] = useState<AdminBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [detailBookId, setDetailBookId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([
        callAdminRaw("stats", "GET"),
        callAdminRaw("list", "GET"),
      ]);
      setStats(s?.totals || null);
      setBooks(l?.books || []);
    } catch (e: any) {
      toast.error(e?.message || "تعذر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("سيتم حذف الكتاب نهائيًا. تأكيد؟")) return;
    try {
      await callAdminRaw("delete", "POST", { id });
      toast.success("تم الحذف");
      await reload();
    } catch (e: any) { toast.error(e?.message || "فشل الحذف"); }
  };

  const handleAction = async (action: string, id: string) => {
    try {
      await callAdminRaw(action, "POST", { id });
      toast.success("تم التنفيذ");
      await reload();
    } catch (e: any) { toast.error(e?.message || "فشل التنفيذ"); }
  };

  if (showWizard) {
    return (
      <LibraryUploadPage
        userId={user?.id || ""}
        onBack={() => setShowWizard(false)}
        onDone={() => { setShowWizard(false); void reload(); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white" dir="rtl" style={{ fontFamily: "Cairo, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-7xl p-4 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => nav("/admin")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">مكتبة الطلاب</h1>
              <p className="text-xs text-slate-500 mt-0.5">إدارة الكتب التفاعلية للمنصة</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" onClick={() => setShowWizard(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              رفع كتاب
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          <Kpi icon={<BookOpen className="h-4 w-4" />} label="كتب" value={stats?.books ?? "…"} tone="blue" />
          <Kpi icon={<FileText className="h-4 w-4" />} label="صفحات" value={stats?.pages ?? "…"} tone="indigo" />
          <Kpi icon={<Layers className="h-4 w-4" />} label="مواد" value={stats?.subjects ?? "…"} tone="violet" />
          <Kpi icon={<GraduationCap className="h-4 w-4" />} label="صفوف" value={stats?.stages ?? "…"} tone="teal" />
          <Kpi icon={<Sparkles className="h-4 w-4" />} label="جاهز" value={stats?.ready ?? "…"} tone="emerald" />
          <Kpi icon={<Loader2 className="h-4 w-4" />} label="معالجة" value={stats?.processing ?? "…"} tone="amber" />
          <Kpi icon={<Volume2 className="h-4 w-4" />} label="ملفات صوت" value={stats?.audioClips ?? "…"} tone="pink" />
          <Kpi icon={<HardDrive className="h-4 w-4" />} label="تخزين" value={stats ? formatBytes(stats.storageBytes) : "…"} tone="slate" />
        </div>

        {/* Books grid */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">جميع الكتب ({books.length})</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : books.length === 0 ? (
            <div className="py-16 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-slate-300 mb-2" />
              <p className="text-sm text-slate-500">لم يتم رفع أي كتاب بعد</p>
              <Button size="sm" className="mt-3" onClick={() => setShowWizard(true)}>
                <Plus className="h-4 w-4 ml-1" /> رفع أول كتاب
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-3">
              {books.map((b) => {
                const st = STATUS_STYLES[b.status] || STATUS_STYLES.draft;
                return (
                  <div key={b.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <button
                      type="button"
                      onClick={() => setDetailBookId(b.id)}
                      className="block w-full aspect-[3/4] bg-gradient-to-br from-blue-50 to-indigo-50 relative overflow-hidden text-left"
                    >
                      {b.cover_url ? (
                        <img src={resolveBunnyStorageUrl(b.cover_url) || b.cover_url} alt={b.title} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="h-10 w-10 text-blue-300" />
                        </div>
                      )}
                      <span className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${st.color}`}>{st.label}</span>
                      {b.status === "processing" && (
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-200/50">
                          <div className="h-full bg-amber-500 transition-all" style={{ width: `${b.processing_progress || 0}%` }} />
                        </div>
                      )}
                    </button>
                    <div className="p-3">
                      <p className="text-sm font-bold text-slate-900 truncate">{b.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {b.subject_name_ar || "—"} · {b.education_type} · {b.page_count || 0} ص
                      </p>
                      <div className="flex flex-wrap items-center gap-1 mt-2">
                        <IconBtn title="تفاصيل ومعالجة" onClick={() => setDetailBookId(b.id)}><Eye className="h-3.5 w-3.5" /></IconBtn>
                        {b.status !== "ready" && b.status !== "processing" && (
                          <IconBtn title="نشر وبدء المعالجة" onClick={() => handleAction("publish", b.id)}><Play className="h-3.5 w-3.5 text-emerald-600" /></IconBtn>
                        )}
                        {(b.status === "failed" || b.status === "ready") && (
                          <IconBtn title="إعادة معالجة" onClick={() => handleAction("retry_book", b.id)}><RefreshCw className="h-3.5 w-3.5 text-blue-600" /></IconBtn>
                        )}
                        {b.status === "ready" && (
                          <IconBtn title="إيقاف" onClick={() => handleAction("pause", b.id)}><Pause className="h-3.5 w-3.5 text-orange-600" /></IconBtn>
                        )}
                        {b.status !== "hidden" ? (
                          <IconBtn title="إخفاء" onClick={() => handleAction("hide", b.id)}><EyeOff className="h-3.5 w-3.5" /></IconBtn>
                        ) : (
                          <IconBtn title="إظهار" onClick={() => handleAction("resume", b.id)}><Eye className="h-3.5 w-3.5" /></IconBtn>
                        )}
                        <IconBtn title="حذف" onClick={() => handleDelete(b.id)}><Trash2 className="h-3.5 w-3.5 text-rose-600" /></IconBtn>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {detailBookId && (
        <BookDetailsModal
          bookId={detailBookId}
          onClose={() => setDetailBookId(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

// ================== Book Details Modal (progress + jobs + retry) ==================

interface JobRow {
  id: string;
  kind: string;
  stage: string;
  state: string;
  progress: number;
  attempts: number;
  max_attempts: number;
  page_number: number | null;
  last_error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

interface ProcessingEventRow {
  id: string;
  event_key: string;
  level: string;
  message: string;
  progress: number | null;
  data: Record<string, unknown> | null;
  created_at: string;
}

interface ProgressPayload {
  book: AdminBook | null;
  jobs: JobRow[];
  events?: ProcessingEventRow[];
  pages_done: number;
  pages_total: number;
}

function BookDetailsModal({ bookId, onClose, onChanged }: { bookId: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<ProgressPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryPage, setRetryPage] = useState("");

  const load = async () => {
    try {
      const res = await callAdminRaw(`book_progress&id=${encodeURIComponent(bookId)}`, "GET");
      setData(res);
    } catch (e: any) {
      toast.error(e?.message || "تعذر تحميل التفاصيل");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [bookId]);

  // Live polling while the book is not in a terminal state.
  useEffect(() => {
    const isTerminal = data?.book?.status === "ready" || data?.book?.status === "failed" || data?.book?.status === "hidden";
    if (isTerminal) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [data?.book?.status]);

  const doRetryBook = async () => {
    if (!confirm("سيتم حذف جميع الصفحات المستخرجة وإعادة معالجة الكتاب من الصفر. تأكيد؟")) return;
    try { await callAdminRaw("retry_book", "POST", { id: bookId }); toast.success("بدأت إعادة المعالجة"); await load(); onChanged(); }
    catch (e: any) { toast.error(e?.message || "فشل"); }
  };

  const doRetryPage = async () => {
    const p = parseInt(retryPage, 10);
    if (!p || p < 1) { toast.error("رقم صفحة غير صحيح"); return; }
    try {
      await callAdminRaw("retry_page", "POST", { book_id: bookId, page_number: p });
      toast.success(`تم جدولة إعادة معالجة الصفحة ${p}`);
      setRetryPage("");
      await load();
    } catch (e: any) { toast.error(e?.message || "فشل"); }
  };

  const book = data?.book;
  const pending = data ? Math.max(0, (data.pages_total || 0) - (data.pages_done || 0)) : 0;
  const failedJobs = (data?.jobs || []).filter((j) => j.state === "failed");
  const runningJobs = (data?.jobs || []).filter((j) => j.state === "running" || j.state === "queued");

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white text-slate-900 dark:bg-white dark:text-slate-900" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">{book?.title || "تفاصيل الكتاب"}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : !book ? (
          <p className="text-sm text-rose-600">تعذر تحميل بيانات الكتاب.</p>
        ) : (
          <div className="space-y-4">
            {/* Status + progress */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge className={STATUS_STYLES[book.status]?.color}>{STATUS_STYLES[book.status]?.label || book.status}</Badge>
                  <span className="text-xs text-slate-500">{book.processing_stage || "—"}</span>
                </div>
                <span className="text-sm font-bold text-slate-900">{book.processing_progress || 0}%</span>
              </div>
              <div className="h-2 bg-white rounded-full overflow-hidden border border-slate-200">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-blue-500 transition-all duration-500" style={{ width: `${book.processing_progress || 0}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div className="rounded-lg bg-white p-2 border border-slate-200">
                  <div className="text-[10px] text-slate-500">إجمالي الصفحات</div>
                  <div className="text-lg font-extrabold text-slate-900">{data?.pages_total || 0}</div>
                </div>
                <div className="rounded-lg bg-white p-2 border border-slate-200">
                  <div className="text-[10px] text-slate-500">منتهية</div>
                  <div className="text-lg font-extrabold text-emerald-600">{data?.pages_done || 0}</div>
                </div>
                <div className="rounded-lg bg-white p-2 border border-slate-200">
                  <div className="text-[10px] text-slate-500">متبقية</div>
                  <div className="text-lg font-extrabold text-amber-600">{pending}</div>
                </div>
              </div>
              {book.processing_error && (
                <div className="mt-3 rounded-lg bg-rose-50 border border-rose-200 p-2 text-xs text-rose-700 leading-relaxed" dir="ltr">
                  <span className="font-bold">Error:</span> {book.processing_error}
                </div>
              )}
            </div>

            <LibraryProcessingMonitor bookId={bookId} />

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4 ml-1" />تحديث</Button>
              {book.status !== "processing" && book.status !== "uploading" && (
                <Button size="sm" onClick={doRetryBook} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                  <RefreshCw className="h-4 w-4" />إعادة معالجة الكتاب كاملاً
                </Button>
              )}
              <div className="flex items-center gap-1.5">
                <Input value={retryPage} onChange={(e) => setRetryPage(e.target.value)} placeholder="رقم الصفحة" className="h-8 w-24 text-sm" />
                <Button size="sm" variant="outline" onClick={doRetryPage}>إعادة صفحة</Button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">سجل التشخيص المباشر ({data?.events?.length || 0})</span>
                <span className="text-[10px] text-slate-500">آخر مرحلة وصل لها العامل</span>
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                {(data?.events || []).length === 0 ? (
                  <p className="p-4 text-xs text-slate-500 text-center">لا توجد أحداث تشخيص بعد.</p>
                ) : (
                  (data?.events || []).map((event) => {
                    const isError = event.level === "error";
                    const isWarning = event.level === "warning";
                    const isSuccess = event.level === "success";
                    return (
                      <div key={event.id} className="p-3 text-xs">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className={`font-bold ${isError ? "text-rose-700" : isWarning ? "text-amber-700" : isSuccess ? "text-emerald-700" : "text-slate-800"}`}>{event.message}</div>
                            <div className="mt-1 text-[10px] text-slate-500" dir="ltr">{event.event_key}</div>
                          </div>
                          <div className="shrink-0 text-[10px] text-slate-500" dir="ltr">{new Date(event.created_at).toLocaleTimeString()}</div>
                        </div>
                        {event.progress !== null && <div className="mt-1 text-[10px] text-slate-600">التقدم: {event.progress}%</div>}
                        {!!event.data?.error && <pre className="mt-2 whitespace-pre-wrap rounded-md bg-rose-50 p-2 text-[10px] text-rose-700" dir="ltr">{String(event.data.error)}</pre>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Jobs */}
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">مهام المعالجة ({data?.jobs.length || 0})</span>
                <span className="text-[10px] text-slate-500">قيد التشغيل: {runningJobs.length} · فشل: {failedJobs.length}</span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {(data?.jobs || []).length === 0 ? (
                  <p className="p-4 text-xs text-slate-500 text-center">لا توجد مهام سابقة.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-right px-2 py-1.5">النوع</th>
                        <th className="text-right px-2 py-1.5">صفحة</th>
                        <th className="text-right px-2 py-1.5">الحالة</th>
                        <th className="text-right px-2 py-1.5">تقدم</th>
                        <th className="text-right px-2 py-1.5">محاولات</th>
                        <th className="text-right px-2 py-1.5">خطأ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.jobs || []).map((j) => (
                        <tr key={j.id} className="border-t border-slate-100">
                          <td className="px-2 py-1.5">{j.kind === "extract_book" ? "كتاب كامل" : "صفحة"}</td>
                          <td className="px-2 py-1.5">{j.page_number ?? "—"}</td>
                          <td className="px-2 py-1.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              j.state === "completed" ? "bg-emerald-100 text-emerald-700"
                              : j.state === "running" ? "bg-blue-100 text-blue-700"
                              : j.state === "failed" ? "bg-rose-100 text-rose-700"
                              : "bg-slate-100 text-slate-600"
                            }`}>{j.state}</span>
                          </td>
                          <td className="px-2 py-1.5">{j.progress}%</td>
                          <td className="px-2 py-1.5">{j.attempts}/{j.max_attempts}</td>
                          <td className="px-2 py-1.5 max-w-[200px] truncate text-rose-600" dir="ltr" title={j.last_error || ""}>{j.last_error || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: string }) {
  const toneMap: Record<string, string> = {
    blue: "from-blue-500/10 to-blue-500/5 text-blue-700",
    indigo: "from-indigo-500/10 to-indigo-500/5 text-indigo-700",
    violet: "from-violet-500/10 to-violet-500/5 text-violet-700",
    teal: "from-teal-500/10 to-teal-500/5 text-teal-700",
    emerald: "from-emerald-500/10 to-emerald-500/5 text-emerald-700",
    amber: "from-amber-500/10 to-amber-500/5 text-amber-700",
    pink: "from-pink-500/10 to-pink-500/5 text-pink-700",
    slate: "from-slate-500/10 to-slate-500/5 text-slate-700",
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br ${toneMap[tone]} border border-white/40 p-3 backdrop-blur-sm`}>
      <div className="flex items-center gap-1.5 mb-1 opacity-80">{icon}<span className="text-[10px] font-semibold">{label}</span></div>
      <div className="text-lg font-extrabold">{value}</div>
    </div>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} className="h-7 w-7 rounded-md hover:bg-slate-100 flex items-center justify-center">
      {children}
    </button>
  );
}

// Legacy in-file UploadWizard removed. All book-upload filter logic now lives
// in src/components/admin/LibraryUploadWizardV2.tsx and queries Supabase
// directly per step (system → stage → grade → track → subject).

