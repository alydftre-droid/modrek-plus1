import { useMemo } from "react";
import { AlertTriangle, Bug, CheckCircle2, CopyPlus, Loader2 } from "lucide-react";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTeacherAssignments, useTeacherProfile } from "@/hooks/useTeacherData";
import { getTeacherAssignmentDuplicateGroups, normalizeTeacherAssignment } from "@/lib/teacherAssignments";

export default function TeacherAssignmentsDiagnosticsPage() {
  const { data: profile, isLoading: profileLoading } = useTeacherProfile();
  const { data: assignments = [], isLoading: assignmentsLoading } = useTeacherAssignments();

  const loading = profileLoading || assignmentsLoading;
  const teacherName = profile?.full_name || "";
  const teacherAvatar = profile?.avatar_url || null;

  const normalizedAssignments = useMemo(
    () => assignments.map((assignment) => normalizeTeacherAssignment(assignment)),
    [assignments],
  );

  const mismatchedAssignments = useMemo(
    () => normalizedAssignments.filter((assignment) => assignment.stageMismatch),
    [normalizedAssignments],
  );

  const duplicateGroups = useMemo(
    () => getTeacherAssignmentDuplicateGroups(assignments),
    [assignments],
  );

  if (loading) {
    return (
      <TeacherSidebarLayout title="تشخيص التعيينات" teacherName={teacherName} teacherAvatar={teacherAvatar}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </TeacherSidebarLayout>
    );
  }

  return (
    <TeacherSidebarLayout title="تشخيص التعيينات" teacherName={teacherName} teacherAvatar={teacherAvatar}>
      <div className="mx-auto max-w-5xl space-y-5 px-4 pb-24 pt-4 md:px-6 md:pt-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">إجمالي التعيينات الخام</p>
                <p className="text-2xl font-extrabold">{normalizedAssignments.length}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Bug className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">عدم تطابق stage/grade</p>
                <p className="text-2xl font-extrabold">{mismatchedAssignments.length}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">تكرارات بعد التطبيع</p>
                <p className="text-2xl font-extrabold">{duplicateGroups.length}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
                <CopyPlus className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">فحص سريع</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-card p-3">
              {mismatchedAssignments.length === 0 ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 text-primary" />
              )}
              <p className="text-muted-foreground">
                هذه الصفحة تعرض القيم الخام المخزنة، مع المرحلة المستنتجة من اسم الصف، حتى يسهل اكتشاف أي صف محفوظ تحت مرحلة خاطئة.
              </p>
            </div>
          </CardContent>
        </Card>

        {duplicateGroups.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">الصفوف المتكررة بعد التطبيع</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {duplicateGroups.map((item) => (
                <div key={`${item.category}-${item.stage}-${item.grade}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card p-3 text-sm">
                  <Badge variant="secondary">{item.category}</Badge>
                  <Badge className="bg-accent text-accent-foreground border-0">{item.stageLabel}</Badge>
                  <span className="font-bold text-foreground">{item.grade}</span>
                  <span className="text-muted-foreground">مكرر {item.count} مرات</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">التعيينات الخام</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {normalizedAssignments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                لا توجد تعيينات لعرضها الآن.
              </div>
            ) : (
              normalizedAssignments.map((assignment) => (
                <div key={`${assignment.id || assignment.category}-${assignment.stage}-${assignment.grade}`} className="rounded-2xl border border-border/60 bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-extrabold text-foreground">{assignment.category}</h2>
                        {assignment.stageMismatch ? (
                          <Badge className="border-0 bg-primary text-primary-foreground">يحتاج مراجعة</Badge>
                        ) : (
                          <Badge variant="secondary">سليم</Badge>
                        )}
                      </div>
                      <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 sm:gap-x-6">
                        <p><span className="font-bold text-foreground">stage الخام:</span> {assignment.stage}</p>
                        <p><span className="font-bold text-foreground">المرحلة المستنتجة:</span> {assignment.normalizedStage}</p>
                        <p><span className="font-bold text-foreground">grade الخام:</span> {assignment.grade}</p>
                        <p><span className="font-bold text-foreground">العرض النهائي:</span> {assignment.normalizedGradeLabel}</p>
                        <p><span className="font-bold text-foreground">القسم:</span> {assignment.section || "—"}</p>
                        <p><span className="font-bold text-foreground">نوع التعليم:</span> {assignment.education_type || "—"}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className="bg-secondary text-secondary-foreground border-0">{assignment.normalizedStageLabel}</Badge>
                      {assignment.id && <span className="text-[11px] text-muted-foreground">#{assignment.id.slice(0, 8)}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </TeacherSidebarLayout>
  );
}