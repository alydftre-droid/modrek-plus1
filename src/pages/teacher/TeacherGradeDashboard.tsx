import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Users, Video, FileText, TrendingUp, ArrowRight,
  Upload, MessageSquare, ClipboardList
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
    totalStudents: 0, subscribedStudents: 0, videos: 0, books: 0, exams: 0, summaries: 0,
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

    const { data: subjects } = await supabase
      .from("subjects").select("id")
      .ilike("category", `%${category}%`).ilike("grade", `%${grade}%`).ilike("stage", `%${stage}%`);
    const subjectIds = subjects?.map(s => s.id) || [];

    const { data: choices } = await supabase
      .from("student_teacher_choices").select("student_id")
      .eq("teacher_id", user.id).ilike("grade", `%${grade}%`);
    const uniqueStudents = new Set(choices?.map(c => c.student_id) || []);

    let subscribedCount = 0;
    if (subjectIds.length > 0) {
      // Count students who purchased groups for this teacher
      const { data: groups } = await supabase
        .from("content_groups").select("id")
        .in("subject_id", subjectIds)
        .or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`);
      const groupIds = groups?.map(g => g.id) || [];
      if (groupIds.length > 0) {
        const { data: purchases } = await supabase
          .from("student_group_purchases").select("student_id")
          .in("group_id", groupIds);
        subscribedCount = new Set(purchases?.map(p => p.student_id) || []).size;
      }
    }

    let videoCount = 0, bookCount = 0, examCount = 0, summaryCount = 0;
    if (subjectIds.length > 0) {
      const { data: content } = await supabase
        .from("content").select("type").eq("uploaded_by", user.id).eq("is_active", true).in("subject_id", subjectIds);
      if (content) {
        videoCount = content.filter(c => c.type === "video").length;
        bookCount = content.filter(c => c.type === "pdf").length;
        examCount = content.filter(c => c.type === "exam").length;
        summaryCount = content.filter(c => c.type === "summary").length;
      }
    }

    setStats({ totalStudents: uniqueStudents.size, subscribedStudents: subscribedCount, videos: videoCount, books: bookCount, exams: examCount, summaries: summaryCount });
    setLoading(false);
  };

  const qp = `category=${encodeURIComponent(category)}&grade=${encodeURIComponent(grade)}&stage=${stage}`;
  const pageTitle = `الصف ${formatGrade(grade)} ${formatStage(stage)}`;

  const statCards = [
    { title: "إدارة الطلاب", value: stats.totalStudents, icon: Users, gradient: "from-blue-500 to-blue-600", suffix: "طالب", onClick: () => navigate(`/teacher/student-management?${qp}&tab=all`) },
    { title: "الطلاب المشتركين", value: stats.subscribedStudents, icon: TrendingUp, gradient: "from-emerald-500 to-emerald-600", suffix: "مشترك", onClick: () => navigate(`/teacher/student-management?${qp}&tab=subscribed`) },
    { title: "الفيديوهات", value: stats.videos, icon: Video, gradient: "from-red-500 to-red-600", suffix: "فيديو", onClick: () => navigate(`/teacher/subject?${qp}`) },
    { title: "الكتب", value: stats.books, icon: FileText, gradient: "from-orange-500 to-orange-600", suffix: "كتاب", onClick: () => navigate(`/teacher/subject?${qp}`) },
    { title: "الامتحانات", value: stats.exams, icon: ClipboardList, gradient: "from-violet-500 to-violet-600", suffix: "امتحان", onClick: () => navigate(`/teacher/subject?${qp}`) },
    { title: "الملخصات", value: stats.summaries, icon: FileText, gradient: "from-cyan-500 to-cyan-600", suffix: "ملخص", onClick: () => navigate(`/teacher/subject?${qp}`) },
  ];

  const quickActions = [
    { title: "رفع محتوى", desc: "المجموعات والدروس والفيديوهات", icon: Upload, gradient: "from-primary to-primary/80", onClick: () => navigate(`/teacher/subject?${qp}`) },
    { title: "التواصل مع الطلبة", desc: "الرسائل والدردشة", icon: MessageSquare, gradient: "from-indigo-500 to-indigo-600", onClick: () => navigate("/teacher/messages") },
  ];

  if (loading) {
    return (
      <TeacherSidebarLayout title={pageTitle} teacherName={teacherName}>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
      </TeacherSidebarLayout>
    );
  }

  return (
    <TeacherSidebarLayout title={pageTitle} teacherName={teacherName}>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => navigate("/teacher")} className="text-primary hover:underline font-medium">الرئيسية</button>
          <ArrowRight className="h-4 w-4 text-muted-foreground rotate-180" />
          <span className="text-muted-foreground">{pageTitle}</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">{pageTitle}</h1>
            <p className="text-muted-foreground text-sm">{category}</p>
          </div>
          <Badge className="bg-primary/10 text-primary border-0 text-sm px-3 py-1">{formatStage(stage)}</Badge>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="cursor-pointer hover:shadow-lg transition-all border-0 overflow-hidden" onClick={action.onClick}>
                <CardContent className="p-0">
                  <div className={`bg-gradient-to-br ${action.gradient} p-4 text-white`}>
                    <action.icon className="h-6 w-6 mb-2 opacity-90" />
                    <h3 className="font-bold text-sm">{action.title}</h3>
                    <p className="text-white/70 text-xs mt-0.5">{action.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {statCards.map((stat, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card
                className="overflow-hidden border-0 shadow-sm cursor-pointer hover:shadow-md transition-all"
                onClick={stat.onClick}
              >
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] md:text-xs text-muted-foreground mb-0.5">{stat.title}</p>
                      <p className="text-xl md:text-2xl font-bold">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground">{stat.suffix}</p>
                    </div>
                    <div className={`h-9 w-9 md:h-10 md:w-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center`}>
                      <stat.icon className="h-4 w-4 md:h-5 md:w-5 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </TeacherSidebarLayout>
  );
}
