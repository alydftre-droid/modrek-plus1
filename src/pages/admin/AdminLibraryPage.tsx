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
import { useAuth } from "@/hooks/useAuth";

interface AdminBook {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  pdf_path: string | null;
  education_type: string;
  stage_id: string | null;
  track_id: string | null;
  subject_id: string | null;
  subject_name_ar: string | null;
  page_count: number | null;
  file_size: number | null;
  status: string;
  processing_progress: number;
  access_tier: string;
  created_at: string;
}

interface Stats {
  books: number; pages: number; subjects: number; stages: number;
  ready: number; processing: number; failed: number; audioClips: number; storageBytes: number;
}

interface Taxo {
  stages: Array<{ id: string; name_ar: string; section_id: string | null }>;
  tracks: Array<{ id: string; name_ar: string }>;
  subjects: Array<{ id: string; name_ar: string }>;
}

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "bg-slate-100 text-slate-700" },
  uploading: { label: "جاري الرفع", color: "bg-blue-100 text-blue-700" },
  processing: { label: "قيد المعالجة", color: "bg-amber-100 text-amber-700" },
  ready: { label: "جاهز", color: "bg-emerald-100 text-emerald-700" },
  failed: { label: "فشل", color: "bg-rose-100 text-rose-700" },
  paused: { label: "متوقف", color: "bg-orange-100 text-orange-700" },
  hidden: { label: "مخفي", color: "bg-zinc-200 text-zinc-700" },
};

