import { useParams, useNavigate } from "react-router-dom";
import { useExamAttempts, useExam } from "@/hooks/useExams";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { ArrowRight, Search, Download, Eye, Clock, AlertTriangle, Users, UserCheck, UserX } from "lucide-react";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { supabase } from "@/integrations/supabase/client";

export default function TeacherExamAttemptsPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { data: exam } = useExam(examId);
  const { data: attempts = [], isLoading } = useExamAttempts(examId);
  const [search, setSearch] = useState("");
  const [enrolledCount, setEnrolledCount] = useState<number | null>(null);

  useEffect(() => {
    if (!exam?.group_id) {
      setEnrolledCount(null);
      return;
    }
    supabase
      .from("student_group_purchases")
      .select("student_id", { count: "exact", head: true })
      .eq("group_id", exam.group_id)
      .then(({ count }) => setEnrolledCount(typeof count === "number" ? count : null));
  }, [exam?.group_id]);

  const filtered = attempts.filter((a: any) => {
    if (!search) return true;
    const name = a.profiles?.full_name?.toLowerCase() || "";
    return name.includes(search.toLowerCase()) || a.profiles?.student_code?.includes(search);
  });
  const completedAttempts = attempts.filter((a: any) => a.status !== "in_progress");
  const completedStudentIds = new Set(completedAttempts.map((a: any) => a.student_id));
  const solvedStudentsCount = completedStudentIds.size;
  const notSolvedCount = Math.max(0, (enrolledCount ?? solvedStudentsCount) - solvedStudentsCount);

  const exportCSV = () => {
    const rows = [["اسم الطالب", "كود", "محاولة", "الدرجة", "النسبة", "الحالة", "نجح", "وقت التسليم"]];
    filtered.forEach((a: any) => rows.push([
      a.profiles?.full_name || "", a.profiles?.student_code || "",
      String(a.attempt_number), `${a.total_score}/${a.max_score}`, `${a.percentage}%`,
      a.status, a.passed ? "نعم" : "لا", a.submitted_at ? new Date(a.submitted_at).toLocaleString("ar") : "",
    ]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `attempts-${exam?.title}.csv`; a.click();
  };

  return (
    <TeacherSidebarLayout title="محاولات الطلاب">
      <div className="container mx-auto p-4 max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/teacher/exams")}><ArrowRight className="h-4 w-4 ml-1" />الامتحانات</Button>
          <Button variant="outline" onClick={exportCSV} disabled={filtered.length === 0}><Download className="h-4 w-4 ml-1" />تصدير CSV</Button>
        </div>

        <Card>
          <CardContent className="p-4">
            <h1 className="text-lg font-extrabold">{exam?.title}</h1>
            <p className="text-sm text-muted-foreground">{attempts.length} محاولة</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <Users className="h-4 w-4 mx-auto mb-1 text-primary" />
              <div className="text-xl font-extrabold">{enrolledCount ?? "—"}</div>
              <div className="text-[11px] text-muted-foreground">طلاب المجموعة</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <UserCheck className="h-4 w-4 mx-auto mb-1 text-green-600" />
              <div className="text-xl font-extrabold">{solvedStudentsCount}</div>
              <div className="text-[11px] text-muted-foreground">حلّوا الامتحان</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <UserX className="h-4 w-4 mx-auto mb-1 text-orange-600" />
              <div className="text-xl font-extrabold">{notSolvedCount}</div>
              <div className="text-[11px] text-muted-foreground">لم يحلّوا بعد</div>
            </CardContent>
          </Card>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن طالب..." className="pr-10" />
        </div>

        {isLoading ? <Skeleton className="h-60" /> :
          filtered.length === 0 ? (
            <Card className="text-center p-12 border-dashed text-muted-foreground">لا توجد محاولات</Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((a: any) => (
                <Card key={a.id} className="hover:shadow-md transition-all cursor-pointer" onClick={() => navigate(`/teacher/exams/${examId}/attempts/${a.id}`)}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-mudrik text-white flex items-center justify-center font-bold">
                      {(a.profiles?.full_name || "?")[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{a.profiles?.full_name || "طالب"}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>#{a.profiles?.student_code}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{Math.floor(a.time_spent_seconds / 60)} د</span>
                        {a.tab_switch_count > 0 && (
                          <Badge variant="destructive" className="gap-1 text-[10px]"><AlertTriangle className="h-3 w-3" />{a.tab_switch_count}</Badge>
                        )}
                      </div>
                    </div>
                    <Badge variant={a.passed ? "default" : "destructive"} className="text-base px-3">{a.percentage}%</Badge>
                    <Badge variant="outline">{a.status === "in_progress" ? "جاري" : a.status === "submitted" ? "ينتظر التصحيح" : "مصحح"}</Badge>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/teacher/exams/${examId}/attempts/${a.id}`); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
      </div>
    </TeacherSidebarLayout>
  );
}
