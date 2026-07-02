import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DSProvider } from "@/design-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Library, Plus, Search, BookOpen, FileText, ClipboardList,
  Database, FileCheck, Landmark, User, NotebookPen, File, Loader2,
} from "lucide-react";
import { toast } from "sonner";

type SourceType = {
  id: string; code: string; name_ar: string; icon: string | null; sort_order: number;
};
type Source = {
  id: string; title: string; description: string | null; author: string | null;
  publication_year: number | null; status: string;
  source_type_id: string; stage_id: string | null; grade_id: string | null;
  section_id: string | null; track_id: string | null; subject_id: string | null;
  sub_subject_id: string | null; term: number | null; created_at: string;
};
type Taxo = { id: string; name_ar: string; code: string };
type Grade = Taxo & { stage_id: string };
type SubSubject = Taxo & { subject_id: string };

const ICONS: Record<string, any> = {
  book: BookOpen, booklet: NotebookPen, notebook: NotebookPen, "file-text": FileText,
  clipboard: ClipboardList, "file-check": FileCheck, landmark: Landmark,
  database: Database, user: User, file: File,
};

export default function ModrekLibraryPage() {
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<SourceType[]>([]);
  const [stages, setStages] = useState<Taxo[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [sections, setSections] = useState<Taxo[]>([]);
  const [tracks, setTracks] = useState<Taxo[]>([]);
  const [subjects, setSubjects] = useState<Taxo[]>([]);
  const [subSubjects, setSubSubjects] = useState<SubSubject[]>([]);
  const [sources, setSources] = useState<Source[]>([]);

  const [q, setQ] = useState("");
  const [fType, setFType] = useState<string>("all");
  const [fStage, setFStage] = useState<string>("all");
  const [fSection, setFSection] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");

  const [showNew, setShowNew] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [t, s, g, sec, tr, sub, ss, src] = await Promise.all([
        supabase.from("knowledge_source_types").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("library_stages").select("id,name_ar,code").eq("is_active", true).order("sort_order"),
        supabase.from("library_grades").select("id,name_ar,code,stage_id").eq("is_active", true).order("sort_order"),
        supabase.from("library_sections").select("id,name_ar,code").eq("is_active", true).order("sort_order"),
        supabase.from("library_tracks").select("id,name_ar,code").eq("is_active", true).order("sort_order"),
        supabase.from("library_subjects").select("id,name_ar,code").eq("is_active", true).order("sort_order"),
        supabase.from("library_sub_subjects").select("id,name_ar,code,subject_id").eq("is_active", true).order("sort_order"),
        supabase.from("knowledge_sources").select("*").order("created_at", { ascending: false }),
      ]);
      if (t.error) throw t.error;
      setTypes(t.data as any); setStages(s.data as any); setGrades(g.data as any);
      setSections(sec.data as any); setTracks(tr.data as any);
      setSubjects(sub.data as any); setSubSubjects(ss.data as any);
      setSources((src.data ?? []) as any);
    } catch (e: any) {
      console.error(e); toast.error("خطأ في تحميل المكتبة");
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  const filtered = useMemo(() => {
    return sources.filter((s) => {
      if (fType !== "all" && s.source_type_id !== fType) return false;
      if (fStage !== "all" && s.stage_id !== fStage) return false;
      if (fSection !== "all" && s.section_id !== fSection) return false;
      if (fStatus !== "all" && s.status !== fStatus) return false;
      if (q && !s.title.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [sources, q, fType, fStage, fSection, fStatus]);

  const typeById = (id: string) => types.find((t) => t.id === id);
  const nameById = <T extends { id: string; name_ar: string }>(list: T[], id: string | null) =>
    (id && list.find((x) => x.id === id)?.name_ar) || "—";

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    sources.forEach((s) => { byType[s.source_type_id] = (byType[s.source_type_id] ?? 0) + 1; });
    return {
      total: sources.length,
      ready: sources.filter((s) => s.status === "ready").length,
      processing: sources.filter((s) => s.status === "processing").length,
      draft: sources.filter((s) => s.status === "draft").length,
      byType,
    };
  }, [sources]);

  return (
    <DSProvider>
      <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white flex items-center justify-center shadow-lg">
              <Library className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">مكتبة Modrek AI</h1>
              <p className="text-xs text-slate-500">قاعدة المعرفة المركزية — كتب، ملازم، مذكرات، امتحانات، نماذج وزارة، بنك أسئلة…</p>
            </div>
          </div>
          <Button onClick={() => setShowNew(true)} className="gap-2">
            <Plus className="h-4 w-4" /> إضافة مصدر جديد
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="إجمالي المصادر" value={stats.total} tone="blue" icon={Library} />
          <StatCard label="جاهز" value={stats.ready} tone="emerald" icon={FileCheck} />
          <StatCard label="قيد المعالجة" value={stats.processing} tone="amber" icon={Loader2} />
          <StatCard label="مسودة" value={stats.draft} tone="slate" icon={FileText} />
        </div>

        {/* Types row */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <TypeChip active={fType === "all"} onClick={() => setFType("all")} label="الكل" count={stats.total} />
          {types.map((t) => {
            const Icon = ICONS[t.icon ?? "file"] ?? File;
            return (
              <TypeChip
                key={t.id}
                active={fType === t.id}
                onClick={() => setFType(t.id)}
                label={t.name_ar}
                count={stats.byType[t.id] ?? 0}
                icon={<Icon className="h-3.5 w-3.5" />}
              />
            );
          })}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative md:col-span-2">
                <Search className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input placeholder="بحث بالعنوان..." value={q} onChange={(e) => setQ(e.target.value)} className="pr-9" />
              </div>
              <Select value={fStage} onValueChange={setFStage}>
                <SelectTrigger><SelectValue placeholder="المرحلة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المراحل</SelectItem>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fSection} onValueChange={setFSection}>
                <SelectTrigger><SelectValue placeholder="القسم" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">عام + أزهر</SelectItem>
                  {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger><SelectValue placeholder="الحالة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="processing">قيد المعالجة</SelectItem>
                  <SelectItem value="ready">جاهز</SelectItem>
                  <SelectItem value="archived">مؤرشف</SelectItem>
                  <SelectItem value="failed">فشل</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Grid */}
        {loading ? (
          <div className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" /></div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-slate-500">
              <Library className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p>لا توجد مصادر بعد. ابدأ بإضافة أول مصدر معرفي.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((s) => {
              const t = typeById(s.source_type_id);
              const Icon = t ? (ICONS[t.icon ?? "file"] ?? File) : File;
              return (
                <Link key={s.id} to={`/admin/modrek-library/${s.id}`}>
                  <Card className="hover:shadow-lg hover:border-blue-300 transition group cursor-pointer h-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                          <Icon className="h-5 w-5" />
                        </div>
                        <StatusBadge status={s.status} />
                      </div>
                      <CardTitle className="text-base mt-2 line-clamp-2">{s.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-slate-500 space-y-1">
                      <div>{t?.name_ar ?? "—"}</div>
                      <div className="flex flex-wrap gap-1">
                        {s.stage_id && <Badge variant="secondary" className="text-[10px]">{nameById(stages, s.stage_id)}</Badge>}
                        {s.section_id && <Badge variant="secondary" className="text-[10px]">{nameById(sections, s.section_id)}</Badge>}
                        {s.subject_id && <Badge variant="secondary" className="text-[10px]">{nameById(subjects, s.subject_id)}</Badge>}
                      </div>
                      {s.author && <div>المؤلف: {s.author}</div>}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <NewSourceDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); loadAll(); }}
        types={types} stages={stages} grades={grades}
        sections={sections} tracks={tracks} subjects={subjects} subSubjects={subSubjects}
      />
    </DSProvider>
  );
}

function StatCard({ label, value, tone, icon: Icon }: any) {
  const tones: any = {
    blue: "bg-blue-50 text-blue-600", emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600", slate: "bg-slate-100 text-slate-600",
  };
  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
        </div>
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function TypeChip({ active, onClick, label, count, icon }: any) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border transition
        ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"}`}
    >
      {icon}
      <span>{label}</span>
      <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/20" : "bg-slate-100"}`}>{count}</span>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: any = {
    draft: { label: "مسودة", cls: "bg-slate-100 text-slate-600" },
    processing: { label: "قيد المعالجة", cls: "bg-amber-100 text-amber-700" },
    ready: { label: "جاهز", cls: "bg-emerald-100 text-emerald-700" },
    archived: { label: "مؤرشف", cls: "bg-slate-100 text-slate-500" },
    failed: { label: "فشل", cls: "bg-rose-100 text-rose-700" },
  };
  const m = map[status] ?? map.draft;
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${m.cls}`}>{m.label}</span>;
}

function NewSourceDialog(props: {
  open: boolean; onClose: () => void; onCreated: () => void;
  types: SourceType[]; stages: Taxo[]; grades: Grade[]; sections: Taxo[];
  tracks: Taxo[]; subjects: Taxo[]; subSubjects: SubSubject[];
}) {
  const { open, onClose, onCreated, types, stages, grades, sections, tracks, subjects, subSubjects } = props;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", author: "", publisher: "", publication_year: "",
    source_type_id: "", stage_id: "", grade_id: "", section_id: "",
    track_id: "", subject_id: "", sub_subject_id: "", term: "",
  });
  useEffect(() => {
    if (open && types[0] && !form.source_type_id) {
      setForm((f) => ({ ...f, source_type_id: types[0].id }));
    }
  }, [open, types]);

  const filteredGrades = grades.filter((g) => !form.stage_id || g.stage_id === form.stage_id);
  const filteredSub = subSubjects.filter((s) => !form.subject_id || s.subject_id === form.subject_id);

  const save = async () => {
    if (!form.title.trim() || !form.source_type_id) {
      toast.error("العنوان ونوع المصدر مطلوبان"); return;
    }
    setSaving(true);
    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description || null,
        author: form.author || null,
        publisher: form.publisher || null,
        publication_year: form.publication_year ? parseInt(form.publication_year) : null,
        source_type_id: form.source_type_id,
        stage_id: form.stage_id || null,
        grade_id: form.grade_id || null,
        section_id: form.section_id || null,
        track_id: form.track_id || null,
        subject_id: form.subject_id || null,
        sub_subject_id: form.sub_subject_id || null,
        term: form.term ? parseInt(form.term) : null,
        status: "draft",
      };
      const { data: src, error } = await supabase.from("knowledge_sources").insert(payload).select().single();
      if (error) throw error;
      // Create initial version 1
      await supabase.from("knowledge_source_versions").insert({
        source_id: src!.id, version_number: 1, is_current: true, notes: "النسخة الأولى",
      });
      toast.success("تم إنشاء المصدر بنجاح");
      onCreated();
    } catch (e: any) {
      console.error(e); toast.error(e.message || "فشل الحفظ");
    } finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold">مصدر معرفي جديد</h2>
          <p className="text-xs text-slate-500 mt-1">أدخل بيانات المصدر — يمكنك رفع الملفات لاحقًا من صفحة التفاصيل</p>
        </div>
        <div className="p-5 space-y-4">
          <Field label="العنوان *">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="الوصف">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="نوع المصدر *">
              <Select value={form.source_type_id} onValueChange={(v) => setForm({ ...form, source_type_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="الترم">
              <Select value={form.term || "none"} onValueChange={(v) => setForm({ ...form, term: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون تحديد</SelectItem>
                  <SelectItem value="1">الترم الأول</SelectItem>
                  <SelectItem value="2">الترم الثاني</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المرحلة">
              <Select value={form.stage_id || "none"} onValueChange={(v) => setForm({ ...form, stage_id: v === "none" ? "" : v, grade_id: "" })}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="الصف">
              <Select value={form.grade_id || "none"} onValueChange={(v) => setForm({ ...form, grade_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {filteredGrades.map((g) => <SelectItem key={g.id} value={g.id}>{g.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="القسم">
              <Select value={form.section_id || "none"} onValueChange={(v) => setForm({ ...form, section_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="عام / أزهر" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="الشعبة">
              <Select value={form.track_id || "none"} onValueChange={(v) => setForm({ ...form, track_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {tracks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المادة">
              <Select value={form.subject_id || "none"} onValueChange={(v) => setForm({ ...form, subject_id: v === "none" ? "" : v, sub_subject_id: "" })}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="المادة الفرعية">
              <Select value={form.sub_subject_id || "none"} onValueChange={(v) => setForm({ ...form, sub_subject_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {filteredSub.map((s) => <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="المؤلف">
              <Input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
            </Field>
            <Field label="الناشر">
              <Input value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
            </Field>
            <Field label="سنة النشر">
              <Input type="number" value={form.publication_year} onChange={(e) => setForm({ ...form, publication_year: e.target.value })} />
            </Field>
          </div>
        </div>
        <div className="p-5 border-t sticky bottom-0 bg-white flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            حفظ
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}
