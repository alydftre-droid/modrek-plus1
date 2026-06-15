import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherProfile, useTeacherAssignments, useUnreadNotifications } from "@/hooks/useTeacherData";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  GraduationCap,
  Sparkles,
  ChevronLeft,
  BookOpen,
  Layers,
  Award,
  Users,
} from "lucide-react";
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
        {/* ============ Welcome Hero — Emerald × Indigo × Slate ============ */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <div className="relative overflow-hidden rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(15,23,42,0.35)]">
            {/* Solid base gradient (NO transparency) */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, #0f172a 0%, #1e293b 25%, #312e81 55%, #047857 100%)",
              }}
              aria-hidden
            />
            {/* Decorative orbs */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-emerald-400/40 blur-3xl" />
              <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-indigo-500/40 blur-3xl" />
              <div className="absolute top-1/3 left-1/3 h-24 w-24 rounded-full bg-cyan-300/30 blur-2xl" />
              <svg className="absolute inset-0 h-full w-full opacity-[0.08]" aria-hidden>
                <defs>
                  <pattern id="hero-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                    <path d="M 28 0 L 0 0 0 28" fill="none" stroke="white" strokeWidth="0.6" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#hero-grid)" />
              </svg>
            </div>

            <div className="relative z-10 p-5 md:p-7 space-y-5">
              {/* Greeting chip */}
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md px-3 py-1.5 text-[11px] font-bold text-white border border-white/25 shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
                <span>أهلاً بعودتك إلى لوحة المعلم</span>
              </div>

              {/* Identity row */}
              <div className="flex items-center gap-3.5">
                <div className="relative shrink-0">
                  {teacherAvatar ? (
                    <img
                      src={teacherAvatar}
                      alt={teacherName}
                      className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white/70 shadow-lg"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-3xl ring-2 ring-white/70 shadow-lg">
                      👨‍🏫
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-emerald-400 border-2 border-slate-900 shadow" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-emerald-200">مرحباً بك،</p>
                  <h1 className="text-xl md:text-2xl font-extrabold text-white truncate drop-shadow-sm">
                    أ. {teacherName}
                  </h1>
                  <p className="text-[11px] text-white/75 mt-0.5">اختر الصف لإدارة المحتوى والطلاب</p>
                </div>
              </div>

              {/* Mini stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 px-3 py-3 flex flex-col items-center gap-1 shadow-inner">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/30 border border-emerald-300/40 flex items-center justify-center">
                    <Layers className="h-4 w-4 text-emerald-200" />
                  </div>
                  <div className="text-lg font-extrabold text-white leading-none">{totalCategories}</div>
                  <div className="text-[10px] text-white/80 font-medium">مادة</div>
                </div>
                <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 px-3 py-3 flex flex-col items-center gap-1 shadow-inner">
                  <div className="h-8 w-8 rounded-lg bg-indigo-500/30 border border-indigo-300/40 flex items-center justify-center">
                    <Award className="h-4 w-4 text-indigo-200" />
                  </div>
                  <div className="text-lg font-extrabold text-white leading-none">{totalGrades}</div>
                  <div className="text-[10px] text-white/80 font-medium">صف</div>
                </div>
                <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 px-3 py-3 flex flex-col items-center gap-1 shadow-inner">
                  <div className="h-8 w-8 rounded-lg bg-cyan-500/30 border border-cyan-300/40 flex items-center justify-center">
                    <Users className="h-4 w-4 text-cyan-200" />
                  </div>
                  <div className="text-lg font-extrabold text-white leading-none">{assignments.length}</div>
                  <div className="text-[10px] text-white/80 font-medium">مجموعة</div>
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
          grouped.map((group) => {
            const sectionVisual = getSubjectVisual(group.category, group.grades[0] || "");
            return (
              <section key={`${group.category}-${group.stage}`} className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className={`h-8 w-1.5 rounded-full bg-gradient-to-b ${sectionVisual.gradient}`} />
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
                        transition={{ delay: i * 0.06, duration: 0.3 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() =>
                          navigate(
                            `/teacher/grade?category=${encodeURIComponent(group.category)}&grade=${encodeURIComponent(grade)}&stage=${stageKeyFromValue(group.stage) || group.stage}`,
                          )
                        }
                        className={`group relative overflow-hidden rounded-[1.5rem] text-right shadow-lg ring-1 ${visual.ring} transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 bg-card`}
                      >
                        {/* Themed banner */}
                        <div className={`relative h-28 bg-gradient-to-br ${visual.gradient}`}>
                          <SubjectArtwork pattern={visual.pattern} />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                          <div className="absolute top-2 right-2">
                            <Badge className="rounded-full bg-white/95 text-slate-800 border-0 text-[10px] font-bold px-2.5 py-0.5 shadow-sm">
                              {group.stageLabel}
                            </Badge>
                          </div>
                          <div className="absolute bottom-2 left-2 text-3xl drop-shadow-lg select-none" aria-hidden>
                            {visual.emoji}
                          </div>
                        </div>

                        {/* Body */}
                        <div className="p-3 space-y-2">
                          <h3 className="text-sm md:text-base font-extrabold leading-tight text-foreground">
                            الصف {gradeDisplayFromAny(grade)}
                          </h3>
                          <div className="flex items-center justify-between gap-2">
                            <div className={`flex items-center gap-1 text-[11px] font-semibold ${visual.accent}`}>
                              <BookOpen className="h-3 w-3" />
                              <span className="truncate">{teacherSelectionLabel(group.category)}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
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
            );
          })
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
