import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Video, FileText, TrendingUp, BookOpen } from "lucide-react";

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
      // Fetch students who chose this teacher
      const { data: choices, error: choicesError } = await supabase
        .from("student_teacher_choices")
        .select("student_id, category, stage, grade, created_at")
        .eq("teacher_id", user.id);

      if (choicesError) throw choicesError;

      // Get student profiles
      if (choices && choices.length > 0) {
        const studentIds = [...new Set(choices.map(c => c.student_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", studentIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        const enriched: StudentInfo[] = choices.map(c => {
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
      }

      // Fetch subscribed students count for this teacher
      const { count: subCount } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", user.id)
        .eq("is_active", true);

      setSubscribedCount(subCount || 0);

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
    if (grade === "first") return "الأول";
    if (grade === "second") return "الثاني";
    if (grade === "third") return "الثالث";
    return grade;
  };

  const formatStage = (stage: string) => {
    if (stage === "secondary") return "ثانوي";
    if (stage === "preparatory") return "إعدادي";
    return stage;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statCards = [
    { title: "إجمالي الطلاب", value: students.length, icon: Users, color: "text-blue-500", bg: "bg-blue-500" },
    { title: "الطلاب المشتركين", value: subscribedCount, icon: TrendingUp, color: "text-green-500", bg: "bg-green-500" },
    { title: "الفيديوهات", value: contentStats.videos, icon: Video, color: "text-red-500", bg: "bg-red-500" },
    { title: "الكتب", value: contentStats.pdfs, icon: FileText, color: "text-orange-500", bg: "bg-orange-500" },
    { title: "الامتحانات", value: contentStats.exams, icon: BookOpen, color: "text-purple-500", bg: "bg-purple-500" },
    { title: "الملخصات", value: contentStats.summaries, icon: FileText, color: "text-cyan-500", bg: "bg-cyan-500" },
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