function formatBytes(bytes: number) {
  if (!bytes) return "0";
  const units = ["ب", "ك.ب", "م.ب", "غ.ب"];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

async function callAdmin(action: string, body?: unknown) {
  const { data, error } = await supabase.functions.invoke("library-admin", {
    body: body ?? {},
    method: "POST" as any,
    headers: { "Content-Type": "application/json" },
  });
  // supabase-js's invoke doesn't support query params directly, so we hit the URL manually for GETs.
  // But we can pass action via body for POSTs. We use raw fetch for actions instead.
  return { data, error };
}

async function callAdminRaw(action: string, method: "GET" | "POST", body?: unknown) {
  const url = `${(supabase as any).functionsUrl || `https://qohhrliaecdtaeyfhcvb.supabase.co/functions/v1`}/library-admin?action=${encodeURIComponent(action)}`;
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${token || ""}`,
      "apikey": (supabase as any).supabaseKey || "",
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
                    <div className="aspect-[3/4] bg-gradient-to-br from-blue-50 to-indigo-50 relative overflow-hidden">
                      {b.cover_url ? (
                        <img src={b.cover_url} alt={b.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <ImageIcon className="h-10 w-10 text-slate-300" />
                        </div>
                      )}
                      <span className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${st.color}`}>
                        {st.label}
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-bold text-slate-900 truncate">{b.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {b.subject_name_ar || "—"} · {b.education_type} · {b.page_count || 0} ص
                      </p>
                      <div className="flex flex-wrap items-center gap-1 mt-2">
                        <IconBtn title="معاينة" onClick={() => toast.info("المعاينة داخل المرحلة القادمة")}><Eye className="h-3.5 w-3.5" /></IconBtn>
                        {b.status !== "ready" && (
                          <IconBtn title="نشر" onClick={() => handleAction("publish", b.id)}><Play className="h-3.5 w-3.5 text-emerald-600" /></IconBtn>
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

      {showWizard && (
        <UploadWizard
          onClose={() => setShowWizard(false)}
          onDone={() => { setShowWizard(false); void reload(); }}
          userId={user?.id || ""}
        />
      )}
    </div>
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

// ================== Upload Wizard ==================

function UploadWizard({ onClose, onDone, userId }: { onClose: () => void; onDone: () => void; userId: string }) {
  const [step, setStep] = useState(1);
  const [taxo, setTaxo] = useState<Taxo | null>(null);
  const [education, setEducation] = useState<"عام" | "أزهر" | "both">("عام");
  const [stageId, setStageId] = useState<string>("");
  const [trackId, setTrackId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    callAdminRaw("taxonomy", "GET").then((r) => setTaxo(r)).catch(() => toast.error("تعذر تحميل التصنيفات"));
  }, []);

  const subjectName = useMemo(() => taxo?.subjects.find((s) => s.id === subjectId)?.name_ar || "", [taxo, subjectId]);

  // Track selection auto-skip if a stage has no tracks (for MVP we always show; user can pick 'بلا شعبة').
  const nextEnabled = () => {
    if (step === 1) return !!education;
    if (step === 2) return !!stageId;
    if (step === 3) return true; // track optional
    if (step === 4) return !!subjectId;
    if (step === 5) return !!pdfFile;
    if (step === 6) return true; // cover optional
    if (step === 7) return title.trim().length > 0;
    return true;
  };

  const publish = async () => {
    if (!pdfFile) return;
    setBusy(true);
    try {
      // 1) create draft
      const created = await callAdminRaw("create", "POST", {
        title, description, education_type: education,
        stage_id: stageId || null, track_id: trackId || null,
        subject_id: subjectId || null, subject_name_ar: subjectName,
      });
      const bookId = created.book.id;

      // 2) upload PDF
      const uri = await uploadBookToBunny({
        file: pdfFile,
        userId,
        onProgress: (l, t) => setProgress(Math.round((l / t) * 90)),
      });

      // 3) upload cover if provided (reuse bunny path via same upload helper is not appropriate — instead, keep cover_url as data-url data-uri for MVP)
      let coverDataUrl: string | null = null;
      if (coverFile) {
        coverDataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(coverFile);
        });
      }

      // 4) update book with file info
      setProgress(95);
      await callAdminRaw("update", "POST", {
        id: bookId,
        pdf_path: uri,
        cover_url: coverDataUrl,
        file_size: pdfFile.size,
      });

      // 5) publish (marks ready)
      setProgress(100);
      await callAdminRaw("publish", "POST", { id: bookId });

      toast.success("تم نشر الكتاب بنجاح");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "فشل النشر");
    } finally {
      setBusy(false);
    }
  };

  const stages = taxo?.stages || [];
  const tracks = taxo?.tracks || [];
  const subjects = taxo?.subjects || [];

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">رفع كتاب جديد — خطوة {step} من 9</DialogTitle>
        </DialogHeader>

        <div className="min-h-[220px] py-2">
          {step === 1 && (
            <div className="space-y-3">
              <Label>النظام التعليمي</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["عام", "أزهر", "both"] as const).map((v) => (
                  <button key={v} onClick={() => setEducation(v)}
                    className={`h-11 rounded-lg border font-semibold text-sm ${education === v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200"}`}>
                    {v === "both" ? "الاثنان" : v}
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <Label>الصف</Label>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto">
                {stages.map((s) => (
                  <button key={s.id} onClick={() => setStageId(s.id)}
                    className={`h-11 rounded-lg border text-sm font-semibold px-3 text-right ${stageId === s.id ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                    {s.name_ar}
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <Label>الشعبة (اختياري)</Label>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto">
                <button onClick={() => setTrackId("")}
                  className={`h-11 rounded-lg border text-sm font-semibold ${!trackId ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                  بلا شعبة
                </button>
                {tracks.map((t) => (
                  <button key={t.id} onClick={() => setTrackId(t.id)}
                    className={`h-11 rounded-lg border text-sm font-semibold px-3 text-right ${trackId === t.id ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                    {t.name_ar}
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-3">
              <Label>المادة</Label>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto">
                {subjects.map((s) => (
                  <button key={s.id} onClick={() => setSubjectId(s.id)}
                    className={`h-11 rounded-lg border text-sm font-semibold px-3 text-right ${subjectId === s.id ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                    {s.name_ar}
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 5 && (
            <div className="space-y-2">
              <Label>ملف PDF</Label>
              <Input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
              {pdfFile && <p className="text-xs text-slate-500">{pdfFile.name} — {formatBytes(pdfFile.size)}</p>}
            </div>
          )}
          {step === 6 && (
            <div className="space-y-2">
              <Label>صورة الغلاف (اختياري)</Label>
              <Input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
              {coverFile && <p className="text-xs text-slate-500">{coverFile.name}</p>}
            </div>
          )}
          {step === 7 && (
            <div className="space-y-2">
              <Label>اسم الكتاب</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: المرشد في الأحياء" />
            </div>
          )}
          {step === 8 && (
            <div className="space-y-2">
              <Label>الوصف (اختياري)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            </div>
          )}
          {step === 9 && (
            <div className="space-y-3">
              <h3 className="font-bold text-slate-900">مراجعة ونشر</h3>
              <div className="text-sm space-y-1 text-slate-700">
                <div>النظام: <b>{education === "both" ? "الاثنان" : education}</b></div>
                <div>الصف: <b>{stages.find((s) => s.id === stageId)?.name_ar || "—"}</b></div>
                <div>الشعبة: <b>{tracks.find((t) => t.id === trackId)?.name_ar || "بلا"}</b></div>
                <div>المادة: <b>{subjectName || "—"}</b></div>
                <div>العنوان: <b>{title}</b></div>
                <div>الملف: <b>{pdfFile ? `${pdfFile.name} (${formatBytes(pdfFile.size)})` : "—"}</b></div>
              </div>
              {busy && (
                <div className="mt-2">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{progress < 90 ? "جاري رفع الملف…" : progress < 100 ? "جاري الإنهاء…" : "تم"}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <Button variant="ghost" size="sm" onClick={() => step > 1 ? setStep(step - 1) : onClose()} disabled={busy}>
            {step > 1 ? "السابق" : "إلغاء"}
          </Button>
          {step < 9 ? (
            <Button size="sm" onClick={() => setStep(step + 1)} disabled={!nextEnabled()}>
              التالي <ChevronRight className="h-4 w-4 mr-1 rotate-180" />
            </Button>
          ) : (
            <Button size="sm" onClick={publish} disabled={busy || !pdfFile}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Sparkles className="h-4 w-4 ml-1" />}
              نشر الكتاب
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
