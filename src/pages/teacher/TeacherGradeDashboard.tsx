import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Users, Video, FileText, BookOpen, TrendingUp, ArrowRight
} from "lucide-react";
import { motion } from "framer-motion";

const formatGrade = (g: string) => {
  if (g === "first") return "الأول";
  if (g === "second") return "الثاني";
  if (g === "third") return "الثالث";
  return g;
};

const formatStage = (s: string) => {
  if (s === "secondary") return "الثانوي";
  if (s === "preparatory") return "الإعدادي";
  return s;
};

export default function TeacherGradeDashboard() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const category = params.get("category") || "";
  const grade = params.get("grade") || "";
  const stage = params.get("stage") || "";

  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [stats, setStats] = useState({
    totalStudents: 0,
    subscribedStudents: 0,
    videos: 0,
    books: 0,
    exams: 0,
    summaries: 0,
  });

  useEffect(() => {
    if (!user) return;
    fetchStats();
  }, [user?.id, category, grade, stage]);

  const fetchStats = async () => {
    if (!user) return;
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    if (profile) setTeacherName(profile.full_name);

    // Get subjects for this category/grade/stage
    const { data: subjects } = await supabase
      .from("subjects")
      .select("id")
      .ilike("category", `%${category}%`)
      .ilike("grade", `%${grade}%`)
      .ilike("stage", `%${stage}%`);

    const subjectIds = subjects?.map(s => s.id) || [];

    // Students
    const { data: choices } = await supabase
      .from("student_teacher_choices")
      .select("student_id")
      .eq("teacher_id", user.id)
      .ilike("grade", `%${grade}%`);

    const uniqueStudents = new Set(choices?.map(c => c.student_id) || []);

    // Subscribed students
    let subscribedCount = 0;
    if (subjectIds.length > 0) {
      const { count } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", user.id)
        .eq("is_active", true)
        .in("subject_id", subjectIds);
      subscribedCount = count || 0;
    }

    // Content stats
    let videoCount = 0, bookCount = 0, examCount = 0, summaryCount = 0;
    if (subjectIds.length > 0) {
      const { data: content } = await supabase
        .from("content")
        .select("type")
        .eq("uploaded_by", user.id)
        .eq("is_active", true)
        .in("subject_id", subjectIds);

      if (content) {
        videoCount = content.filter(c => c.type === "video").length;
        bookCount = content.filter(c => c.type === "pdf").length;
        examCount = content.filter(c => c.type === "exam").length;
        summaryCount = content.filter(c => c.type === "summary").length;
      }
    }

    setStats({
      totalStudents: uniqueStudents.size,
      subscribedStudents: subscribedCount,
      videos: videoCount,
      books: bookCount,
      exams: examCount,
      summaries: summaryCount,
    });
    setLoading(false);
  };

  const statCards = [
    { title: "إجمالي الطلاب", value: stats.totalStudents, icon: Users, gradient: "from-blue-500 to-blue-600" },
    { title: "الطلاب المشتركين", value: stats.subscribedStudents, icon: TrendingUp, gradient: "from-emerald-500 to-emerald-600" },
    { title: "الفيديوهات", value: stats.videos, icon: Video, gradient: "from-red-500 to-red-600" },
    { title: "الكتب", value: stats.books, icon: FileText, gradient: "from-orange-500 to-orange-600" },
    { title: "الامتحانات", value: stats.exams, icon: BookOpen, gradient: "from-violet-500 to-violet-600" },
    { title: "الملخصات", value: stats.summaries, icon: FileText, gradient: "from-cyan-500 to-cyan-600" },
  ];

  const pageTitle = `الصف ${formatGrade(grade)} ${formatStage(stage)}`;

  if (loading) {
    return (
      <TeacherSidebarLayout title={pageTitle} teacherName={teacherName}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </TeacherSidebarLayout>
    );
  }

  return (
    <TeacherSidebarLayout title={pageTitle} teacherName={teacherName}>
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => navigate("/teacher")} className="text-primary hover:underline font-medium">الرئيسية</button>
          <ArrowRight className="h-4 w-4 text-muted-foreground rotate-180" />
          <span className="text-muted-foreground">{pageTitle}</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{pageTitle}</h1>
            <p className="text-muted-foreground text-sm">{category}</p>
          </div>
          <Badge className="bg-primary/10 text-primary border-0 text-sm px-3 py-1">
            {formatStage(stage)}
          </Badge>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {statCards.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="overflow-hidden border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{stat.title}</p>
                      <p className="text-2xl font-bold">{stat.value}</p>
                    </div>
                    <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center`}>
                      <stat.icon className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card
            className="cursor-pointer hover:shadow-lg transition-all border-primary/20 hover:border-primary/40"
            onClick={() => navigate(`/teacher/subject?category=${encodeURIComponent(category)}&grade=${encodeURIComponent(grade)}&stage=${stage}`)}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-bold">إدارة المحتوى</h3>
                <p className="text-sm text-muted-foreground">المجموعات والدروس والفيديوهات</p>
              </div>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg transition-all border-primary/20 hover:border-primary/40"
            onClick={() => navigate(`/teacher/students?category=${encodeURIComponent(category)}&grade=${encodeURIComponent(grade)}&stage=${stage}`)}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold">إدارة الطلاب</h3>
                <p className="text-sm text-muted-foreground">الطلاب المسجلين والرسائل</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </TeacherSidebarLayout>
  );
}
