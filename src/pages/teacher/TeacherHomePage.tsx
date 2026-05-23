import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherProfile, useTeacherAssignments, useUnreadNotifications } from "@/hooks/useTeacherData";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, GraduationCap, Sparkles, ChevronLeft, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { gradeDisplayFromAny, stageKeyFromValue, teacherSelectionLabel } from "@/lib/teacherSubjectUtils";
import { useMemo } from "react";
import { groupTeacherAssignments } from "@/lib/teacherAssignments";
import supportAgentImg from "@/assets/support-agent.png";

const gradeCardThemes = [
  { themeClass: "teacher-grade-theme-1", icon: "🎓" },
  { themeClass: "teacher-grade-theme-2", icon: "📚" },
  { themeClass: "teacher-grade-theme-3", icon: "🏆" },
  { themeClass: "teacher-grade-theme-4", icon: "⭐" },
  { themeClass: "teacher-grade-theme-5", icon: "🔬" },
  { themeClass: "teacher-grade-theme-6", icon: "📖" },
];

export default function TeacherHomePage() {
  useAuth();
  const navigate = useNavigate();
  const { data: profile, isLoading: profileLoading } = useTeacherProfile();
  const { data: assignments = [], isLoading: assignLoading } = useTeacherAssignments();
  useUnreadNotifications();

  const teacherName = profile?.full_name || "";
  const teacherAvatar = profile?.avatar_url || null;
  const loading = profileLoading || assignLoading;

  const grouped = useMemo(() => {
    return groupTeacherAssignments(assignments);
  }, [assignments]);

  if (loading) {
    return (
      <TeacherSidebarLayout title="" teacherName="">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </TeacherSidebarLayout>
    );
  }

  return (
    <TeacherSidebarLayout title="" teacherName={teacherName} hideHeaderTitle teacherAvatar={teacherAvatar}>
      <div className="mx-auto max-w-4xl space-y-5 px-4 pb-24 pt-4 md:px-6 md:pt-6">
        {/* Welcome Banner */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="teacher-home-hero relative overflow-hidden rounded-[1.75rem] p-6 md:p-7">
            <div className="absolute inset-0 opacity-100 pointer-events-none">
              <div className="teacher-home-hero-glow absolute -left-4 -top-4 h-28 w-28 rounded-full" />
              <div className="teacher-home-hero-glow absolute -bottom-6 right-6 h-24 w-24 rounded-full opacity-70" />
              <div className="teacher-home-hero-glow absolute top-1/2 right-1/3 h-12 w-12 rounded-full opacity-50" />
            </div>
            <div className="relative z-10 space-y-3">
              <div className="teacher-home-hero-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
                <Sparkles className="h-3.5 w-3.5" />
                <span>أهلاً وسهلاً بعودتك</span>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/85">مرحباً بك،</p>
                <h1 className="text-2xl font-extrabold leading-tight text-white md:text-3xl drop-shadow-sm">
                  أ. {teacherName} <span className="inline-block">👨‍🏫</span>
                </h1>
              </div>
              <p className="max-w-md text-sm font-medium text-white/90">
                اختر الصف الدراسي لإدارة المحتوى والطلاب
              </p>
            </div>
          </div>
        </motion.div>

        {/* Grades */}
        {assignments.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-8 text-center">
              <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h2 className="text-lg font-bold mb-2">لم يتم ربطك بأي مادة بعد</h2>
              <p className="text-muted-foreground text-sm mb-3">يرجى التواصل مع إدارة المنصة</p>
            </CardContent>
          </Card>
        ) : (
          grouped.map((group) => (
            <div key={`${group.category}-${group.stage}`} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-1.5 rounded-full bg-primary" />
                <div>
                  <h2 className="text-base font-bold">{teacherSelectionLabel(group.category)}</h2>
                  <p className="text-xs text-muted-foreground">المرحلة {group.stageLabel}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {group.grades.map((grade, i) => {
                  const theme = gradeCardThemes[i % gradeCardThemes.length];
                  return (
                    <motion.div key={grade} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.08 }}>
                      <Card
                        className={`teacher-grade-card ${theme.themeClass} group cursor-pointer overflow-hidden rounded-2xl transition-all duration-300 h-full`}
                        onClick={() =>
                          navigate(`/teacher/grade?category=${encodeURIComponent(group.category)}&grade=${encodeURIComponent(grade)}&stage=${stageKeyFromValue(group.stage) || group.stage}`)
                        }
                      >
                        <CardContent className="p-3 sm:p-3.5">
                          <div className="flex flex-col gap-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="teacher-grade-icon flex h-11 w-11 items-center justify-center rounded-xl text-xl shadow-sm">
                                <span>{theme.icon}</span>
                              </div>
                              <Badge className="teacher-grade-stage rounded-full border px-2 py-0.5 text-[10px] font-bold">
                                {group.stageLabel}
                              </Badge>
                            </div>

                            <div className="space-y-0.5">
                              <h3 className="teacher-grade-title text-sm font-extrabold leading-tight">
                                الصف {gradeDisplayFromAny(grade)}
                              </h3>
                              <div className="teacher-grade-subtitle flex items-center gap-1 text-[10px]">
                                <BookOpen className="h-3 w-3" />
                                <span>إدارة الصف</span>
                              </div>
                            </div>

                            <div className="teacher-grade-action flex items-center justify-between rounded-xl px-2.5 py-1.5 text-[11px] font-bold">
                              <span>دخول</span>
                              <ChevronLeft className="h-3.5 w-3.5 rotate-180 transition-transform duration-300 group-hover:-translate-x-1" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* AI Assistant FAB */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        onClick={() => navigate("/teacher/assistant")}
        className="fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all overflow-hidden border-2 border-white"
        title="المساعد الذكي"
      >
        <img src={supportAgentImg} alt="المساعد الذكي" className="w-full h-full object-cover" />
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white animate-pulse" />
      </motion.button>
    </TeacherSidebarLayout>
  );
}
