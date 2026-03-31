import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Video, FileText, TrendingUp, BookOpen } from "lucide-react";
import {
  gradeDisplayFromAny,
  gradeKeyFromArabicLabel,
  stageDisplayFromAny,
  stageKeyFromValue,
  subjectFilterFromTeacherSelection,
} from "@/lib/teacherSubjectUtils";

interface StudentInfo {
  student_id: string;
  student_name: string;
  student_email: string;
  category: string;
  stage: string;
  grade: string;
  joined_at: string;
}

const TeacherStudentAnalytics = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [contentStats, setContentStats] = useState({
    videos: 0,
    pdfs: 0,
    exams: 0,
    summaries: 0,
  });
  const [subscribedCount, setSubscribedCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user?.id]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: assignments } = await supabase
        .from("teacher_assignments")
        .select("stage, grade, category")
        .eq("teacher_id", user.id);

      const gradeKeys = Array.from(
        new Set((assignments || []).map((a) => gradeKeyFromArabicLabel(a.grade)).filter(Boolean) as string[])
      );
      const stageKeys = Array.from(
        new Set((assignments || []).map((a) => stageKeyFromValue(a.stage)).filter(Boolean) as string[])
      );
      const categoryKeys = Array.from(
        new Set(
          (assignments || [])
            .map((a) => subjectFilterFromTeacherSelection(a.category)?.categoryKey)
            .filter(Boolean) as string[]
        )
      );

      // Fetch students who chose this teacher
      let choicesQuery = supabase
        .from("student_teacher_choices")
        .select("student_id, category, stage, grade, created_at")
        .eq("teacher_id", user.id);

      if (gradeKeys.length > 0) choicesQuery = choicesQuery.in("grade", gradeKeys);
      if (stageKeys.length > 0) choicesQuery = choicesQuery.in("stage", stageKeys);
      if (categoryKeys.length > 0) choicesQuery = choicesQuery.in("category", categoryKeys);

      const { data: choices, error: choicesError } = await choicesQuery;

      if (choicesError) throw choicesError;

      const uniqueChoices = Array.from(
        new Map((choices || []).map((c) => [c.student_id, c])).values()
      );

      // Get student profiles
      if (uniqueChoices.length > 0) {
        const studentIds = uniqueChoices.map((c) => c.student_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", studentIds);

        const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

        const enriched: StudentInfo[] = uniqueChoices.map((c) => {
          const p = profileMap.get(c.student_id);
          return {
            student_id: c.student_id,
            student_name: p?.full_name || "طالب",
            student_email: p?.email || "",
            category: c.category,
            stage: c.stage,
            grade: c.grade,
            joined_at: c.created_at,
          };
        });

        setStudents(enriched);
      } else {
        setStudents([]);
      }

      // Fetch subscribed students count by paid group purchases (more accurate than subscriptions.teacher_id)
      let subjectQuery = supabase.from("subjects").select("id");
      if (gradeKeys.length > 0) subjectQuery = subjectQuery.in("grade", gradeKeys);
      if (stageKeys.length > 0) subjectQuery = subjectQuery.in("stage", stageKeys);
      if (categoryKeys.length > 0) subjectQuery = subjectQuery.in("category", categoryKeys);

      const { data: subjects } = await subjectQuery;
      const subjectIds = (subjects || []).map((s) => s.id);

      let subCount = 0;
      if (subjectIds.length > 0) {
        const { data: groups } = await supabase
          .from("content_groups")
          .select("id")
          .in("subject_id", subjectIds)
          .or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`);

        const groupIds = (groups || []).map((g) => g.id);
        if (groupIds.length > 0) {
          const { data: purchases } = await supabase
            .from("student_group_purchases")
            .select("student_id")
            .in("group_id", groupIds);
          subCount = new Set((purchases || []).map((p) => p.student_id)).size;
        }
      }

      setSubscribedCount(subCount);

      // Fetch content stats
      const { data: contentData } = await supabase
        .from("content")
        .select("type")
        .eq("uploaded_by", user.id)
        .eq("is_active", true);

      if (contentData) {
        setContentStats({
          videos: contentData.filter(c => c.type === "video").length,
          pdfs: contentData.filter(c => c.type === "pdf").length,
          exams: contentData.filter(c => c.type === "exam").length,
          summaries: contentData.filter(c => c.type === "summary").length,
        });
      }
    } catch (e) {
      console.error("Error fetching analytics:", e);
    } finally {
      setLoading(false);
    }
  };

  const formatGrade = (grade: string) => {
    return gradeDisplayFromAny(grade);
  };

  const formatStage = (stage: string) => {
    return stageDisplayFromAny(stage);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statCards = [
    { title: "إجمالي الطلاب", value: students.length, icon: Users, bg: "teacher-stat-icon teacher-stat-icon--blue" },
    { title: "الطلاب المشتركين", value: subscribedCount, icon: TrendingUp, bg: "teacher-stat-icon teacher-stat-icon--green" },
    { title: "الفيديوهات", value: contentStats.videos, icon: Video, bg: "teacher-stat-icon teacher-stat-icon--red" },
    { title: "الكتب", value: contentStats.pdfs, icon: FileText, bg: "teacher-stat-icon teacher-stat-icon--orange" },
    { title: "الامتحانات", value: contentStats.exams, icon: BookOpen, bg: "teacher-stat-icon teacher-stat-icon--purple" },
    { title: "الملخصات", value: contentStats.summaries, icon: FileText, bg: "teacher-stat-icon teacher-stat-icon--cyan" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {statCards.map((stat, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`p-2 rounded-xl ${stat.bg}`}>
                  <stat.icon className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Students List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            الطلاب المسجلين
            <Badge variant="secondary">{students.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">لا يوجد طلاب مسجلين بعد</p>
              <p className="text-sm text-muted-foreground mt-1">سيظهر هنا الطلاب عند اختيارهم لك كمعلم</p>
            </div>
          ) : (
            <div className="space-y-3">
              {students.map((student, i) => (
                <div
                  key={`${student.student_id}-${student.category}-${i}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{student.student_name}</p>
                      <p className="text-xs text-muted-foreground">{student.student_email}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <Badge variant="outline" className="text-xs">
                      {student.category} - {formatStage(student.stage)} - الصف {formatGrade(student.grade)}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(student.joined_at).toLocaleDateString("ar-EG")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeacherStudentAnalytics;
