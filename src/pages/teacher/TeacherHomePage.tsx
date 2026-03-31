import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, GraduationCap, Sparkles } from "lucide-react";
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

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user?.id]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const [profileRes, assignRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase.from("teacher_assignments").select("stage, grade, section, category").eq("teacher_id", user.id),
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
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
        {/* Welcome Section */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="teacher-hero-card">
          <div className="absolute top-0 left-0 w-full h-full opacity-10">
            <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-primary-foreground/20 blur-3xl" />
            <div className="absolute -bottom-10 -right-10 w-60 h-60 rounded-full bg-primary-foreground/10 blur-3xl" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm font-medium text-primary-foreground/80">مرحباً بك</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">
              أهلاً، {teacherName} 👋
            </h1>
            <p className="text-primary-foreground/70 text-sm md:text-base">
              اختر الصف الدراسي للبدء في إدارة المحتوى والطلاب
            </p>
          </div>
        </motion.div>

        {/* Grade Selection */}
        {assignments.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-12 text-center">
              <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-bold mb-2">لم يتم ربطك بأي مادة بعد</h2>
              <p className="text-muted-foreground">يرجى التواصل مع إدارة المنصة لتعيين موادك الدراسية</p>
            </CardContent>
          </Card>
        ) : (
          Object.values(grouped).map((group) => (
            <div key={`${group.category}-${group.stage}`} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 rounded-full bg-primary" />
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
                              <Badge className="bg-primary-foreground/20 text-primary-foreground border-0 text-xs">
                                {stageDisplayFromAny(group.stage)}
                            </Badge>
                          </div>
                          <h3 className="text-xl font-bold mb-1">
                              الصف {gradeDisplayFromAny(grade)}
                          </h3>
                            <p className="text-primary-foreground/80 text-sm">
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
