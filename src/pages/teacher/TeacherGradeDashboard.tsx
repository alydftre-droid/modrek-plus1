import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Users, Video, FileText, TrendingUp, ArrowRight,
  Upload, MessageSquare, ClipboardList, BookOpen
} from "lucide-react";
import { motion } from "framer-motion";
import {
  gradeDisplayFromAny,
  gradeKeyFromArabicLabel,
  stageDisplayFromAny,
  stageKeyFromValue,
  subjectFilterFromTeacherSelection,
} from "@/lib/teacherSubjectUtils";
import { reportTeacherScopedStudentIds } from "@/lib/testStudentLeakGuard";

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

    const channel = supabase
      .channel(`teacher-dashboard-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_teacher_choices", filter: `teacher_id=eq.${user.id}` }, () => fetchStats())
      .on("postgres_changes", { event: "*", schema: "public", table: "student_group_purchases" }, () => fetchStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, category, grade, stage]);

  const fetchStats = async () => {
    if (!user) return;
    setLoading(true);

    const gradeKey = gradeKeyFromArabicLabel(grade);
    const stageKey = stageKeyFromValue(stage);
    const subjectFilter = subjectFilterFromTeacherSelection(category);

    const { data: profile } = await supabase
      .from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    if (profile) setTeacherName(profile.full_name);

    if (!gradeKey || !stageKey || !subjectFilter) {
      setStats({ totalStudents: 0, subscribedStudents: 0, videos: 0, books: 0, exams: 0, summaries: 0 });
      setLoading(false);
      return;
    }

    const { data: subjects } = await supabase
      .from("subjects").select("id")
      .eq("category", subjectFilter.categoryKey)
      .eq("grade", gradeKey)
      .eq("stage", stageKey);
    const subjectIds = subjects?.map(s => s.id) || [];

    const { data: choices } = await supabase
      .from("student_teacher_choices").select("student_id")
      .eq("teacher_id", user.id)
      .eq("grade", gradeKey)
      .eq("stage", stageKey)
      .eq("category", subjectFilter.categoryKey);
    reportTeacherScopedStudentIds("student_teacher_choices", (choices || []).map(c => c.student_id), {
      page: "TeacherGradeDashboard",
      grade: gradeKey,
      stage: stageKey,
      category: subjectFilter.categoryKey,
    });
    let uniqueStudents = new Set(choices?.map(c => c.student_id) || []);

    // Belt-and-suspenders: explicitly drop any test student accounts
    if (uniqueStudents.size > 0) {
      const { data: realProfiles } = await supabase
        .from("profiles").select("id")
        .in("id", Array.from(uniqueStudents))
        .eq("is_test_account", false);
      uniqueStudents = new Set((realProfiles || []).map(p => p.id));
    }

    let subscribedCount = 0;
    let purchaserIds: string[] = [];
    if (subjectIds.length > 0) {
      const { data: groups } = await supabase
        .from("content_groups").select("id")
        .in("subject_id", subjectIds)
        .or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`);
      const groupIds = groups?.map(g => g.id) || [];
      if (groupIds.length > 0) {
        const { data: purchases } = await supabase
          .from("student_group_purchases").select("student_id")
          .in("group_id", groupIds);
        reportTeacherScopedStudentIds("student_group_purchases", (purchases || []).map(p => p.student_id), {
          page: "TeacherGradeDashboard",
          grade: gradeKey,
          stage: stageKey,
          category: subjectFilter.categoryKey,
        });
        purchaserIds = [...new Set(purchases?.map(p => p.student_id) || [])];
        if (purchaserIds.length > 0) {
          const { data: realBuyers } = await supabase
            .from("profiles").select("id")
            .in("id", purchaserIds)
            .eq("is_test_account", false);
          const realBuyerIds = (realBuyers || []).map(p => p.id);
          subscribedCount = realBuyerIds.length;
          // Merge purchasers into total-students set so the card matches reality
          realBuyerIds.forEach(id => uniqueStudents.add(id));
        }
      }
    }


    let videoCount = 0, bookCount = 0, examCount = 0, summaryCount = 0;
    if (subjectIds.length > 0) {
      const [{ data: content }, { data: exams }] = await Promise.all([
        supabase.from("content").select("type").eq("uploaded_by", user.id).eq("is_active", true).in("subject_id", subjectIds),
        supabase.from("exams").select("id").eq("teacher_id", user.id).in("subject_id", subjectIds),
      ]);
      if (content) {
        videoCount = content.filter(c => c.type === "video").length;
        bookCount = content.filter(c => c.type === "pdf").length;
        summaryCount = content.filter(c => c.type === "summary").length;
      }
      examCount = exams?.length || 0;
    }

    setStats({ totalStudents: uniqueStudents.size, subscribedStudents: subscribedCount, videos: videoCount, books: bookCount, exams: examCount, summaries: summaryCount });
    setLoading(false);
  };

  const qp = `category=${encodeURIComponent(category)}&grade=${encodeURIComponent(grade)}&stage=${stage}`;
  const pageTitle = `الصف ${gradeDisplayFromAny(grade)} ${stageDisplayFromAny(stage)}`;

  const statCards = [
    { title: "إجمالي الطلاب", value: stats.totalStudents, icon: Users, iconClass: "teacher-stat-icon teacher-stat-icon--blue", suffix: "طالب", onClick: () => navigate(`/teacher/student-management?${qp}&tab=all`) },
    { title: "المشتركين", value: stats.subscribedStudents, icon: TrendingUp, iconClass: "teacher-stat-icon teacher-stat-icon--green", suffix: "مشترك", onClick: () => navigate(`/teacher/student-management?${qp}&tab=subscribed`) },
    { title: "الفيديوهات", value: stats.videos, icon: Video, iconClass: "teacher-stat-icon teacher-stat-icon--red", suffix: "فيديو", onClick: () => navigate(`/teacher/subject?${qp}`) },
    { title: "الكتب", value: stats.books, icon: FileText, iconClass: "teacher-stat-icon teacher-stat-icon--orange", suffix: "كتاب", onClick: () => navigate(`/teacher/subject?${qp}`) },
    { title: "الامتحانات", value: stats.exams, icon: ClipboardList, iconClass: "teacher-stat-icon teacher-stat-icon--purple", suffix: "امتحان", onClick: () => navigate(`/teacher/exams?${qp}`) },
    { title: "الملخصات", value: stats.summaries, icon: BookOpen, iconClass: "teacher-stat-icon teacher-stat-icon--cyan", suffix: "ملخص", onClick: () => navigate(`/teacher/subject?${qp}`) },
  ];

  const quickActions = [
    { title: "رفع محتوى", desc: "المجموعات والدروس والفيديوهات", icon: Upload, themeClass: "teacher-action-card teacher-action-card--primary", onClick: () => navigate(`/teacher/subject?${qp}`) },
    { title: "التواصل مع الطلبة", desc: "الرسائل والدردشة", icon: MessageSquare, themeClass: "teacher-action-card teacher-action-card--violet", onClick: () => navigate("/teacher/messages") },
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
          <Badge className="bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0 text-sm px-3 py-1">{stageDisplayFromAny(stage)}</Badge>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="cursor-pointer hover:shadow-lg transition-all border-0 overflow-hidden" onClick={action.onClick}>
                <CardContent className="p-0">
                  <div className={`${action.themeClass} p-4`}>
                    <action.icon className="h-6 w-6 mb-2 text-white/90" />
                    <h3 className="font-bold text-sm text-white">{action.title}</h3>
                    <p className="text-white/75 text-xs mt-0.5">{action.desc}</p>
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
                    <div className={`h-9 w-9 md:h-10 md:w-10 rounded-xl ${stat.iconClass} flex items-center justify-center`}>
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
