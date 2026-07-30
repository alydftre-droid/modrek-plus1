import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { gradeDisplayFromAny, stageKeyFromValue, teacherSelectionLabel } from "@/lib/teacherSubjectUtils";
import { groupTeacherAssignments, getNormalizedTeacherAssignmentGradeKey } from "@/lib/teacherAssignments";
import { isDeveloperTeacherMode, removeTeacherGradeAssignments } from "@/lib/devTeacherGrades";
import { DSDialog } from "@/design-system/components/Dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type TeacherAssignment = {
  id: string;
  stage: string;
  grade: string;
  section: string | null;
  category: string;
};

type GradeTarget = {
  category: string;
  categoryLabel: string;
  stage: string;
  stageLabel: string;
  grade: string;
  assignmentIds: string[];
};

const gradeCardThemes = [
  "teacher-grade-card teacher-grade-card--blue",
  "teacher-grade-card teacher-grade-card--green",
  "teacher-grade-card teacher-grade-card--violet",
];

export default function TeacherSubjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);

  // Developer-only grade removal
  const devMode = isDeveloperTeacherMode();
  const [sheetTarget, setSheetTarget] = useState<GradeTarget | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<GradeTarget | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user?.id]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [profileRes, assignRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase.from("teacher_assignments").select("id, stage, grade, section, category").eq("teacher_id", user.id),
    ]);
    if (profileRes.data) setTeacherName(profileRes.data.full_name);
    setAssignments((assignRes.data || []) as TeacherAssignment[]);
    setLoading(false);
  };

  const grouped = groupTeacherAssignments(assignments);

  const buildTarget = (group: (typeof grouped)[number], grade: string): GradeTarget => {
    const gradeKey = getNormalizedTeacherAssignmentGradeKey(grade);
    const ids = assignments
      .filter(
        (a) =>
          a.category === group.category &&
          getNormalizedTeacherAssignmentGradeKey(a.grade) === gradeKey,
      )
      .map((a) => a.id);
    return {
      category: group.category,
      categoryLabel: teacherSelectionLabel(group.category),
      stage: group.stage,
      stageLabel: group.stageLabel,
      grade,
      assignmentIds: ids,
    };
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = (target: GradeTarget) => {
    if (!devMode) return;
    longPressFired.current = false;
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      setSheetTarget(target);
    }, 550);
  };

  const openGrade = (group: (typeof grouped)[number], grade: string) => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    navigate(
      `/teacher/subject?category=${encodeURIComponent(group.category)}&grade=${encodeURIComponent(grade)}&stage=${stageKeyFromValue(group.stage) || group.stage}`,
    );
  };

  const handleDelete = async () => {
    if (!confirmTarget || !user || confirmText.trim() !== "حذف") return;
    setDeleting(true);
    try {
      await removeTeacherGradeAssignments({ teacherId: user.id, assignmentIds: confirmTarget.assignmentIds });
      const removed = new Set(confirmTarget.assignmentIds);
      setAssignments((prev) => prev.filter((a) => !removed.has(a.id)));
      setConfirmTarget(null);
      setConfirmText("");
      toast.success("✅ تم حذف الصف من حساب المعلم بنجاح.");
    } catch (e: any) {
      toast.error(e?.message || "فشل حذف الصف من حساب المعلم");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <TeacherSidebarLayout title="المواد الدراسية" teacherName={teacherName}>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
      </TeacherSidebarLayout>
    );
  }

  return (
    <TeacherSidebarLayout title="المواد الدراسية" teacherName={teacherName}>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        {grouped.length === 0 ? (
          <div className="text-center py-16">
            <div className="teacher-stat-icon teacher-stat-icon--blue h-16 w-16 mx-auto mb-4 rounded-2xl">
              <BookOpen className="h-8 w-8 text-white" />
            </div>
            <p className="text-lg font-bold mb-1">لا توجد مواد مسجلة</p>
            <p className="text-muted-foreground text-sm">تواصل مع الإدارة لتعيين المواد الدراسية</p>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={`${group.category}-${group.stage}`} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1.5 rounded-full teacher-stat-icon--blue" />
                <div>
                  <h2 className="text-lg font-bold">{teacherSelectionLabel(group.category)}</h2>
                  <p className="text-sm text-muted-foreground">المرحلة {group.stageLabel}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.grades.map((grade, i) => (
                  <motion.div key={grade} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                    <Card
                      className="cursor-pointer hover:shadow-lg transition-all overflow-hidden border-0 select-none"
                      onClick={() => openGrade(group, grade)}
                      onContextMenu={(e) => {
                        if (!devMode) return;
                        e.preventDefault();
                        longPressFired.current = true;
                        setSheetTarget(buildTarget(group, grade));
                      }}
                      onPointerDown={() => startLongPress(buildTarget(group, grade))}
                      onPointerUp={clearLongPress}
                      onPointerLeave={clearLongPress}
                      onPointerCancel={clearLongPress}
                    >
                      <CardContent className="p-0">
                        <div className={`${gradeCardThemes[i % gradeCardThemes.length]} p-5`}>
                          <BookOpen className="h-8 w-8 mb-3 text-white/80" />
                          <h3 className="text-lg font-bold text-white">الصف {gradeDisplayFromAny(grade)}</h3>
                          <p className="text-white/70 text-sm">{teacherSelectionLabel(group.category)}</p>
                        </div>
                        <div className="p-3 bg-card flex items-center justify-between">
                          <Badge className="bg-accent text-accent-foreground border-0 text-xs">{group.stageLabel}</Badge>
                          <span className="text-xs text-muted-foreground">إدارة المحتوى →</span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {devMode && (
        <Sheet open={!!sheetTarget} onOpenChange={(open) => !open && setSheetTarget(null)}>
          <SheetContent side="bottom" className="rounded-t-2xl" dir="rtl">
            <SheetHeader className="text-right">
              <SheetTitle>
                {sheetTarget ? `الصف ${gradeDisplayFromAny(sheetTarget.grade)} · ${sheetTarget.categoryLabel}` : ""}
              </SheetTitle>
            </SheetHeader>
            <div className="pt-4 pb-6">
              <button
                type="button"
                className="w-full flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive font-bold"
                onClick={() => {
                  setConfirmTarget(sheetTarget);
                  setConfirmText("");
                  setSheetTarget(null);
                }}
              >
                <Trash2 className="h-5 w-5" />
                🗑️ حذف الصف من حساب المعلم
              </button>
              <p className="text-xs text-muted-foreground mt-3 leading-6">
                هذا الخيار متاح للمطور فقط. لن يتم حذف الفيديوهات أو الملفات أو الاختبارات، سيتم فقط إزالة ربط الصف بحساب المعلم.
              </p>
            </div>
          </SheetContent>
        </Sheet>
      )}

      <DSDialog
        open={!!confirmTarget}
        onClose={() => { if (!deleting) { setConfirmTarget(null); setConfirmText(""); } }}
        size="sm"
        title="تأكيد حذف الصف"
        footer={
          <>
            <Button variant="outline" onClick={() => { setConfirmTarget(null); setConfirmText(""); }} disabled={deleting}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting || confirmText.trim() !== "حذف"}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف"}
            </Button>
          </>
        }
      >
        <div dir="rtl" className="space-y-3 text-right">
          <p className="text-[13px] leading-6 text-[#475569]">
            أنت على وشك حذف هذا الصف من حساب المعلم بشكل نهائي. لن يظهر هذا الصف مرة أخرى داخل حساب هذا المعلم إلا إذا تمت إضافته مرة أخرى.
          </p>
          {confirmTarget && (
            <p className="text-[13px] font-bold text-[#0F172A]">
              الصف {gradeDisplayFromAny(confirmTarget.grade)} · {confirmTarget.categoryLabel} · {confirmTarget.stageLabel}
            </p>
          )}
          <p className="text-[13px] text-[#475569]">
            للتأكيد اكتب الكلمة التالية: <span className="font-bold text-destructive">حذف</span>
          </p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="حذف"
            dir="rtl"
            autoFocus
          />
        </div>
      </DSDialog>
    </TeacherSidebarLayout>
  );
}
