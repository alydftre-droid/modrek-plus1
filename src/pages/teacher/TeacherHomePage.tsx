import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherProfile, useTeacherAssignments, useUnreadNotifications } from "@/hooks/useTeacherData";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, GraduationCap, Sparkles, ChevronLeft, BookOpen, Users } from "lucide-react";
import { motion } from "framer-motion";
import { gradeDisplayFromAny, stageDisplayFromAny, stageKeyFromValue } from "@/lib/teacherSubjectUtils";
import { useMemo } from "react";
import supportAgentImg from "@/assets/support-agent.png";

const gradeCardThemes = [
  { bg: "from-blue-500 to-indigo-600", icon: "🎓", accent: "bg-blue-400/20" },
  { bg: "from-emerald-500 to-teal-600", icon: "📚", accent: "bg-emerald-400/20" },
  { bg: "from-violet-500 to-purple-600", icon: "🏆", accent: "bg-violet-400/20" },
  { bg: "from-orange-500 to-amber-600", icon: "⭐", accent: "bg-orange-400/20" },
  { bg: "from-rose-500 to-pink-600", icon: "🔬", accent: "bg-rose-400/20" },
  { bg: "from-cyan-500 to-sky-600", icon: "📖", accent: "bg-cyan-400/20" },
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
    <TeacherSidebarLayout title="" teacherName={teacherName} hideHeaderTitle teacherAvatar={teacherAvatar}>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5 pb-24">
        {/* Welcome Banner */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="relative overflow-hidden rounded-2xl p-5" style={{ background: "linear-gradient(135deg, hsl(217 91% 48%) 0%, hsl(258 80% 50%) 100%)" }}>
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-2 left-4 w-20 h-20 rounded-full bg-white/20" />
              <div className="absolute bottom-1 right-8 w-14 h-14 rounded-full bg-white/15" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="h-4 w-4 text-white" />
                <span className="text-xs text-white/80">مرحباً بك</span>
              </div>
              <h1 className="text-xl font-bold mb-0.5 text-white">
                مستر {teacherName} 👋
              </h1>
              <p className="text-white/60 text-xs">
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
                <div className="h-6 w-1.5 rounded-full bg-primary" />
                <div>
                  <h2 className="text-base font-bold">{group.category}</h2>
                  <p className="text-xs text-muted-foreground">المرحلة {stageDisplayFromAny(group.stage)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {group.grades.map((grade, i) => {
                  const theme = gradeCardThemes[i % gradeCardThemes.length];
                  return (
                    <motion.div key={grade} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.08 }}>
                      <Card
                        className="cursor-pointer group hover:shadow-xl transition-all duration-300 overflow-hidden border-0 shadow-md"
                        onClick={() =>
                          navigate(`/teacher/grade?category=${encodeURIComponent(group.category)}&grade=${encodeURIComponent(grade)}&stage=${stageKeyFromValue(group.stage) || group.stage}`)
                        }
                      >
                        <CardContent className="p-0">
                          <div className={`bg-gradient-to-br ${theme.bg} p-4 relative overflow-hidden`}>
                            {/* Decorative circles */}
                            <div className={`absolute -top-3 -left-3 w-16 h-16 rounded-full ${theme.accent}`} />
                            <div className={`absolute -bottom-2 -right-2 w-10 h-10 rounded-full ${theme.accent}`} />
                            
                            <div className="relative z-10">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-3xl">{theme.icon}</span>
                                <Badge className="bg-white/20 text-white border-0 text-[10px] backdrop-blur-sm">
                                  {stageDisplayFromAny(group.stage)}
                                </Badge>
                              </div>
                              <h3 className="text-sm font-bold text-white mb-0.5">
                                الصف {gradeDisplayFromAny(grade)}
                              </h3>
                              <div className="flex items-center gap-1 text-white/70 text-[10px]">
                                <BookOpen className="h-3 w-3" />
                                <span>إدارة المحتوى والطلاب</span>
                              </div>
                            </div>
                            
                            {/* Arrow indicator */}
                            <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <ChevronLeft className="h-5 w-5 text-white/60 rotate-180" />
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
