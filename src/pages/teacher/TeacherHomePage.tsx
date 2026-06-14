import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherProfile, useTeacherAssignments, useUnreadNotifications } from "@/hooks/useTeacherData";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, GraduationCap, Sparkles, ChevronLeft, BookOpen, Layers, Award } from "lucide-react";
import { motion } from "framer-motion";
import { gradeDisplayFromAny, stageKeyFromValue, teacherSelectionLabel } from "@/lib/teacherSubjectUtils";
import { useMemo } from "react";
import { groupTeacherAssignments } from "@/lib/teacherAssignments";
import { getSubjectVisual } from "@/lib/teacherSubjectVisuals";
import { SubjectArtwork } from "@/components/teacher/SubjectArtwork";
import supportAgentImg from "@/assets/support-agent.png";

export default function TeacherHomePage() {
  useAuth();
  const navigate = useNavigate();
  const { data: profile, isLoading: profileLoading } = useTeacherProfile();
  const { data: assignments = [], isLoading: assignLoading } = useTeacherAssignments();
  useUnreadNotifications();

  const teacherName = profile?.full_name || "";
  const teacherAvatar = profile?.avatar_url || null;
  const loading = profileLoading || assignLoading;

  const grouped = useMemo(() => groupTeacherAssignments(assignments), [assignments]);

  const totalGrades = useMemo(
    () => grouped.reduce((acc, g) => acc + g.grades.length, 0),
    [grouped],
  );
  const totalCategories = grouped.length;

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
      <div className="mx-auto max-w-4xl space-y-6 px-4 pb-28 pt-4 md:px-6 md:pt-6">
        {/* ============ Welcome Hero ============ */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="relative overflow-hidden rounded-[2rem] p-5 md:p-7 shadow-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600">
            {/* glass orbs */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -top-16 -left-10 h-48 w-48 rounded-full bg-white/20 blur-3xl" />
              <div className="absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-pink-300/30 blur-3xl" />
              <div className="absolute top-1/3 right-1/3 h-20 w-20 rounded-full bg-cyan-300/30 blur-2xl" />
              <svg className="absolute inset-0 h-full w-full opacity-20" aria-hidden>
                <defs>
                  <pattern id="hero-dots" width="22" height="22" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1" fill="white" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#hero-dots)" />
              </svg>
            </div>

            <div className="relative z-10 space-y-4">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur px-3 py-1 text-xs font-bold text-white border border-white/30">
                <Sparkles className="h-3.5 w-3.5" />
                <span>أهلاً بعودتك إلى لوحة المعلم</span>
              </div>

              <div className="flex items-center gap-3">
                {teacherAvatar ? (
                  <img
                    src={teacherAvatar}
                    alt={teacherName}
                    className="h-14 w-14 rounded-2xl object-cover ring-2 ring-white/60 shadow-lg"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-2xl bg-white/25 backdrop-blur flex items-center justify-center text-2xl ring-2 ring-white/60 shadow-lg">
                    👨‍🏫
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white/80">مرحباً بك،</p>
                  <h1 className="text-xl md:text-2xl font-extrabold text-white truncate drop-shadow">
                    أ. {teacherName}
                  </h1>
                </div>
              </div>

              <p className="text-sm font-medium text-white/90">
                اختر الصف الدراسي لإدارة المحتوى والطلاب
              </p>

              {/* Mini stats */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 px-3 py-2.5 flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-white/25 flex items-center justify-center">
                    <Layers className="h-4 w-4 text-white" />
                  </div>
                  <div className="leading-tight">
                    <div className="text-lg font-extrabold text-white">{totalCategories}</div>
                    <div className="text-[10px] text-white/80">مادة / تخصص</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 px-3 py-2.5 flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-white/25 flex items-center justify-center">
                    <Award className="h-4 w-4 text-white" />
                  </div>
                  <div className="leading-tight">
                    <div className="text-lg font-extrabold text-white">{totalGrades}</div>
                    <div className="text-[10px] text-white/80">صف دراسي</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ============ Grades ============ */}
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
            <section key={`${group.category}-${group.stage}`} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-1.5 rounded-full bg-gradient-to-b from-primary to-fuchsia-500" />
                <div>
                  <h2 className="text-base md:text-lg font-extrabold">{teacherSelectionLabel(group.category)}</h2>
                  <p className="text-xs text-muted-foreground">المرحلة {group.stageLabel}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {group.grades.map((grade, i) => {
                  const visual = getSubjectVisual(group.category, grade);
                  return (
                    <motion.button
                      key={grade}
                      type="button"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08, duration: 0.35 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() =>
                        navigate(
                          `/teacher/grade?category=${encodeURIComponent(group.category)}&grade=${encodeURIComponent(grade)}&stage=${stageKeyFromValue(group.stage) || group.stage}`,
                        )
                      }
                      className={`group relative overflow-hidden rounded-[1.5rem] text-right shadow-lg ring-1 ${visual.ring} transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 active:translate-y-0`}
                    >
                      {/* Themed art panel */}
                      <div className={`relative h-24 bg-gradient-to-br ${visual.gradient}`}>
                        <SubjectArtwork pattern={visual.pattern} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/15 to-transparent" />
                        <div className="absolute top-2 right-2">
                          <Badge className="rounded-full bg-white/90 text-slate-800 border-0 text-[10px] font-bold px-2 py-0.5 shadow-sm">
                            {group.stageLabel}
                          </Badge>
                        </div>
                        <div className="absolute bottom-2 left-2 text-3xl drop-shadow-lg select-none" aria-hidden>
                          {visual.emoji}
                        </div>
                      </div>

                      {/* Body */}
                      <div className="bg-card p-3 space-y-2">
                        <h3 className="text-sm md:text-base font-extrabold leading-tight text-foreground">
                          الصف {gradeDisplayFromAny(grade)}
                        </h3>
                        <div className="flex items-center justify-between gap-2">
                          <div className={`flex items-center gap-1 text-[11px] font-semibold ${visual.accent}`}>
                            <BookOpen className="h-3 w-3" />
                            <span>{teacherSelectionLabel(group.category)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] text-muted-foreground font-medium">نشط</span>
                          </div>
                        </div>
                        <div className={`flex items-center justify-between rounded-xl bg-gradient-to-l ${visual.gradient} px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm`}>
                          <ChevronLeft className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-1" />
                          <span>دخول</span>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {/* AI Assistant FAB */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        onClick={() => navigate("/teacher/assistant")}
        className="fixed bottom-[calc(1.5rem+60px+env(safe-area-inset-bottom))] left-6 z-50 w-14 h-14 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all overflow-hidden border-2 border-white"
        title="المساعد الذكي"
      >
        <img src={supportAgentImg} alt="المساعد الذكي" className="w-full h-full object-cover" />
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white animate-pulse" />
      </motion.button>
    </TeacherSidebarLayout>
  );
}
