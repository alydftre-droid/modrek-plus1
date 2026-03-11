import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import StudentLayout from "@/components/student/StudentLayout";
import {
  BookOpen,
  GraduationCap,
  User,
  Clock,
  Video,
  Loader2,
  BookText,
  BookMarked,
  Beaker,
  Globe,
  Languages,
  Atom,
  Palette,
  ChevronLeft,
  Wallet,
  Bell,
  Home,
  Play,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileData {
  full_name: string;
  student_code: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
  avatar_url: string | null;
}

interface UsageStats {
  totalMinutes: number;
  lessonsWatched: number;
}

interface WalletData {
  balance: number;
}

interface UnreadCount {
  count: number;
}

interface LastWatchedContent {
  id: string;
  title: string;
  type: string;
  file_url: string;
  subject_name?: string;
  duration?: string;
}

interface SubscribedGroup {
  id: string;
  group_id: string;
  group_title: string;
  group_image?: string | null;
  subject_name: string;
  teacher_name: string;
  month_label?: string | null;
  purchased_at: string;
}

const getCategoryButtons = (stage: string, section: string | null) => {
  if (stage === "preparatory") {
    return [
      { id: "arabic", name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
      { id: "religious", name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
      { id: "science", name: "العلوم", icon: Beaker, gradient: "from-blue-500 via-blue-600 to-indigo-700", shadow: "shadow-blue-500/30" },
      { id: "social", name: "الدراسات", icon: Globe, gradient: "from-purple-500 via-purple-600 to-violet-700", shadow: "shadow-purple-500/30" },
      { id: "english", name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30" },
    ];
  }
  if (stage === "secondary" && section === "scientific") {
    return [
      { id: "arabic", name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
      { id: "religious", name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
      { id: "scientific", name: "المواد العلمية", icon: Atom, gradient: "from-cyan-500 via-cyan-600 to-blue-700", shadow: "shadow-cyan-500/30" },
      { id: "english", name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30" },
    ];
  }
  if (stage === "secondary" && section === "literary") {
    return [
      { id: "arabic", name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
      { id: "religious", name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
      { id: "literary", name: "المواد الأدبية", icon: Palette, gradient: "from-indigo-500 via-indigo-600 to-purple-700", shadow: "shadow-indigo-500/30" },
      { id: "english", name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30" },
      { id: "french", name: "الفرنسية", icon: Globe, gradient: "from-sky-500 via-sky-600 to-blue-700", shadow: "shadow-sky-500/30" },
    ];
  }
  return [
    { id: "arabic", name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
    { id: "religious", name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
  ];
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats>({ totalMinutes: 0, lessonsWatched: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [walletData, setWalletData] = useState<WalletData>({ balance: 0 });
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastWatched, setLastWatched] = useState<LastWatchedContent | null>(null);
  const [subscribedGroups, setSubscribedGroups] = useState<SubscribedGroup[]>([]);

  // Onboarding state
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        // Fetch profile
        const { data: profile } = await supabase.from("profiles").select("full_name, student_code, stage, grade, section, avatar_url").eq("id", user.id).maybeSingle();
        if (profile) {
          setProfileData(profile);
          setNeedsOnboarding(!profile.stage || !profile.grade);
        }

        // Fetch usage stats
        const { data: usageLogs } = await supabase.from("usage_logs").select("duration_minutes, action").eq("user_id", user.id);
        if (usageLogs) {
          const totalMinutes = usageLogs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0);
          const lessonsWatched = usageLogs.filter(log => log.action === "watch_video").length;
          setUsageStats({ totalMinutes, lessonsWatched });
        }

        // Fetch wallet
        const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
        if (wallet) setWalletData({ balance: wallet.balance });

        // Fetch unread notifications count
        const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
          .or(`user_id.eq.${user.id},user_id.is.null`)
          .eq("is_read", false);
        setUnreadCount(count || 0);

        // Fetch last watched content
        const { data: lastLog } = await supabase.from("usage_logs")
          .select("content_id, created_at")
          .eq("user_id", user.id)
          .eq("action", "watch_video")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastLog?.content_id) {
          const { data: contentData } = await supabase.from("content")
            .select("id, title, type, file_url, duration, subject_id")
            .eq("id", lastLog.content_id)
            .maybeSingle();
          if (contentData) {
            const { data: subjectData } = await supabase.from("subjects").select("name").eq("id", contentData.subject_id).maybeSingle();
            setLastWatched({
              ...contentData,
              subject_name: subjectData?.name || "",
            });
          }
        }

        // Fetch subscribed groups
        const { data: purchases } = await supabase.from("student_group_purchases")
          .select("id, group_id, purchased_at")
          .eq("student_id", user.id)
          .order("purchased_at", { ascending: false });

        if (purchases && purchases.length > 0) {
          const groupIds = purchases.map(p => p.group_id);
          const { data: groups } = await supabase.from("content_groups")
            .select("id, title, image_url, month_label, subject_id, teacher_id")
            .in("id", groupIds);

          if (groups) {
            const subjectIds = [...new Set(groups.map(g => g.subject_id))];
            const teacherIds = [...new Set(groups.map(g => g.teacher_id).filter(Boolean))];

            const { data: subjects } = await supabase.from("subjects").select("id, name").in("id", subjectIds);
            const { data: teachers } = teacherIds.length > 0
              ? await supabase.from("profiles").select("id, full_name").in("id", teacherIds)
              : { data: [] };

            const subjectMap = Object.fromEntries((subjects || []).map(s => [s.id, s.name]));
            const teacherMap = Object.fromEntries((teachers || []).map(t => [t.id, t.full_name]));

            const enriched: SubscribedGroup[] = purchases.map(p => {
              const g = groups.find(gr => gr.id === p.group_id);
              return {
                id: p.id,
                group_id: p.group_id,
                group_title: g?.title || "",
                group_image: g?.image_url,
                subject_name: subjectMap[g?.subject_id || ""] || "",
                teacher_name: teacherMap[g?.teacher_id || ""] || "غير معروف",
                month_label: g?.month_label,
                purchased_at: p.purchased_at,
              };
            }).filter(g => g.group_title);

            setSubscribedGroups(enriched);
          }
        }
      } catch (error) { console.error(error); } finally { setIsLoading(false); }
    };
    fetchData();
  }, [user]);

  const stages = [
    { id: "preparatory", name: "المرحلة الإعدادية", icon: "📚", description: "الصفوف الأول والثاني والثالث الإعدادي" },
    { id: "secondary", name: "المرحلة الثانوية", icon: "🎓", description: "الصفوف الأول والثاني والثالث الثانوي" },
  ];
  const grades = [
    { id: "first", name: "الصف الأول", icon: "1️⃣" },
    { id: "second", name: "الصف الثاني", icon: "2️⃣" },
    { id: "third", name: "الصف الثالث", icon: "3️⃣" },
  ];
  const sections = [
    { id: "scientific", name: "القسم العلمي", icon: "🔬", description: "الرياضيات والفيزياء والكيمياء" },
    { id: "literary", name: "القسم الأدبي", icon: "📖", description: "التاريخ والجغرافيا والفلسفة" },
  ];

  const handleStageSelect = (stageId: string) => { setSelectedStage(stageId); setSelectedGrade(null); setSelectedSection(null); };
  const handleGradeSelect = async (gradeId: string) => {
    setSelectedGrade(gradeId);
    if (selectedStage === "preparatory") await saveOnboarding(selectedStage, gradeId, null);
    else setSelectedSection(null);
  };
  const handleSectionSelect = async (sectionId: string) => {
    setSelectedSection(sectionId);
    if (selectedStage && selectedGrade) await saveOnboarding(selectedStage, selectedGrade, sectionId);
  };

  const saveOnboarding = async (stage: string, grade: string, section: string | null) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ stage, grade, section: section || null }).eq("id", user.id);
      if (error) { toast({ title: "خطأ", description: "حدث خطأ أثناء حفظ البيانات", variant: "destructive" }); return; }
      setProfileData(prev => prev ? { ...prev, stage, grade, section } : null);
      setNeedsOnboarding(false);
      toast({ title: "تم الحفظ", description: "تم حفظ بياناتك بنجاح" });
    } catch (error) { console.error(error); } finally { setIsSaving(false); }
  };

  const handleBack = () => {
    if (selectedSection) setSelectedSection(null);
    else if (selectedGrade) setSelectedGrade(null);
    else if (selectedStage) setSelectedStage(null);
  };

  const handleCategoryClick = (categoryId: string) => {
    if (!profileData?.stage || !profileData?.grade) return;
    navigate(`/subjects?stage=${profileData.stage}&grade=${profileData.grade}${profileData.section ? `&section=${profileData.section}` : ""}&category=${categoryId}`);
  };

  const formatTime = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return { hours, minutes };
  };

  const time = formatTime(usageStats.totalMinutes);
  const categoryButtons = profileData?.stage ? getCategoryButtons(profileData.stage, profileData.section) : [];

  if (isLoading) {
    return (
      <StudentLayout title="الصفحة الرئيسية">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout title="الصفحة الرئيسية">
      <div className="p-3 lg:p-6 max-w-full overflow-x-hidden pb-28">

        {/* ===== أزرار المحفظة والإشعارات ===== */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {/* زر المحفظة */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card
              className="cursor-pointer border-0 overflow-hidden relative group hover:scale-[1.02] transition-all duration-300"
              onClick={() => navigate("/wallet")}
              style={{
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute -top-6 -left-6 w-24 h-24 bg-white/10 rounded-full blur-xl" />
              <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-white/10 rounded-full blur-lg" />
              <CardContent className="p-4 flex items-center gap-3 relative">
                <div className="p-2.5 rounded-2xl bg-white/20 backdrop-blur-sm shadow-inner">
                  <Wallet className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white/70 font-medium">رصيد المحفظة</p>
                  <p className="text-xl font-bold text-white tracking-wide">{walletData.balance.toFixed(0)} ج.م</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* زر الإشعارات */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <Card
              className="cursor-pointer border-0 overflow-hidden relative group hover:scale-[1.02] transition-all duration-300"
              onClick={() => navigate("/notifications")}
              style={{
                background: "linear-gradient(135deg, #f5af19 0%, #f12711 100%)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-xl" />
              <CardContent className="p-4 flex items-center gap-3 relative">
                <div className="p-2.5 rounded-2xl bg-white/20 backdrop-blur-sm shadow-inner relative">
                  <Bell className="h-6 w-6 text-white" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-red-600 text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg animate-pulse">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white/70 font-medium">الإشعارات</p>
                  <p className="text-xl font-bold text-white">
                    {unreadCount > 0 ? `${unreadCount} جديد` : "لا يوجد"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* شريط الحالة */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 lg:gap-4 mb-6 lg:mb-10">
          <Card className="border-0 bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground shadow-xl shadow-primary/20 overflow-hidden relative">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0tNCA2aC0ydi00aDJ2NHptMC02aC0ydi00aDJ2NHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
            <CardContent className="p-3 lg:p-5 flex items-center gap-3 lg:gap-4 relative">
              <div className="p-2 lg:p-3 rounded-xl bg-white/20 backdrop-blur flex-shrink-0">
                <User className="h-5 w-5 lg:h-6 lg:w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs lg:text-sm text-primary-foreground/80">كود الطالب</p>
                <p className="text-lg lg:text-2xl font-bold tracking-wider truncate">{profileData?.student_code || "---"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-amber-500 via-amber-500 to-orange-500 text-white shadow-xl shadow-amber-500/20 overflow-hidden relative">
            <div className="absolute inset-0 opacity-30" />
            <CardContent className="p-3 lg:p-5 flex items-center gap-3 lg:gap-4 relative">
              <div className="p-2 lg:p-3 rounded-xl bg-white/20 backdrop-blur flex-shrink-0">
                <Clock className="h-5 w-5 lg:h-6 lg:w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs lg:text-sm text-white/80">وقت التعلم</p>
                <p className="text-lg lg:text-2xl font-bold truncate">
                  {time.hours > 0 && `${time.hours} س `}{time.minutes} د
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 text-white shadow-xl shadow-violet-500/20 overflow-hidden relative sm:col-span-2 md:col-span-1">
            <CardContent className="p-3 lg:p-5 flex items-center gap-3 lg:gap-4 relative">
              <div className="p-2 lg:p-3 rounded-xl bg-white/20 backdrop-blur flex-shrink-0">
                <Video className="h-5 w-5 lg:h-6 lg:w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs lg:text-sm text-white/80">الدروس المشاهدة</p>
                <p className="text-lg lg:text-2xl font-bold">{usageStats.lessonsWatched} درس</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* أقسام المواد */}
        {!needsOnboarding && profileData?.stage && profileData?.grade && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="mb-4 lg:mb-8">
              <h2 className="text-xl lg:text-3xl font-bold text-foreground mb-1 lg:mb-2 flex items-center gap-2 lg:gap-3">
                <div className="p-1.5 lg:p-2 rounded-lg lg:rounded-xl bg-primary/10">
                  <BookOpen className="h-5 w-5 lg:h-8 lg:w-8 text-primary" />
                </div>
                <span className="truncate">أقسام المواد</span>
              </h2>
              <p className="text-muted-foreground text-sm lg:text-lg">اختر القسم للوصول إلى المواد الدراسية</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 lg:gap-6">
              {categoryButtons.map((category, i) => {
                const IconComponent = category.icon;
                return (
                  <motion.div
                    key={category.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.25 + i * 0.05 }}
                  >
                    <Card
                      className={`cursor-pointer border-0 bg-gradient-to-br ${category.gradient} text-white shadow-xl ${category.shadow} hover:shadow-2xl transition-all duration-500 hover:scale-105 hover:-translate-y-2 group overflow-hidden relative`}
                      onClick={() => handleCategoryClick(category.id)}
                    >
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                      <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                      <CardContent className="p-4 lg:p-8 text-center relative">
                        <div className="w-12 h-12 lg:w-20 lg:h-20 mx-auto mb-2 lg:mb-5 rounded-xl lg:rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
                          <IconComponent className="h-6 w-6 lg:h-10 lg:w-10" />
                        </div>
                        <h3 className="text-sm lg:text-xl font-bold tracking-wide truncate">{category.name}</h3>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>

            {/* ===== أكمل التعلم ===== */}
            {lastWatched && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-8"
              >
                <h2 className="text-lg lg:text-2xl font-bold text-foreground mb-3 flex items-center gap-2">
                  <Play className="h-5 w-5 text-primary" />
                  أكمل التعلم
                </h2>
                <Card
                  className="cursor-pointer border-0 overflow-hidden group hover:shadow-xl transition-all duration-300"
                  onClick={() => {
                    if (lastWatched.type === "video") {
                      window.open(lastWatched.file_url, "_blank");
                    }
                  }}
                  style={{
                    background: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)",
                  }}
                >
                  <CardContent className="p-4 flex items-center gap-4 relative">
                    <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <Play className="h-7 w-7 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-base truncate">{lastWatched.title}</p>
                      <p className="text-white/60 text-xs mt-0.5">{lastWatched.subject_name}</p>
                      {lastWatched.duration && (
                        <p className="text-cyan-300/80 text-[11px] mt-1">المدة: {lastWatched.duration}</p>
                      )}
                    </div>
                    <ChevronLeft className="h-5 w-5 text-white/40 flex-shrink-0" />
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ===== الدروس المشترك بها ===== */}
            {subscribedGroups.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-8"
              >
                <h2 className="text-lg lg:text-2xl font-bold text-foreground mb-3 flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-secondary" />
                  دروسي المشترك بها
                  <Badge className="mr-1 bg-secondary/20 text-secondary border-0 text-xs">{subscribedGroups.length}</Badge>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {subscribedGroups.map((group, i) => (
                    <motion.div
                      key={group.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.55 + i * 0.05 }}
                    >
                      <Card
                        className="cursor-pointer border border-border/50 overflow-hidden group hover:shadow-lg hover:border-primary/30 transition-all duration-300"
                        onClick={() => navigate("/subjects")}
                      >
                        <CardContent className="p-0 flex items-stretch">
                          {/* Color strip */}
                          <div className="w-2 bg-gradient-to-b from-primary via-secondary to-primary/60 flex-shrink-0" />
                          <div className="p-3 flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-foreground text-sm truncate">{group.group_title}</p>
                                <p className="text-muted-foreground text-xs mt-0.5 truncate">{group.subject_name}</p>
                              </div>
                              {group.month_label && (
                                <Badge variant="secondary" className="text-[10px] px-2 py-0.5 flex-shrink-0">
                                  {group.month_label}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[11px] text-muted-foreground">المعلم: {group.teacher_name}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Onboarding */}
        {needsOnboarding && (
          <div className="max-w-4xl mx-auto px-2">
            <div className="mb-6 lg:mb-10">
              <div className="flex items-center justify-center gap-2 lg:gap-4 mb-4 lg:mb-6">
                <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl flex items-center justify-center text-sm lg:text-lg font-bold transition-all duration-300 ${!selectedStage ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 scale-110' : 'bg-primary/20 text-primary'}`}>١</div>
                <div className={`w-12 lg:w-20 h-1 lg:h-1.5 rounded-full transition-all duration-500 ${selectedStage ? 'bg-gradient-to-r from-primary to-primary/50' : 'bg-muted'}`} />
                <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl flex items-center justify-center text-sm lg:text-lg font-bold transition-all duration-300 ${selectedStage && !selectedGrade ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 scale-110' : selectedGrade ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>٢</div>
                {selectedStage === "secondary" && (
                  <>
                    <div className={`w-12 lg:w-20 h-1 lg:h-1.5 rounded-full transition-all duration-500 ${selectedGrade ? 'bg-gradient-to-r from-primary to-primary/50' : 'bg-muted'}`} />
                    <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl flex items-center justify-center text-sm lg:text-lg font-bold transition-all duration-300 ${selectedGrade && !selectedSection ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 scale-110' : selectedSection ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>٣</div>
                  </>
                )}
              </div>
            </div>

            {(selectedStage || selectedGrade || selectedSection) && (
              <Button variant="ghost" className="mb-4 lg:mb-6 hover:bg-accent text-sm" onClick={handleBack} disabled={isSaving}>
                <ChevronLeft className="h-4 w-4 lg:h-5 lg:w-5 rotate-180 ml-1" />
                رجوع
              </Button>
            )}

            {!selectedStage && (
              <div className="animate-fade-in">
                <div className="text-center mb-6 lg:mb-10">
                  <div className="inline-flex items-center justify-center w-14 h-14 lg:w-20 lg:h-20 rounded-2xl lg:rounded-3xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground mb-4 lg:mb-6 shadow-xl shadow-primary/30">
                    <GraduationCap className="h-7 w-7 lg:h-10 lg:w-10" />
                  </div>
                  <h2 className="text-xl lg:text-3xl font-bold text-foreground mb-2">اختر مرحلتك الدراسية</h2>
                  <p className="text-muted-foreground text-sm lg:text-lg">هذا الاختيار سيحدد المواد التي ستظهر لك</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-8">
                  {stages.map((stage) => (
                    <Card key={stage.id} className="cursor-pointer border-2 border-transparent hover:border-primary/50 hover:shadow-2xl transition-all duration-300 group" onClick={() => handleStageSelect(stage.id)}>
                      <CardContent className="p-6 lg:p-10 text-center">
                        <div className="text-5xl lg:text-7xl mb-4 lg:mb-6 group-hover:scale-110 transition-transform duration-300">{stage.icon}</div>
                        <h3 className="text-lg lg:text-2xl font-bold text-foreground mb-1">{stage.name}</h3>
                        <p className="text-muted-foreground text-xs lg:text-base">{stage.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {selectedStage && !selectedGrade && (
              <div className="animate-fade-in">
                <div className="text-center mb-6 lg:mb-10">
                  <div className="inline-flex items-center justify-center w-14 h-14 lg:w-20 lg:h-20 rounded-2xl lg:rounded-3xl bg-gradient-to-br from-amber-500 to-orange-500 text-white mb-4 lg:mb-6 shadow-xl shadow-amber-500/30">
                    <BookOpen className="h-7 w-7 lg:h-10 lg:w-10" />
                  </div>
                  <h2 className="text-xl lg:text-3xl font-bold text-foreground mb-2">اختر صفك الدراسي</h2>
                </div>
                <div className="grid grid-cols-3 gap-3 lg:gap-6">
                  {grades.map((grade) => (
                    <Card key={grade.id} className="cursor-pointer border-2 border-transparent hover:border-amber-500/50 hover:shadow-2xl transition-all duration-300 group" onClick={() => handleGradeSelect(grade.id)}>
                      <CardContent className="p-4 lg:p-8 text-center">
                        <div className="text-4xl lg:text-6xl mb-2 lg:mb-4 group-hover:scale-110 transition-transform duration-300">{grade.icon}</div>
                        <h3 className="text-sm lg:text-xl font-bold text-foreground truncate">{grade.name}</h3>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {isSaving && <div className="mt-6 text-center"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
              </div>
            )}

            {selectedStage === "secondary" && selectedGrade && !selectedSection && (
              <div className="animate-fade-in">
                <div className="text-center mb-6 lg:mb-10">
                  <div className="inline-flex items-center justify-center w-14 h-14 lg:w-20 lg:h-20 rounded-2xl lg:rounded-3xl bg-gradient-to-br from-violet-500 to-purple-600 text-white mb-4 lg:mb-6 shadow-xl shadow-violet-500/30">
                    <Beaker className="h-7 w-7 lg:h-10 lg:w-10" />
                  </div>
                  <h2 className="text-xl lg:text-3xl font-bold text-foreground mb-2">اختر شعبتك</h2>
                </div>
                <div className="grid grid-cols-2 gap-4 lg:gap-8">
                  {sections.map((section) => (
                    <Card key={section.id} className="cursor-pointer border-2 border-transparent hover:border-violet-500/50 hover:shadow-2xl transition-all duration-300 group" onClick={() => handleSectionSelect(section.id)}>
                      <CardContent className="p-6 lg:p-10 text-center">
                        <div className="text-5xl lg:text-7xl mb-4 lg:mb-6 group-hover:scale-110 transition-transform duration-300">{section.icon}</div>
                        <h3 className="text-lg lg:text-2xl font-bold text-foreground mb-1">{section.name}</h3>
                        <p className="text-muted-foreground text-xs lg:text-base">{section.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {isSaving && <div className="mt-6 text-center"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== شريط التنقل السفلي ===== */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
        <div
          className="mx-3 mb-3 rounded-2xl shadow-2xl border border-white/10 backdrop-blur-xl"
          style={{
            background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95))",
          }}
        >
          <div className="flex items-center justify-around py-2 px-1">
            {/* الصفحة الرئيسية */}
            <button
              onClick={() => navigate("/dashboard")}
              className="flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-all duration-200 text-white"
            >
              <Home className="h-5 w-5 text-cyan-400" />
              <span className="text-[10px] font-medium text-cyan-300">الرئيسية</span>
            </button>

            {/* أكمل التعلم */}
            <button
              onClick={() => {
                if (lastWatched?.file_url) {
                  window.open(lastWatched.file_url, "_blank");
                } else {
                  toast({ title: "لا يوجد", description: "لم تشاهد أي درس بعد" });
                }
              }}
              className="flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-all duration-200"
            >
              <div className="relative">
                <Play className="h-5 w-5 text-emerald-400" />
              </div>
              <span className="text-[10px] font-medium text-emerald-300">أكمل</span>
            </button>

            {/* دروسي المشترك بها */}
            <button
              onClick={() => navigate("/subjects")}
              className="flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-all duration-200 relative"
            >
              <FolderOpen className="h-5 w-5 text-amber-400" />
              {subscribedGroups.length > 0 && (
                <span className="absolute -top-0.5 right-1 w-4 h-4 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                  {subscribedGroups.length}
                </span>
              )}
              <span className="text-[10px] font-medium text-amber-300">دروسي</span>
            </button>
          </div>
        </div>
      </div>
    </StudentLayout>
  );
};

export default Dashboard;
