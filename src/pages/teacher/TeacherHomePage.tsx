import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherProfile, useTeacherAssignments, useUnreadNotifications } from "@/hooks/useTeacherData";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, GraduationCap, ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";
import { gradeDisplayFromAny, stageKeyFromValue } from "@/lib/teacherSubjectUtils";
import { useMemo } from "react";
import { groupTeacherAssignments } from "@/lib/teacherAssignments";
import { getSubjectVisual } from "@/lib/teacherSubjectVisuals";
import { SubjectArtwork } from "@/components/teacher/SubjectArtwork";
import { getGradeArtwork } from "@/lib/teacherGradeArtwork";
import supportAgentImg from "@/assets/support-agent.png";
import mudrikLogo from "@/assets/mudrik-logo.png";
import { useDevGradeDelete } from "@/components/teacher/useDevGradeDelete";
import { useQueryClient } from "@tanstack/react-query";

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

function formatArabicDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${ARABIC_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function gradeSortIndex(g: string): number {
  const s = (g || "").trim();
  if (s.includes("الأول") || s.includes("الاول") || s === "first") return 0;
  if (s.includes("الثاني") || s === "second") return 1;
  if (s.includes("الثالث") || s === "third") return 2;
  return 99;
}

export default function TeacherHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: profile, isLoading: profileLoading } = useTeacherProfile();
  const { data: assignments = [], isLoading: assignLoading } = useTeacherAssignments();
  useUnreadNotifications();

  const teacherName = profile?.full_name || "";
  const teacherAvatar = profile?.avatar_url || null;
  const memberSince = formatArabicDate(user?.created_at);
  const loading = profileLoading || assignLoading;

  const grouped = useMemo(() => groupTeacherAssignments(assignments), [assignments]);
  const queryClient = useQueryClient();
  const devGrade = useDevGradeDelete({
    assignments: assignments as any,
    teacherId: user?.id,
    onDeleted: () => queryClient.invalidateQueries({ queryKey: ["teacher-assignments", user?.id] }),
  });

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
        {/* Developer-only (impersonation mode): manage this teacher's subjects & grades */}
        {devScopeAllowed && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setScopeOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
            >
              <BookOpen className="h-3.5 w-3.5" /> إدارة المواد والصفوف
            </button>
          </div>
        )}
        {devScopeAllowed && user?.id && (
          <TeacherScopeDialog
            teacherId={user.id}
            teacherName={teacherName}
            open={scopeOpen}
            onOpenChange={setScopeOpen}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["teacher-assignments", user.id] })}
          />
        )}
        {/* ============ Teacher Identity Card — Modrek Plus brand ============ */}

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <div
            className="relative overflow-hidden rounded-[24px] border border-white/10"
            style={{
              background:
                "linear-gradient(135deg, #0A0F3C 0%, #0F8F8F 100%)",
              boxShadow: "0 18px 50px -20px rgba(10, 15, 60, 0.55)",
            }}
          >
            {/* Watermark logo */}
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-start pl-2 sm:pl-4">
              <img
                src={mudrikLogo}
                alt=""
                aria-hidden
                className="h-[180%] w-auto max-w-none select-none"
                style={{ opacity: 0.05 }}
                loading="lazy"
              />
            </div>

            {/* Subtle glass overlay */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 80% at 100% 0%, rgba(20,184,166,0.18) 0%, transparent 60%)",
              }}
              aria-hidden
            />

            <div className="relative z-10 flex items-center gap-4 p-5 md:p-6">
              {/* Right side (RTL: visually first) — text block */}
              <div className="flex-1 min-w-0 text-right">
                <h1 className="text-lg md:text-xl font-extrabold text-white truncate">
                  أ/ {teacherName}
                </h1>
                <p className="mt-1 text-[12px] md:text-sm font-medium text-white/85 leading-snug">
                  مرحباً بك في منصة <span className="font-bold text-[#14B8A6]">Modrek Plus</span>
                </p>
                {memberSince ? (
                  <div className="mt-3">
                    <p className="text-[10px] text-white/60 font-medium">عضو معنا منذ</p>
                    <p className="text-[12px] md:text-sm font-bold text-white/95 mt-0.5">
                      {memberSince}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Left side (RTL: visually last) — teacher photo */}
              <div className="shrink-0">
                <div
                  className="rounded-full p-[3px]"
                  style={{
                    background:
                      "linear-gradient(135deg, #14B8A6 0%, #ffffff 50%, #0F8F8F 100%)",
                  }}
                >
                  {teacherAvatar ? (
                    <img
                      src={teacherAvatar}
                      alt={teacherName}
                      className="h-20 w-20 md:h-24 md:w-24 rounded-full object-cover bg-white"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-20 w-20 md:h-24 md:w-24 rounded-full bg-white/95 flex items-center justify-center text-4xl">
                      👨‍🏫
                    </div>
                  )}
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
            const sortedGrades = [...group.grades].sort(
              (a, b) => gradeSortIndex(a) - gradeSortIndex(b),
            );
            return (
              <section key={`${group.category}-${group.stage}`} className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className={`h-8 w-1.5 rounded-full bg-gradient-to-b ${sectionVisual.gradient}`} />
                  <div>
                    <h2 className="text-base md:text-lg font-extrabold">{group.category}</h2>
                    <p className="text-xs text-muted-foreground">المرحلة {group.stageLabel}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {sortedGrades.map((grade, i) => {
                    const visual = getSubjectVisual(group.category, grade);
                    const artwork = getGradeArtwork(group.category, group.stage, grade);
                    return (
                      <motion.button
                        key={grade}
                        type="button"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.3 }}
                        whileTap={{ scale: 0.97 }}
                        {...devGrade.bindCard({ category: group.category, categoryLabel: group.category, stageLabel: group.stageLabel, grade })}
                        onClick={() => {
                          if (devGrade.shouldSwallowClick()) return;
                          navigate(
                            `/teacher/grade?category=${encodeURIComponent(group.category)}&grade=${encodeURIComponent(grade)}&stage=${stageKeyFromValue(group.stage) || group.stage}`,
                          );
                        }}
                        className={`group relative overflow-hidden rounded-[1.5rem] text-right shadow-lg ring-1 ${visual.ring} transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 bg-card`}
                      >
                        {devGrade.renderDevDeleteButton({ category: group.category, categoryLabel: group.category, stageLabel: group.stageLabel, grade })}

                        {/* Themed banner with custom artwork when available */}
                        <div className={`relative h-32 overflow-hidden bg-gradient-to-br ${visual.gradient}`}>
                          {artwork ? (
                            <>
                              <img
                                src={artwork}
                                alt=""
                                aria-hidden
                                loading="lazy"
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent" />
                            </>
                          ) : (
                            <>
                              <SubjectArtwork pattern={visual.pattern} />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                              <div className="absolute bottom-2 left-2 text-3xl drop-shadow-lg select-none" aria-hidden>
                                {visual.emoji}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Body */}
                        <div className="p-3 space-y-2">
                          <h3 className="text-sm md:text-base font-extrabold leading-tight text-foreground">
                            الصف {gradeDisplayFromAny(grade)}
                          </h3>
                          <div className="flex min-h-10 items-center justify-between rounded-xl bg-primary px-3 py-2 text-xs font-extrabold text-primary-foreground shadow-mudrik ring-1 ring-primary/15 transition-colors duration-300 group-hover:bg-primary/90">
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

      {devGrade.dialogs}

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
