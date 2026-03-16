import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import StudentLayout from "@/components/student/StudentLayout";
import {
  BookOpen, GraduationCap, User, Clock, Loader2,
  BookText, BookMarked, Beaker, Globe, Languages, Atom, Palette,
  ChevronLeft, Wallet, Bell, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

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

const getCategoryButtons = (stage: string, section: string | null) => {
  if (stage === "preparatory") {
    return [
      { id: "arabic", name: "العربية", icon: BookText, color: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" },
      { id: "religious", name: "الشرعية", icon: BookMarked, color: "bg-amber-500", text: "text-amber-600", bg: "bg-amber-50" },
      { id: "science", name: "العلوم", icon: Beaker, color: "bg-blue-500", text: "text-blue-600", bg: "bg-blue-50" },
      { id: "social", name: "الدراسات", icon: Globe, color: "bg-purple-500", text: "text-purple-600", bg: "bg-purple-50" },
      { id: "english", name: "English", icon: Languages, color: "bg-rose-500", text: "text-rose-600", bg: "bg-rose-50" },
    ];
  }
  if (stage === "secondary" && section === "scientific") {
    return [
      { id: "arabic", name: "العربية", icon: BookText, color: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" },
      { id: "religious", name: "الشرعية", icon: BookMarked, color: "bg-amber-500", text: "text-amber-600", bg: "bg-amber-50" },
      { id: "scientific", name: "العلمية", icon: Atom, color: "bg-cyan-500", text: "text-cyan-600", bg: "bg-cyan-50" },
      { id: "english", name: "English", icon: Languages, color: "bg-rose-500", text: "text-rose-600", bg: "bg-rose-50" },
    ];
  }
  if (stage === "secondary" && section === "literary") {
    return [
      { id: "arabic", name: "العربية", icon: BookText, color: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" },
      { id: "religious", name: "الشرعية", icon: BookMarked, color: "bg-amber-500", text: "text-amber-600", bg: "bg-amber-50" },
      { id: "literary", name: "الأدبية", icon: Palette, color: "bg-indigo-500", text: "text-indigo-600", bg: "bg-indigo-50" },
      { id: "english", name: "English", icon: Languages, color: "bg-rose-500", text: "text-rose-600", bg: "bg-rose-50" },
      { id: "french", name: "Français", icon: Globe, color: "bg-sky-500", text: "text-sky-600", bg: "bg-sky-50" },
    ];
  }
  return [
    { id: "arabic", name: "العربية", icon: BookText, color: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" },
    { id: "religious", name: "الشرعية", icon: BookMarked, color: "bg-amber-500", text: "text-amber-600", bg: "bg-amber-50" },
  ];
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats>({ totalMinutes: 0, lessonsWatched: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        const { data: profile } = await supabase.from("profiles").select("full_name, student_code, stage, grade, section, avatar_url").eq("id", user.id).maybeSingle();
        if (profile) { setProfileData(profile); setNeedsOnboarding(!profile.stage || !profile.grade); }
        const { data: usageLogs } = await supabase.from("usage_logs").select("duration_minutes, action").eq("user_id", user.id);
        if (usageLogs) {
          const totalMinutes = usageLogs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0);
          const lessonsWatched = usageLogs.filter(log => log.action === "watch_video").length;
          setUsageStats({ totalMinutes, lessonsWatched });
        }
        const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
        if (wallet) setWalletBalance(wallet.balance);
        const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
          .or(`user_id.eq.${user.id},user_id.is.null`).eq("is_read", false);
        setUnreadCount(count || 0);
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

  const headerActions = (
    <div className="flex items-center gap-1">
      <button onClick={() => navigate("/wallet")}
        className="relative flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-violet-500/15 to-purple-500/15 hover:from-violet-500/25 hover:to-purple-500/25 transition-all">
        <Wallet className="h-3.5 w-3.5 text-violet-600" />
        <span className="text-[11px] font-bold text-violet-700">{walletBalance.toFixed(0)} ج</span>
      </button>
      <button onClick={() => navigate("/notifications")}
        className="relative p-1.5 rounded-full hover:bg-accent transition-colors">
        <Bell className="h-4 w-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <StudentLayout title="الرئيسية" headerActions={headerActions}>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout title="الرئيسية" headerActions={headerActions}>
      <div className="p-3 space-y-3 pb-20 lg:pb-4">

        {/* Space for future banner */}
        <div className="h-2" />

        {/* Quick Stats Row */}
        <div className="flex gap-2">
          <motion.div className="flex-1" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                <User className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] text-blue-400 font-medium">كود الطالب</p>
                <p className="text-sm font-bold text-blue-700 tracking-wide truncate">{profileData?.student_code || "---"}</p>
              </div>
            </div>
          </motion.div>

          <motion.div className="flex-1" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                <Clock className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] text-amber-400 font-medium">وقت التعلم</p>
                <p className="text-sm font-bold text-amber-700 truncate">
                  {time.hours > 0 && `${time.hours}س `}{time.minutes}د
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Category Grid */}
        {!needsOnboarding && profileData?.stage && profileData?.grade && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">أقسام المواد</h2>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {categoryButtons.map((cat, i) => {
                const Icon = cat.icon;
                return (
                  <motion.button
                    key={cat.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15 + i * 0.04 }}
                    onClick={() => handleCategoryClick(cat.id)}
                    className={`${cat.bg} border border-border/40 rounded-xl p-3 flex flex-col items-center gap-1.5 hover:shadow-md active:scale-95 transition-all duration-200`}
                  >
                    <div className={`w-9 h-9 rounded-xl ${cat.color} flex items-center justify-center`}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <span className={`text-[11px] font-bold ${cat.text}`}>{cat.name}</span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Onboarding */}
        {needsOnboarding && (
          <div className="max-w-lg mx-auto">
            <div className="mb-4">
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${!selectedStage ? 'bg-primary text-primary-foreground shadow-md scale-110' : 'bg-primary/20 text-primary'}`}>١</div>
                <div className={`w-8 h-0.5 rounded-full ${selectedStage ? 'bg-primary' : 'bg-muted'}`} />
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${selectedStage && !selectedGrade ? 'bg-primary text-primary-foreground shadow-md scale-110' : selectedGrade ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>٢</div>
                {selectedStage === "secondary" && (
                  <>
                    <div className={`w-8 h-0.5 rounded-full ${selectedGrade ? 'bg-primary' : 'bg-muted'}`} />
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${selectedGrade && !selectedSection ? 'bg-primary text-primary-foreground shadow-md scale-110' : selectedSection ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>٣</div>
                  </>
                )}
              </div>
            </div>

            {(selectedStage || selectedGrade || selectedSection) && (
              <Button variant="ghost" size="sm" className="mb-3" onClick={handleBack} disabled={isSaving}>
                <ChevronLeft className="h-4 w-4 rotate-180 ml-1" /> رجوع
              </Button>
            )}

            {!selectedStage && (
              <div className="animate-fade-in">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground mb-3 shadow-lg">
                    <GraduationCap className="h-6 w-6" />
                  </div>
                  <h2 className="text-lg font-bold text-foreground">اختر مرحلتك</h2>
                  <p className="text-muted-foreground text-xs mt-0.5">سيحدد المواد التي ستظهر لك</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {stages.map((stage) => (
                    <Card key={stage.id} className="cursor-pointer border hover:border-primary/50 hover:shadow-lg transition-all" onClick={() => handleStageSelect(stage.id)}>
                      <CardContent className="p-4 text-center">
                        <div className="text-3xl mb-2">{stage.icon}</div>
                        <h3 className="text-sm font-bold text-foreground">{stage.name}</h3>
                        <p className="text-muted-foreground text-[10px] mt-0.5">{stage.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {selectedStage && !selectedGrade && (
              <div className="animate-fade-in">
                <div className="text-center mb-4">
                  <h2 className="text-lg font-bold text-foreground">اختر الصف</h2>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {grades.map((grade) => (
                    <Card key={grade.id} className="cursor-pointer border hover:border-primary/50 hover:shadow-lg transition-all" onClick={() => handleGradeSelect(grade.id)}>
                      <CardContent className="p-3 text-center">
                        <div className="text-2xl mb-1">{grade.icon}</div>
                        <h3 className="text-xs font-bold text-foreground">{grade.name}</h3>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {selectedStage === "secondary" && selectedGrade && !selectedSection && (
              <div className="animate-fade-in">
                <div className="text-center mb-4">
                  <h2 className="text-lg font-bold text-foreground">اختر القسم</h2>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {sections.map((sec) => (
                    <Card key={sec.id} className="cursor-pointer border hover:border-primary/50 hover:shadow-lg transition-all" onClick={() => handleSectionSelect(sec.id)}>
                      <CardContent className="p-4 text-center">
                        <div className="text-3xl mb-2">{sec.icon}</div>
                        <h3 className="text-sm font-bold text-foreground">{sec.name}</h3>
                        <p className="text-muted-foreground text-[10px] mt-0.5">{sec.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {isSaving && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary ml-2" />
                <span className="text-sm text-muted-foreground">جاري الحفظ...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default Dashboard;
