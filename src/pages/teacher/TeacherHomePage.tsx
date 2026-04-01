import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, GraduationCap, Sparkles, Users, BookOpen, Wallet, MessageSquare, TrendingUp, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { gradeDisplayFromAny, stageDisplayFromAny, stageKeyFromValue } from "@/lib/teacherSubjectUtils";

type TeacherAssignment = {
  stage: string;
  grade: string;
  section: string | null;
  category: string;
};

const gradeIcons = ["🎓", "📚", "🏆", "⭐", "🔬", "📖"];

const gradeCardThemes = [
  "teacher-grade-card teacher-grade-card--blue",
  "teacher-grade-card teacher-grade-card--green",
  "teacher-grade-card teacher-grade-card--violet",
  "teacher-grade-card teacher-grade-card--orange",
  "teacher-grade-card teacher-grade-card--rose",
  "teacher-grade-card teacher-grade-card--cyan",
];

export default function TeacherHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [quickStats, setQuickStats] = useState({ students: 0, subscribers: 0, messages: 0 });

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user?.id]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const [profileRes, assignRes, choicesRes, msgRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase.from("teacher_assignments").select("stage, grade, section, category").eq("teacher_id", user.id),
      supabase.from("student_teacher_choices").select("student_id", { count: "exact", head: true }).eq("teacher_id", user.id),
      supabase.from("teacher_messages").select("*", { count: "exact", head: true }).eq("teacher_id", user.id).eq("is_from_teacher", false).eq("is_read", false),
    ]);

    if (profileRes.data) setTeacherName(profileRes.data.full_name);

    let asgn = (assignRes.data || []) as TeacherAssignment[];

    // Sync from approved request if no assignments
    if (asgn.length === 0) {
      const { data: req } = await supabase
        .from("teacher_requests")
        .select("assigned_stages, assigned_grades, assigned_category")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (req?.assigned_category && req.assigned_grades?.length) {
        const stage = req.assigned_stages?.[0] ?? "secondary";
        const toInsert = req.assigned_grades.map((grade: string) => ({
          teacher_id: user.id,
          stage,
          grade,
          category: req.assigned_category!,
          section: null,
        }));
        await supabase.from("teacher_assignments").insert(toInsert);
        const { data: refreshed } = await supabase
          .from("teacher_assignments")
          .select("stage, grade, section, category")
          .eq("teacher_id", user.id);
        asgn = (refreshed || []) as TeacherAssignment[];
      }
    }

    setAssignments(asgn);
    setQuickStats({
      students: choicesRes.count || 0,
      subscribers: 0,
      messages: msgRes.count || 0,
    });
    setLoading(false);
  };

  // Group assignments by category+stage
  const grouped = assignments.reduce((acc, curr) => {
    const key = `${curr.category}-${curr.stage}`;
    if (!acc[key]) acc[key] = { category: curr.category, stage: curr.stage, grades: [] };
    if (!acc[key].grades.includes(curr.grade)) acc[key].grades.push(curr.grade);
    return acc;
  }, {} as Record<string, { category: string; stage: string; grades: string[] }>);

  if (loading) {
    return (
      <TeacherSidebarLayout title="الصفحة الرئيسية" teacherName="">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </TeacherSidebarLayout>
    );
  }

  return (
    <TeacherSidebarLayout title="الصفحة الرئيسية" teacherName={teacherName}>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        {/* Welcome Section */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="teacher-hero-card">
          <div className="absolute top-0 left-0 w-full h-full opacity-10">
            <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/20 blur-3xl" />
            <div className="absolute -bottom-10 -right-10 w-60 h-60 rounded-full bg-white/10 blur-3xl" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm font-medium text-white/80">مرحباً بك</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">
              أهلاً، {teacherName} 👋
            </h1>
            <p className="text-white/70 text-sm md:text-base">
              اختر الصف الدراسي للبدء في إدارة المحتوى والطلاب
            </p>
          </div>
        </motion.div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => navigate("/teacher/messages")}>
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">الطلاب</p>
                    <p className="text-xl md:text-2xl font-bold">{quickStats.students}</p>
                  </div>
                  <div className="teacher-stat-icon teacher-stat-icon--blue h-9 w-9">
                    <Users className="h-4 w-4 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => navigate("/teacher/wallet")}>
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">المحفظة</p>
                    <p className="text-xl md:text-2xl font-bold">
                      <Wallet className="h-5 w-5 inline text-muted-foreground" />
                    </p>
                  </div>
                  <div className="teacher-stat-icon teacher-stat-icon--green h-9 w-9">
                    <TrendingUp className="h-4 w-4 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => navigate("/teacher/messages")}>
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">رسائل جديدة</p>
                    <p className="text-xl md:text-2xl font-bold">{quickStats.messages}</p>
                  </div>
                  <div className="teacher-stat-icon teacher-stat-icon--purple h-9 w-9">
                    <MessageSquare className="h-4 w-4 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Grade Selection */}
        {assignments.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-12 text-center">
              <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-bold mb-2">لم يتم ربطك بأي مادة بعد</h2>
              <p className="text-muted-foreground mb-4">يرجى التواصل مع إدارة المنصة لتعيين موادك الدراسية</p>
              <Button onClick={fetchData} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                إعادة المحاولة
              </Button>
            </CardContent>
          </Card>
        ) : (
          Object.values(grouped).map((group) => (
            <div key={`${group.category}-${group.stage}`} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1.5 rounded-full teacher-stat-icon--blue" />
                <div>
                  <h2 className="text-lg font-bold">{group.category}</h2>
                  <p className="text-sm text-muted-foreground">المرحلة {stageDisplayFromAny(group.stage)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.grades.map((grade, i) => (
                  <motion.div
                    key={grade}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <Card
                      className="cursor-pointer group hover:shadow-xl transition-all duration-300 overflow-hidden border-0"
                      onClick={() =>
                          navigate(`/teacher/grade?category=${encodeURIComponent(group.category)}&grade=${encodeURIComponent(grade)}&stage=${stageKeyFromValue(group.stage) || group.stage}`)
                      }
                    >
                      <CardContent className="p-0">
                          <div className={`${gradeCardThemes[i % gradeCardThemes.length]} p-6`}>
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-3xl">{gradeIcons[i % gradeIcons.length]}</span>
                              <Badge className="bg-white/20 text-white border-0 text-xs">
                                {stageDisplayFromAny(group.stage)}
                            </Badge>
                          </div>
                          <h3 className="text-xl font-bold text-white mb-1">
                              الصف {gradeDisplayFromAny(grade)}
                          </h3>
                            <p className="text-white/80 text-sm">
                            الدخول لإدارة المحتوى والطلاب
                          </p>
                        </div>
                        <div className="p-4 bg-card group-hover:bg-accent/30 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">
                              إدارة الصف
                            </span>
                            <ChevronIcon />
                          </div>
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
    </TeacherSidebarLayout>
  );
}

function ChevronIcon() {
  return (
    <svg className="h-5 w-5 text-muted-foreground rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
