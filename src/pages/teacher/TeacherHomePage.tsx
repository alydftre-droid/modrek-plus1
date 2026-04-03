import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, GraduationCap, Sparkles, RefreshCw, Bell } from "lucide-react";
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
  "from-blue-500 to-blue-600",
  "from-emerald-500 to-emerald-600",
  "from-violet-500 to-violet-600",
  "from-orange-500 to-orange-600",
  "from-rose-500 to-rose-600",
  "from-cyan-500 to-cyan-600",
];

export default function TeacherHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [teacherAvatar, setTeacherAvatar] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user?.id]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const [profileRes, assignRes, notifRes] = await Promise.all([
      supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle(),
      supabase.from("teacher_assignments").select("stage, grade, section, category").eq("teacher_id", user.id),
      supabase.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
    ]);

    if (profileRes.data) {
      setTeacherName(profileRes.data.full_name);
      setTeacherAvatar(profileRes.data.avatar_url);
    }

    let asgn = (assignRes.data || []) as TeacherAssignment[];

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
    setUnreadNotifications(notifRes.count || 0);
    setLoading(false);
  };

  const grouped = assignments.reduce((acc, curr) => {
    const key = `${curr.category}-${curr.stage}`;
    if (!acc[key]) acc[key] = { category: curr.category, stage: curr.stage, grades: [] };
    if (!acc[key].grades.includes(curr.grade)) acc[key].grades.push(curr.grade);
    return acc;
  }, {} as Record<string, { category: string; stage: string; grades: string[] }>);

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
        {/* Top Bar: Avatar + Notifications */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              const event = new CustomEvent('open-teacher-sidebar');
              window.dispatchEvent(event);
            }}
            className="flex items-center gap-3"
          >
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden ring-2 ring-white shadow-md">
              {teacherAvatar ? (
                <img src={teacherAvatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-white font-bold text-lg">{teacherName?.charAt(0) || "م"}</span>
              )}
            </div>
          </button>
          <button
            onClick={() => navigate("/teacher/notifications")}
            className="relative h-10 w-10 rounded-full bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors"
          >
            <Bell className="h-5 w-5 text-foreground" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-5 min-w-[20px] rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold px-1">
                {unreadNotifications}
              </span>
            )}
          </button>
        </div>

        {/* Welcome Card */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="teacher-hero-card !py-5 !px-5">
            <div className="relative z-10">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs text-white/80">مرحباً بك</span>
              </div>
              <h1 className="text-xl font-bold mb-0.5">
                مستر {teacherName} 👋
              </h1>
              <p className="text-white/60 text-xs">
                اختر الصف الدراسي لإدارة المحتوى والطلاب
              </p>
            </div>
          </div>
        </motion.div>

        {/* Grade Selection */}
        {assignments.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-8 text-center">
              <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h2 className="text-lg font-bold mb-2">لم يتم ربطك بأي مادة بعد</h2>
              <p className="text-muted-foreground text-sm mb-3">يرجى التواصل مع إدارة المنصة</p>
              <button onClick={fetchData} className="teacher-btn-primary text-sm">
                <RefreshCw className="h-4 w-4" />
                إعادة المحاولة
              </button>
            </CardContent>
          </Card>
        ) : (
          Object.values(grouped).map((group) => (
            <div key={`${group.category}-${group.stage}`} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-1 rounded-full bg-blue-500" />
                <div>
                  <h2 className="text-base font-bold">{group.category}</h2>
                  <p className="text-xs text-muted-foreground">المرحلة {stageDisplayFromAny(group.stage)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {group.grades.map((grade, i) => (
                  <motion.div
                    key={grade}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.08 }}
                  >
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

        {/* AI Assistant FAB */}
        <button
          onClick={() => navigate("/teacher/ai-assistant")}
          className="fixed bottom-6 left-6 h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40 hover:scale-105"
          title="المساعد الذكي"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" fill="currentColor" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </TeacherSidebarLayout>
  );
}
