import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { TeacherScopeDialog } from "@/components/admin/developer/teacher/TeacherScopeDialog";
import { ChevronLeft, Loader2, User, Upload, BookOpen, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { startTeacherImpersonation } from "@/lib/devImpersonation";

type TeacherRow = {
  teacher_id: string;
  full_name: string;
  avatar_url: string | null;
  education_type: string | null;
  category: string;
  section: string | null;
};

const stageLabel = (s: string) => s === "preparatory" ? "المرحلة الإعدادية" : s === "secondary" ? "المرحلة الثانوية" : s;
const gradeLabel = (g: string) => g === "first" ? "الصف الأول" : g === "second" ? "الصف الثاني" : g === "third" ? "الصف الثالث" : g;

// Map each UI category key to ALL possible teacher_assignments.category values
// stored in the database. Teachers are registered with a single specialty
// (e.g. "أحياء" or "رياضيات") rather than the umbrella category, so the
// developer picker must expand each UI category into every real specialty
// that belongs to it. Keep values in Arabic AND their English keys so we
// stay compatible with both legacy and current data shapes.
const CATEGORY_KEY_TO_DB: Record<string, string[]> = {
  arabic: [
    "arabic", "المواد العربية", "لغة عربية", "اللغة العربية",
    "نحو", "صرف", "بلاغة", "أدب", "الأدب", "نصوص", "قراءة",
  ],
  religious: [
    "religious", "sharia", "المواد الشرعية",
    "قرآن", "القرآن", "حديث", "الحديث", "فقه", "الفقه",
    "تفسير", "التفسير", "توحيد", "التوحيد", "سيرة", "السيرة",
    "تجويد", "التجويد",
  ],
  scientific: [
    "scientific", "المواد العلمية", "science", "العلوم",
    "أحياء", "الأحياء", "biology",
    "كيمياء", "الكيمياء", "chemistry",
    "فيزياء", "الفيزياء", "physics",
    "رياضيات", "الرياضيات", "math", "mathematics",
    "جيولوجيا", "الجيولوجيا", "geology",
  ],
  literary: [
    "literary", "المواد الأدبية",
    "تاريخ", "التاريخ", "history",
    "جغرافيا", "الجغرافيا", "geography",
    "فلسفة", "الفلسفة", "philosophy",
    "علم نفس", "علم النفس", "psychology",
    "منطق", "المنطق",
  ],
  science: [
    "science", "العلوم", "scientific", "المواد العلمية",
    "أحياء", "الأحياء", "كيمياء", "الكيمياء",
    "فيزياء", "الفيزياء", "علوم متكاملة", "العلوم المتكاملة",
    "رياضيات", "الرياضيات", "math", "mathematics",
  ],
  social: [
    "social", "studies", "الدراسات", "الدراسات الاجتماعية",
    "تاريخ", "التاريخ", "history",
    "جغرافيا", "الجغرافيا", "geography",
    "تربية وطنية", "التربية الوطنية",
  ],
  english: [
    "english", "اللغة الإنجليزية", "الإنجليزية", "لغة إنجليزية",
  ],
  french: [
    "french", "اللغة الفرنسية", "الفرنسية", "لغة فرنسية",
  ],
};

const GRADE_KEY_TO_ARABIC: Record<string, Record<string, string>> = {
  preparatory: {
    first: "الصف الأول الإعدادي",
    second: "الصف الثاني الإعدادي",
    third: "الصف الثالث الإعدادي",
  },
  secondary: {
    first: "الصف الأول الثانوي",
    second: "الصف الثاني الثانوي",
    third: "الصف الثالث الثانوي",
  },
};

export default function AdminTeacherPickerPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [scopeTeacher, setScopeTeacher] = useState<{ id: string; name: string } | null>(null);
  const [enteringId, setEnteringId] = useState<string | null>(null);

  const stage = params.get("stage") || "";
  const grade = params.get("grade") || "";
  const category = params.get("category") || "";
  const educationType = params.get("education_type") || "";
  const section = params.get("section") || "";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const arabicGrade = GRADE_KEY_TO_ARABIC[stage]?.[grade] || grade;
        const categoryCandidates = CATEGORY_KEY_TO_DB[category] || [category];

        const query = supabase
          .from("teacher_assignments")
          .select("teacher_id, stage, grade, section, category, education_type")
          .eq("stage", stage)
          .in("grade", [arabicGrade, grade]);

        const { data: assignRows, error: assignErr } = await query;
        if (assignErr) throw assignErr;

        const matching = (assignRows || []).filter((r: any) => {
          const catOk = categoryCandidates.some((c) => (r.category || "").trim().toLowerCase() === c.toLowerCase());
          if (!catOk) return false;
          if (educationType && r.education_type && r.education_type !== educationType) return false;
          if (section && r.section && r.section !== section) return false;
          return true;
        });

        const teacherIds = Array.from(new Set(matching.map((r: any) => r.teacher_id)));
        if (teacherIds.length === 0) {
          if (!cancelled) setTeachers([]);
          return;
        }

        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", teacherIds);

        const { data: teacherProfileRows } = await supabase
          .from("teacher_profiles")
          .select("user_id, avatar_url")
          .in("user_id", teacherIds);

        const nameMap = new Map<string, { full_name: string; avatar_url: string | null }>();
        (profileRows || []).forEach((p: any) => {
          const tp = (teacherProfileRows || []).find((t: any) => t.user_id === p.id);
          nameMap.set(p.id, { full_name: p.full_name, avatar_url: tp?.avatar_url || p.avatar_url || null });
        });

        const rows: TeacherRow[] = matching.map((r: any) => ({
          teacher_id: r.teacher_id,
          full_name: nameMap.get(r.teacher_id)?.full_name || "معلم",
          avatar_url: nameMap.get(r.teacher_id)?.avatar_url || null,
          education_type: r.education_type,
          category: r.category,
          section: r.section,
        }));

        // Deduplicate by teacher_id
        const dedup = new Map<string, TeacherRow>();
        rows.forEach((r) => { if (!dedup.has(r.teacher_id)) dedup.set(r.teacher_id, r); });

        if (!cancelled) setTeachers(Array.from(dedup.values()));
      } catch (e: any) {
        console.error("[AdminTeacherPicker] load failed", e);
        toast.error(e?.message || "فشل تحميل قائمة المعلمين");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [stage, grade, category, educationType, section]);

  const handleEnter = async (teacher: TeacherRow) => {
    setEnteringId(teacher.teacher_id);
    try {
      await startTeacherImpersonation(teacher.teacher_id);
      toast.success(`دخلت الآن كـ ${teacher.full_name}`);
      navigate("/teacher/subjects");
    } catch (e: any) {
      console.error("[AdminTeacherPicker] impersonation failed", e);
      toast.error(e?.message || "فشل الدخول إلى حساب المعلم");
      setEnteringId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4">
          <Link to="/admin" className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl gradient-mudrik shadow-lg">
              <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
            </div>
            <span className="text-base sm:text-xl font-bold text-gradient-mudrik">مدرك Plus</span>
          </Link>
          <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
            <span className="text-xs sm:text-sm font-medium text-primary">اختيار معلم</span>
          </div>
        </div>
      </header>

      <main className="px-4 pt-4 pb-20 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" className="gap-1.5 mb-3" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4 rotate-180" /> رجوع
        </Button>

        <Card className="mb-5 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-primary/10 shrink-0">
              <GraduationCap className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base text-foreground">اختر معلماً للدخول إلى حسابه</h3>
              <p className="text-xs text-muted-foreground">
                {stageLabel(stage)} · {gradeLabel(grade)}{educationType ? ` · ${educationType}` : ""}{section ? ` · ${section}` : ""}
              </p>
              <p className="text-xs text-primary mt-1 font-medium">ستستخدم واجهة المعلم نفسها لرفع المحتوى وإدارة المجموعات والامتحانات</p>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
        ) : teachers.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <User className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="font-medium text-foreground">لا يوجد معلمون مطابقون لهذه الفلاتر</p>
            <p className="text-sm text-muted-foreground">تحقق من تعيينات المعلمين أو غيّر النظام/الشعبة</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {teachers.map((t, i) => (
              <motion.div
                key={t.teacher_id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border hover:border-primary/40 hover:shadow-md transition-all text-right"
              >
                <button
                  type="button"
                  onClick={() => handleEnter(t)}
                  disabled={enteringId !== null}
                  className="flex items-center gap-3 flex-1 min-w-0 text-right disabled:opacity-50"
                >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {t.avatar_url ? (
                    <img src={t.avatar_url} alt={t.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="h-6 w-6 text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm text-foreground truncate">{t.full_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.category}{t.education_type ? ` · ${t.education_type}` : ""}{t.section ? ` · ${t.section}` : ""}
                  </div>
                </div>
                  {enteringId === t.teacher_id && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                </button>
                <button
                  type="button"
                  onClick={() => setScopeTeacher({ id: t.teacher_id, name: t.full_name })}
                  className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/20"
                >
                  الصفوف
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <TeacherScopeDialog
        teacherId={scopeTeacher?.id || ""}
        teacherName={scopeTeacher?.name}
        open={!!scopeTeacher}
        onOpenChange={(open) => { if (!open) setScopeTeacher(null); }}
      />
    </div>
  );
}
