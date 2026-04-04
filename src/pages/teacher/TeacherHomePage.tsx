import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherProfile, useTeacherAssignments, useUnreadNotifications } from "@/hooks/useTeacherData";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import TeacherAssistantBot from "@/components/teacher/TeacherAssistantBot";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, GraduationCap, Sparkles, Bell } from "lucide-react";
import { motion } from "framer-motion";
import { gradeDisplayFromAny, stageDisplayFromAny, stageKeyFromValue } from "@/lib/teacherSubjectUtils";
import { useMemo } from "react";

const gradeIcons = ["🎓", "📚", "🏆", "⭐", "🔬", "📖"];
const gradeCardThemes = [
  "from-blue-500 to-blue-600",
  "from-emerald-500 to-emerald-600",
  "from-violet-500 to-violet-600",
  "from-orange-500 to-orange-600",
  "from-rose-500 to-rose-600",
  "from-cyan-500 to-cyan-600",
];

export default function TeacherHomePage() {
  useAuth();
  const navigate = useNavigate();
  const { data: profile, isLoading: profileLoading } = useTeacherProfile();
  const { data: assignments = [], isLoading: assignLoading } = useTeacherAssignments();
  const { data: unreadNotifications = 0 } = useUnreadNotifications();

  const teacherName = profile?.full_name || "";
  const teacherAvatar = profile?.avatar_url || null;
  const loading = profileLoading || assignLoading;

  const grouped = useMemo(() => {
    return assignments.reduce((acc, curr) => {
      const key = `${curr.category}-${curr.stage}`;
      if (!acc[key]) acc[key] = { category: curr.category, stage: curr.stage, grades: [] };
      if (!acc[key].grades.includes(curr.grade)) acc[key].grades.push(curr.grade);
      return acc;
    }, {} as Record<string, { category: string; stage: string; grades: string[] }>);
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
    <TeacherSidebarLayout title="" teacherName={teacherName} hideHeaderTitle>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-teacher-sidebar'))}
            className="flex items-center gap-3"
          >
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden ring-2 ring-background shadow-md">
              {teacherAvatar ? (
                <img src={teacherAvatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-primary-foreground font-bold text-lg">{teacherName?.charAt(0) || "م"}</span>
              )}
            </div>
          </button>
          <button
            onClick={() => navigate("/teacher/notifications")}
            className="relative h-10 w-10 rounded-full bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors"
          >
            <Bell className="h-5 w-5 text-foreground" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-5 min-w-[20px] rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold px-1">
                {unreadNotifications}
              </span>
            )}
          </button>
        </div>

        {/* Welcome */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="teacher-hero-card !py-5 !px-5">
            <div className="relative z-10">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs text-primary-foreground/80">مرحباً بك</span>
              </div>
              <h1 className="text-xl font-bold mb-0.5 text-primary-foreground">
                مستر {teacherName} 👋
              </h1>
              <p className="text-primary-foreground/60 text-xs">
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
          Object.values(grouped).map((group) => (
            <div key={`${group.category}-${group.stage}`} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-1 rounded-full bg-primary" />
                <div>
                  <h2 className="text-base font-bold">{group.category}</h2>
                  <p className="text-xs text-muted-foreground">المرحلة {stageDisplayFromAny(group.stage)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {group.grades.map((grade, i) => (
                  <motion.div key={grade} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.08 }}>
                    <Card
                      className="cursor-pointer group hover:shadow-lg transition-all duration-300 overflow-hidden border-0"
                      onClick={() =>
                        navigate(`/teacher/grade?category=${encodeURIComponent(group.category)}&grade=${encodeURIComponent(grade)}&stage=${stageKeyFromValue(group.stage) || group.stage}`)
                      }
                    >
                      <CardContent className="p-0">
                        <div className={`bg-gradient-to-br ${gradeCardThemes[i % gradeCardThemes.length]} p-4`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-2xl">{gradeIcons[i % gradeIcons.length]}</span>
                            <Badge className="bg-white/20 text-white border-0 text-[10px]">
                              {stageDisplayFromAny(group.stage)}
                            </Badge>
                          </div>
                          <h3 className="text-base font-bold text-white">
                            الصف {gradeDisplayFromAny(grade)}
                          </h3>
                          <p className="text-white/70 text-[11px]">إدارة المحتوى والطلاب</p>
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

      {/* AI Assistant */}
      <TeacherAssistantBot />
    </TeacherSidebarLayout>
  );
}
